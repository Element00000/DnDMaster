import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { entityMeta } from '../types'
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
  const playerMode = useStore((s) => s.playerMode)
  const placingEntityId = useStore((s) => s.placingEntityId)
  const addEntity = useStore((s) => s.addEntity)
  const setPlacement = useStore((s) => s.setPlacement)
  const setPlacingEntity = useStore((s) => s.setPlacingEntity)
  const moveEntity = useStore((s) => s.moveEntity)
  const selectEntity = useStore((s) => s.selectEntity)
  const selectedId = useStore((s) => s.selectedEntityId)
  const setTool = useStore((s) => s.setTool)

  const { width, height } = layer

  // Auf der aktiven Ebene platzierte Objekte (im Spielermodus nur entdeckte).
  const pins = entities.filter(
    (e) =>
      e.placement &&
      e.placement.layerId === layer.id &&
      (!playerMode || e.visibility === 'spieler'),
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

  const drag = useRef<{ startX: number; startY: number; origTx: number; origTy: number; moved: boolean } | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      const el = containerRef.current
      if (!el) return
      el.setPointerCapture(e.pointerId)
      drag.current = { startX: e.clientX, startY: e.clientY, origTx: view.tx, origTy: view.ty, moved: false }
    },
    [view.tx, view.ty],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) d.moved = true
    if (d.moved) setView((v) => ({ ...v, tx: d.origTx + dx, ty: d.origTy + dy }))
  }, [])

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const el = containerRef.current
      const d = drag.current
      drag.current = null
      if (!el || !d) return
      el.releasePointerCapture(e.pointerId)
      if (d.moved) return

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

      if (tool === 'add' && !playerMode) {
        if (!inside) return
        addEntity({ type: pendingType, placement: { layerId: layer.id, x: wx, y: wy } })
        setTool('select')
      } else {
        selectEntity(null)
      }
    },
    [tool, pendingType, view, width, height, layer.id, playerMode, placingEntityId, addEntity, setPlacement, setPlacingEntity, selectEntity, setTool],
  )

  const placingActive = placingEntityId !== null

  return (
    <div
      ref={containerRef}
      className="map-canvas"
      data-tool={tool}
      data-placing={placingActive ? 'true' : undefined}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
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
          <img
            src={layer.imageUrl}
            width={width}
            height={height}
            draggable={false}
            alt={layer.name}
            style={{ display: 'block', pointerEvents: 'none' }}
          />
        ) : (
          <PlaceholderMap width={width} height={height} />
        )}
      </div>

      <div className="map-markers">
        {pins.map((e) => {
          const meta = entityMeta(e.type)
          return (
            <MapPin
              key={e.id}
              screenX={e.placement!.x * view.scale + view.tx}
              screenY={e.placement!.y * view.scale + view.ty}
              icon={meta.icon}
              color={meta.color}
              label={e.name}
              selected={e.id === selectedId}
              draggable={!playerMode}
              scale={view.scale}
              onClick={() => selectEntity(e.id)}
              onMove={(dxWorld, dyWorld) => moveEntity(e.id, dxWorld, dyWorld)}
            />
          )
        })}
      </div>

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
