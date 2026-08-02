import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { entityDisplayMeta } from '../types'
import { dayNightOverlay, inWindow } from '../utils/time'
import { useAsset } from '../useAsset'
import { PlaceholderMap } from './PlaceholderMap'
import { MapPin } from './MapPin'

interface View {
  scale: number
  tx: number
  ty: number
}

const MIN_SCALE = 0.1
const MAX_SCALE = 6
const DRAG_THRESHOLD = 4

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 })
  const [fitted, setFitted] = useState(false)

  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const layer = campaign.layers.find((l) => l.id === campaign.activeLayerId) ?? campaign.layers[0]
  const entities = campaign.entities
  const tool = useStore((s) => s.tool)
  const pendingType = useStore((s) => s.pendingEntityType)
  const pendingFields = useStore((s) => s.pendingEntityFields)
  // Spieler-Sicht gilt im Spielermodus UND im Spieltischmodus.
  const playerView = useStore((s) => s.playerMode || s.tableMode)
  const placingEntityId = useStore((s) => s.placingEntityId)
  const addEntity = useStore((s) => s.addEntity)
  const setPlacement = useStore((s) => s.setPlacement)
  const setPlacingEntity = useStore((s) => s.setPlacingEntity)
  const moveEntity = useStore((s) => s.moveEntity)
  const selectEntity = useStore((s) => s.selectEntity)
  const selectedIds = useStore((s) => s.selectedIds)
  const setSelectedIds = useStore((s) => s.setSelectedIds)
  const toggleSelectedId = useStore((s) => s.toggleSelectedId)
  const setTool = useStore((s) => s.setTool)
  const timeEnabled = useStore((s) => s.timeEnabled)
  const timeOfDay = useStore((s) => s.timeOfDay)
  const dayNight = useStore((s) => s.dayNight)
  const fogEditing = useStore((s) => s.fogEditing)
  const fogBrush = useStore((s) => s.fogBrush)
  const addReveal = useStore((s) => s.addReveal)

  const { width, height } = layer
  const mapImage = useAsset(layer.imageUrl)

  // Auf der aktiven Ebene platzierte Objekte (in der Spieler-Sicht nur entdeckte,
  // bei aktivem Tageszeit-Filter nur die zur eingestellten Uhrzeit aktiven).
  const pins = entities.filter(
    (e) =>
      e.placement &&
      e.placement.layerId === layer.id &&
      (!playerView || e.visibility === 'spieler') &&
      (!timeEnabled || inWindow(timeOfDay, e.timeStart, e.timeEnd)),
  )

  const fitToView = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const cw = el.clientWidth
    const ch = el.clientHeight
    if (cw === 0 || ch === 0) return
    const scale = Math.min(cw / width, ch / height) * 0.92
    setView({ scale, tx: (cw - width * scale) / 2, ty: (ch - height * scale) / 2 })
  }, [width, height])

  useEffect(() => {
    if (!fitted) {
      fitToView()
      setFitted(true)
    }
  }, [fitted, fitToView])

  // Beim Kampagnen-/Ebenenwechsel neu einpassen.
  useEffect(() => {
    fitToView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, layer.id])

  const onWheel = useCallback((e: React.WheelEvent) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    setView((v) => {
      const factor = Math.exp(-e.deltaY * 0.0015)
      const newScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
      const k = newScale / v.scale
      return { scale: newScale, tx: sx - (sx - v.tx) * k, ty: sy - (sy - v.ty) * k }
    })
  }, [])

  // Rechte Maustaste: Karte verschieben.
  const drag = useRef<{ startX: number; startY: number; origTx: number; origTy: number; moved: boolean } | null>(null)
  // Linke Maustaste auf leerer Flaeche: Rechteck-Markierung.
  const marquee = useRef<{ startX: number; startY: number; moved: boolean } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const painting = useRef(false)

  // Bildschirm- zu Weltkoordinaten der aktiven Ansicht.
  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current!
      const rect = el.getBoundingClientRect()
      return {
        wx: (clientX - rect.left - view.tx) / view.scale,
        wy: (clientY - rect.top - view.ty) / view.scale,
      }
    },
    [view.tx, view.ty, view.scale],
  )

  const paintReveal = useCallback(
    (clientX: number, clientY: number) => {
      const { wx, wy } = toWorld(clientX, clientY)
      if (wx < 0 || wy < 0 || wx > width || wy > height) return
      addReveal(layer.id, wx, wy, fogBrush)
    },
    [toWorld, width, height, addReveal, layer.id, fogBrush],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = containerRef.current
      if (!el) return
      // Nebel-Pinsel: aufdecken statt schieben/markieren.
      if (fogEditing) {
        if (e.button !== 0) return
        el.setPointerCapture(e.pointerId)
        painting.current = true
        paintReveal(e.clientX, e.clientY)
        return
      }
      if (e.button === 2) {
        // Rechte Maustaste: Karte verschieben.
        el.setPointerCapture(e.pointerId)
        drag.current = { startX: e.clientX, startY: e.clientY, origTx: view.tx, origTy: view.ty, moved: false }
        setPanning(true)
        return
      }
      if (e.button === 0) {
        // Linke Maustaste auf leerer Flaeche: Rechteck-Markierung aufziehen.
        el.setPointerCapture(e.pointerId)
        marquee.current = { startX: e.clientX, startY: e.clientY, moved: false }
      }
    },
    [view.tx, view.ty, fogEditing, paintReveal],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (painting.current) {
        paintReveal(e.clientX, e.clientY)
        return
      }
      const d = drag.current
      if (d) {
        const dx = e.clientX - d.startX
        const dy = e.clientY - d.startY
        if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) d.moved = true
        if (d.moved) setView((v) => ({ ...v, tx: d.origTx + dx, ty: d.origTy + dy }))
        return
      }
      const m = marquee.current
      if (m) {
        const el = containerRef.current
        if (!el) return
        const dx = e.clientX - m.startX
        const dy = e.clientY - m.startY
        if (!m.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) m.moved = true
        if (m.moved) {
          const rect = el.getBoundingClientRect()
          const x0 = m.startX - rect.left
          const y0 = m.startY - rect.top
          const x1 = e.clientX - rect.left
          const y1 = e.clientY - rect.top
          setMarqueeRect({
            x: Math.min(x0, x1),
            y: Math.min(y0, y1),
            w: Math.abs(x1 - x0),
            h: Math.abs(y1 - y0),
          })
        }
      }
    },
    [paintReveal],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const el = containerRef.current
      if (el) el.releasePointerCapture(e.pointerId)
      if (painting.current) {
        painting.current = false
        return
      }

      // Rechte Maustaste: nur Verschieben, keine Auswahl-/Anlege-Logik.
      if (drag.current) {
        drag.current = null
        setPanning(false)
        return
      }

      const m = marquee.current
      marquee.current = null
      if (m && m.moved) {
        setMarqueeRect(null)
        if (!el) return
        const rect = el.getBoundingClientRect()
        const x0 = Math.min(m.startX, e.clientX) - rect.left
        const y0 = Math.min(m.startY, e.clientY) - rect.top
        const x1 = Math.max(m.startX, e.clientX) - rect.left
        const y1 = Math.max(m.startY, e.clientY) - rect.top
        const ids = pins
          .filter((p) => {
            const sx = p.placement!.x * view.scale + view.tx
            const sy = p.placement!.y * view.scale + view.ty
            return sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1
          })
          .map((p) => p.id)
        setSelectedIds(ids)
        return
      }
      setMarqueeRect(null)
      if (!m) return // Klick kam nicht von der linken Maustaste (z.B. Fog-Pinsel).

      if (!el) return
      const rect = el.getBoundingClientRect()
      const wx = (e.clientX - rect.left - view.tx) / view.scale
      const wy = (e.clientY - rect.top - view.ty) / view.scale
      const inside = wx >= 0 && wy >= 0 && wx <= width && wy <= height

      // Vorrang: ein vorhandenes Objekt wird gerade platziert.
      if (placingEntityId) {
        if (inside) {
          setPlacement(placingEntityId, { layerId: layer.id, x: wx, y: wy })
          setPlacingEntity(null)
        }
        return
      }

      if (tool === 'add' && !playerView) {
        if (!inside) return
        addEntity({ type: pendingType, placement: { layerId: layer.id, x: wx, y: wy }, fields: pendingFields })
        setTool('select')
      } else {
        selectEntity(null)
      }
    },
    [tool, pendingType, pendingFields, view, width, height, layer.id, playerView, placingEntityId, pins, addEntity, setPlacement, setPlacingEntity, selectEntity, setSelectedIds, setTool],
  )

  const placingActive = placingEntityId !== null
  // Nebel voll deckend fuer Spieler/Tisch, halbtransparent fuer den DM.
  const fogActive = layer.fogEnabled
  const fogOpacity = playerView ? 1 : 0.45

  return (
    <div
      ref={containerRef}
      className="map-canvas"
      data-tool={tool}
      data-placing={placingActive ? 'true' : undefined}
      data-fog={fogEditing ? 'true' : undefined}
      data-panning={panning ? 'true' : undefined}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={() => fitToView()}
    >
      <div
        className="map-world"
        style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transformOrigin: '0 0',
          width,
          height,
        }}
      >
        {layer.imageUrl ? (
          mapImage && (
            <img
              src={mapImage}
              width={width}
              height={height}
              draggable={false}
              alt={layer.name}
              style={{ display: 'block', pointerEvents: 'none' }}
            />
          )
        ) : (
          <PlaceholderMap width={width} height={height} />
        )}

        {/* Nebel des Krieges: deckt unentdeckte Bereiche ab (skaliert mit der Karte). */}
        {fogActive && (
          <svg
            className="map-fog"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ opacity: fogOpacity }}
          >
            <defs>
              <mask id={`fogmask-${layer.id}`}>
                <rect x="0" y="0" width={width} height={height} fill="white" />
                {layer.reveals.map((rc, i) => (
                  <circle key={i} cx={rc.x} cy={rc.y} r={rc.r} fill="black" />
                ))}
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width={width}
              height={height}
              fill="#05070c"
              mask={`url(#fogmask-${layer.id})`}
            />
          </svg>
        )}
      </div>

      {timeEnabled && dayNight && (
        <div
          className="map-daynight"
          style={{ background: dayNightOverlay(timeOfDay) }}
        />
      )}

      <div className="map-markers">
        {pins.map((e) => {
          const meta = entityDisplayMeta(e)
          return (
            <MapPin
              key={e.id}
              screenX={e.placement!.x * view.scale + view.tx}
              screenY={e.placement!.y * view.scale + view.ty}
              icon={meta.icon}
              color={meta.color}
              label={e.name}
              selected={selectedIds.includes(e.id)}
              draggable={!playerView && !fogEditing}
              scale={view.scale}
              onClick={(ev) => {
                if (ev.ctrlKey || ev.metaKey) toggleSelectedId(e.id)
                else selectEntity(e.id)
              }}
              onMove={(dxWorld, dyWorld) => moveEntity(e.id, dxWorld, dyWorld)}
            />
          )
        })}
      </div>

      {marqueeRect && (
        <div
          className="map-marquee"
          style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h }}
        />
      )}

      {placingActive && (
        <div className="map-banner">
          Klicke auf die Karte, um das Objekt zu platzieren
          <button className="map-banner__cancel" onClick={() => setPlacingEntity(null)}>
            Abbrechen
          </button>
        </div>
      )}

      <ZoomControls
        scale={view.scale}
        onZoom={(dir) => {
          const el = containerRef.current
          if (!el) return
          const cx = el.clientWidth / 2
          const cy = el.clientHeight / 2
          setView((v) => {
            const newScale = clamp(v.scale * (dir > 0 ? 1.25 : 0.8), MIN_SCALE, MAX_SCALE)
            const k = newScale / v.scale
            return { scale: newScale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k }
          })
        }}
        onFit={fitToView}
      />
    </div>
  )
}

function ZoomControls({ scale, onZoom, onFit }: { scale: number; onZoom: (dir: number) => void; onFit: () => void }) {
  return (
    <div className="zoom-controls">
      <button title="Hineinzoomen" onClick={() => onZoom(1)}>+</button>
      <span className="zoom-level">{Math.round(scale * 100)}%</span>
      <button title="Herauszoomen" onClick={() => onZoom(-1)}>&minus;</button>
      <button title="Einpassen (Doppelklick)" onClick={onFit}>&#9633;</button>
    </div>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
