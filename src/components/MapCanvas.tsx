import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { markerMeta } from '../types'
import { PlaceholderMap } from './PlaceholderMap'
import { MapPin } from './MapPin'

interface View {
  scale: number
  tx: number
  ty: number
}

const MIN_SCALE = 0.1
const MAX_SCALE = 6
const DRAG_THRESHOLD = 4 // px, um Klick von Ziehen zu unterscheiden

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 })
  const [fitted, setFitted] = useState(false)

  const layer = useStore((s) => s.layers.find((l) => l.id === s.activeLayerId) ?? s.layers[0])
  const markers = useStore((s) => s.markers)
  const tool = useStore((s) => s.tool)
  const pendingType = useStore((s) => s.pendingMarkerType)
  const addMarker = useStore((s) => s.addMarker)
  const selectMarker = useStore((s) => s.selectMarker)
  const selectedId = useStore((s) => s.selectedMarkerId)
  const setTool = useStore((s) => s.setTool)

  const { width, height } = layer

  // Karte einmalig einpassen (fit-to-view), sobald Containergroesse bekannt ist.
  const fitToView = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const cw = el.clientWidth
    const ch = el.clientHeight
    if (cw === 0 || ch === 0) return
    const scale = Math.min(cw / width, ch / height) * 0.92
    setView({
      scale,
      tx: (cw - width * scale) / 2,
      ty: (ch - height * scale) / 2,
    })
  }, [width, height])

  useEffect(() => {
    if (!fitted) {
      fitToView()
      setFitted(true)
    }
  }, [fitted, fitToView])

  // Zoom zum Cursor per Mausrad.
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
      // Weltpunkt unter dem Cursor fixieren.
      return {
        scale: newScale,
        tx: sx - (sx - v.tx) * k,
        ty: sy - (sy - v.ty) * k,
      }
    })
  }, [])

  // Pan per Ziehen; Klick ohne Ziehen platziert/deselektiert.
  const drag = useRef<{
    startX: number
    startY: number
    origTx: number
    origTy: number
    moved: boolean
  } | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Nur linke Maustaste
      if (e.button !== 0) return
      const el = containerRef.current
      if (!el) return
      el.setPointerCapture(e.pointerId)
      drag.current = {
        startX: e.clientX,
        startY: e.clientY,
        origTx: view.tx,
        origTy: view.ty,
        moved: false,
      }
    },
    [view.tx, view.ty],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) d.moved = true
    if (d.moved) {
      setView((v) => ({ ...v, tx: d.origTx + dx, ty: d.origTy + dy }))
    }
  }, [])

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const el = containerRef.current
      const d = drag.current
      drag.current = null
      if (!el || !d) return
      el.releasePointerCapture(e.pointerId)
      if (d.moved) return // war ein Pan, kein Klick

      // Klick auf leere Karte
      const rect = el.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const wx = (sx - view.tx) / view.scale
      const wy = (sy - view.ty) / view.scale

      if (tool === 'add') {
        if (wx < 0 || wy < 0 || wx > width || wy > height) return
        addMarker({ type: pendingType, x: wx, y: wy })
        setTool('select') // nach dem Setzen zurueck in den Auswahlmodus
      } else {
        selectMarker(null)
      }
    },
    [tool, pendingType, view, width, height, addMarker, selectMarker, setTool],
  )

  return (
    <div
      ref={containerRef}
      className="map-canvas"
      data-tool={tool}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => fitToView()}
    >
      {/* Weltebene: skaliert und verschiebt sich mit der Ansicht. */}
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

      {/* Marker-Overlay: konstante Pin-Groesse, Position aus Weltkoordinaten. */}
      <div className="map-markers">
        {markers.map((m) => {
          const meta = markerMeta(m.type)
          return (
            <MapPin
              key={m.id}
              screenX={m.x * view.scale + view.tx}
              screenY={m.y * view.scale + view.ty}
              icon={meta.icon}
              color={meta.color}
              label={m.name}
              selected={m.id === selectedId}
              onClick={(e) => {
                e.stopPropagation()
                selectMarker(m.id)
              }}
            />
          )
        })}
      </div>

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

function ZoomControls({
  scale,
  onZoom,
  onFit,
}: {
  scale: number
  onZoom: (dir: number) => void
  onFit: () => void
}) {
  return (
    <div className="zoom-controls">
      <button title="Hineinzoomen" onClick={() => onZoom(1)}>
        +
      </button>
      <span className="zoom-level">{Math.round(scale * 100)}%</span>
      <button title="Herauszoomen" onClick={() => onZoom(-1)}>
        &minus;
      </button>
      <button title="Einpassen (Doppelklick)" onClick={onFit}>
        &#9633;
      </button>
    </div>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
