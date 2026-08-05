import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { entityDisplayMeta, relationMeta } from '../types'
import type { Entity, RelationType } from '../types'
import { useAsset } from '../useAsset'

interface Node {
  id: string
  entity: Entity
}
interface Edge {
  source: string
  target: string
  relation: RelationType
}
interface Pos {
  x: number
  y: number
}

/** Beziehungsgraph: Netzwerkansicht der Objekte und ihrer Verknuepfungen. */
export function RelationGraph() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const tableMode = useStore((s) => s.tableMode)
  const selectEntity = useStore((s) => s.selectEntity)
  const goToEntity = useStore((s) => s.goToEntity)
  const [onlyChars, setOnlyChars] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  // Sichtbare Objekte und Kanten bestimmen.
  const { nodes, edges } = useMemo(() => {
    const visible = campaign.entities.filter((e) => !tableMode || e.visibility === 'spieler')
    const allowed = onlyChars
      ? visible.filter((e) => e.type === 'nsc' || e.type === 'fraktion')
      : visible
    const allowedIds = new Set(allowed.map((e) => e.id))

    const edges: Edge[] = []
    for (const e of allowed) {
      for (const l of e.links) {
        if (allowedIds.has(l.targetId)) {
          edges.push({ source: e.id, target: l.targetId, relation: l.relation })
        }
      }
    }
    const connected = new Set<string>()
    edges.forEach((ed) => {
      connected.add(ed.source)
      connected.add(ed.target)
    })
    const nodes: Node[] = allowed.filter((e) => connected.has(e.id)).map((e) => ({ id: e.id, entity: e }))
    return { nodes, edges }
  }, [campaign.entities, tableMode, onlyChars])

  const graphKey = useMemo(
    () => nodes.map((n) => n.id).join(',') + '|' + edges.map((e) => `${e.source}>${e.target}`).join(','),
    [nodes, edges],
  )

  const [positions, setPositions] = useState<Record<string, Pos>>({})
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })

  // Layout berechnen und einpassen, wenn sich der Graph aendert.
  useEffect(() => {
    const pos = computeLayout(nodes, edges)
    setPositions(pos)
    const el = containerRef.current
    if (el && nodes.length > 0) {
      const xs = nodes.map((n) => pos[n.id].x)
      const ys = nodes.map((n) => pos[n.id].y)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      const pad = 90
      const gw = maxX - minX + pad * 2
      const gh = maxY - minY + pad * 2
      const scale = Math.min(el.clientWidth / gw, el.clientHeight / gh, 1.4)
      setView({
        scale,
        tx: el.clientWidth / 2 - ((minX + maxX) / 2) * scale,
        ty: el.clientHeight / 2 - ((minY + maxY) / 2) * scale,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey])

  // Pan (Hintergrund ziehen) und Zoom (Rad).
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  function onBgPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
  }
  function onBgPointerMove(e: React.PointerEvent) {
    const p = pan.current
    const d = dragNode.current
    if (d) {
      const dx = (e.clientX - d.lastX) / view.scale
      const dy = (e.clientY - d.lastY) / view.scale
      d.lastX = e.clientX
      d.lastY = e.clientY
      setPositions((prev) => ({ ...prev, [d.id]: { x: prev[d.id].x + dx, y: prev[d.id].y + dy } }))
      return
    }
    if (p) setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }))
  }
  function onBgPointerUp(e: React.PointerEvent) {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    pan.current = null
    dragNode.current = null
  }
  function onWheel(e: React.WheelEvent) {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    setView((v) => {
      const scale = Math.max(0.2, Math.min(3, v.scale * Math.exp(-e.deltaY * 0.0015)))
      const k = scale / v.scale
      return { scale, tx: sx - (sx - v.tx) * k, ty: sy - (sy - v.ty) * k }
    })
  }

  const dragNode = useRef<{ id: string; lastX: number; lastY: number; moved: boolean } | null>(null)
  function onNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragNode.current = { id, lastX: e.clientX, lastY: e.clientY, moved: false }
  }
  function onNodePointerMove(e: React.PointerEvent) {
    const d = dragNode.current
    if (!d) return
    const dx = (e.clientX - d.lastX) / view.scale
    const dy = (e.clientY - d.lastY) / view.scale
    if (Math.abs(dx) + Math.abs(dy) > 0.5) d.moved = true
    d.lastX = e.clientX
    d.lastY = e.clientY
    setPositions((prev) => ({ ...prev, [d.id]: { x: prev[d.id].x + dx, y: prev[d.id].y + dy } }))
  }
  function onNodePointerUp(e: React.PointerEvent, id: string) {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    const moved = dragNode.current?.moved
    dragNode.current = null
    if (!moved) openEntity(id)
  }

  function openEntity(id: string) {
    goToEntity(id)
    selectEntity(id)
  }

  const ready = Object.keys(positions).length === nodes.length

  return (
    <div className="graph">
      <div className="graph__header">
        <h2 className="graph__title">Beziehungsgraph</h2>
        <span className="graph__meta">
          {nodes.length} Objekte · {edges.length} Beziehungen
        </span>
        <label className="graph__filter">
          <input type="checkbox" checked={onlyChars} onChange={(e) => setOnlyChars(e.target.checked)} />
          Nur Charaktere &amp; Fraktionen
        </label>
      </div>

      {nodes.length === 0 ? (
        <p className="graph__empty">
          Keine Beziehungen vorhanden. Verknuepfe Objekte im Reiter „Objekt" nebenan.
        </p>
      ) : (
        <div
          ref={containerRef}
          className="graph__canvas"
          onPointerDown={onBgPointerDown}
          onPointerMove={(e) => {
            onBgPointerMove(e)
            onNodePointerMove(e)
          }}
          onPointerUp={onBgPointerUp}
          onWheel={onWheel}
        >
          {ready && (
            <svg className="graph__svg" width="100%" height="100%">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#6d7688" />
                </marker>
              </defs>
              <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
                {edges.map((ed, i) => {
                  const a = positions[ed.source]
                  const b = positions[ed.target]
                  if (!a || !b) return null
                  const mx = (a.x + b.x) / 2
                  const my = (a.y + b.y) / 2
                  // Kante am Knotenrand enden lassen.
                  const ang = Math.atan2(b.y - a.y, b.x - a.x)
                  const r = 26
                  const ax = a.x + Math.cos(ang) * r
                  const ay = a.y + Math.sin(ang) * r
                  const bx = b.x - Math.cos(ang) * r
                  const by = b.y - Math.sin(ang) * r
                  return (
                    <g key={i} className="graph__edge">
                      <line x1={ax} y1={ay} x2={bx} y2={by} markerEnd="url(#arrow)" />
                      <text x={mx} y={my} className="graph__edge-label" textAnchor="middle">
                        {relationMeta(ed.relation).label}
                      </text>
                    </g>
                  )
                })}
                {nodes.map((n) => {
                  const p = positions[n.id]
                  // entityDisplayMeta statt entityMeta: beruecksichtigt die Gesinnung eines
                  // Charakters (Freund gruen, Feind rot, neutral grau, Spieler dunkelgruen).
                  const meta = entityDisplayMeta(n.entity)
                  return (
                    <g
                      key={n.id}
                      className="graph__node"
                      transform={`translate(${p.x} ${p.y})`}
                      onPointerDown={(e) => onNodePointerDown(e, n.id)}
                      onPointerUp={(e) => onNodePointerUp(e, n.id)}
                    >
                      <circle r="24" fill="#1c202a" stroke={meta.color} strokeWidth="2.5" />
                      <NodeFace entity={n.entity} icon={meta.icon} iconInvert={meta.iconInvert} />
                      <text className="graph__node-label" textAnchor="middle" y="40">
                        {n.entity.name}
                      </text>
                    </g>
                  )
                })}
              </g>
            </svg>
          )}
          <div className="graph__hint">Ziehen zum Verschieben · Rad zum Zoomen · Knoten ziehen/klicken</div>
        </div>
      )}
    </div>
  )
}

/**
 * Innenleben eines Knotens: das Portraet des Objekts, rund beschnitten, sonst sein
 * Typ-Icon. Der Beschnitt braucht eine eigene clipPath je Knoten, daher als Komponente.
 */
function NodeFace({ entity, icon, iconInvert }: { entity: Entity; icon: string; iconInvert?: boolean }) {
  const image = useAsset(entity.thumbUrl ?? entity.imageUrl)
  if (!image) {
    return (
      <text className={`graph__node-icon${iconInvert ? ' is-icon-invert' : ''}`} textAnchor="middle" dy="6">
        {icon}
      </text>
    )
  }
  const clipId = `nodeclip-${entity.id}`
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <circle r="22" />
        </clipPath>
      </defs>
      <image
        href={image}
        x="-22"
        y="-22"
        width="44"
        height="44"
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#${clipId})`}
      />
    </>
  )
}

/** Einfaches kraftbasiertes Layout (Fruchterman-Reingold-Variante). */
function computeLayout(nodes: Node[], edges: Edge[]): Record<string, Pos> {
  const N = nodes.length
  const pos: Record<string, { x: number; y: number; vx: number; vy: number }> = {}
  nodes.forEach((n, i) => {
    const a = (i / Math.max(1, N)) * Math.PI * 2
    pos[n.id] = { x: Math.cos(a) * 220 + (i % 3) * 8, y: Math.sin(a) * 220 + (i % 5) * 6, vx: 0, vy: 0 }
  })
  if (N === 0) return {}

  const k = 130 // ideale Kantenlaenge
  const iterations = 400
  for (let it = 0; it < iterations; it++) {
    const cooling = 1 - it / iterations
    // Abstossung zwischen allen Knoten
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = pos[nodes[i].id]
        const b = pos[nodes[j].id]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let d2 = dx * dx + dy * dy
        if (d2 < 0.01) {
          dx = Math.random() - 0.5
          dy = Math.random() - 0.5
          d2 = 0.01
        }
        const d = Math.sqrt(d2)
        const rep = (k * k) / d
        const fx = (dx / d) * rep
        const fy = (dy / d) * rep
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
    }
    // Anziehung entlang der Kanten
    for (const e of edges) {
      const a = pos[e.source]
      const b = pos[e.target]
      if (!a || !b) continue
      const dx = a.x - b.x
      const dy = a.y - b.y
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01
      const att = (d * d) / k
      const fx = (dx / d) * att
      const fy = (dy / d) * att
      a.vx -= fx
      a.vy -= fy
      b.vx += fx
      b.vy += fy
    }
    // Schwerkraft zur Mitte + Integration
    for (const n of nodes) {
      const p = pos[n.id]
      p.vx -= p.x * 0.012
      p.vy -= p.y * 0.012
      const step = cooling * 0.08
      p.x += Math.max(-40, Math.min(40, p.vx)) * step
      p.y += Math.max(-40, Math.min(40, p.vy)) * step
      p.vx *= 0.85
      p.vy *= 0.85
    }
  }
  const out: Record<string, Pos> = {}
  for (const n of nodes) out[n.id] = { x: pos[n.id].x, y: pos[n.id].y }
  return out
}
