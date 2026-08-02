import { useRef } from 'react'

interface Props {
  screenX: number
  screenY: number
  icon: string
  color: string
  label: string
  selected: boolean
  draggable: boolean
  scale: number
  onClick: (e: React.PointerEvent) => void
  onMove: (dxWorld: number, dyWorld: number) => void
}

/**
 * Konstant grosser Marker-Pin in Bildschirmkoordinaten.
 * Unterscheidet Klick (auswaehlen) von Ziehen (verschieben) per Schwellwert.
 */
export function MapPin({
  screenX,
  screenY,
  icon,
  color,
  label,
  selected,
  draggable,
  scale,
  onClick,
  onMove,
}: Props) {
  const state = useRef<{ lastX: number; lastY: number; moved: boolean } | null>(null)

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    state.current = { lastX: e.clientX, lastY: e.clientY, moved: false }
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = state.current
    if (!s || !draggable) return
    const dx = e.clientX - s.lastX
    const dy = e.clientY - s.lastY
    if (!s.moved && Math.hypot(e.clientX - s.lastX, e.clientY - s.lastY) > 3) s.moved = true
    if (s.moved) {
      s.lastX = e.clientX
      s.lastY = e.clientY
      onMove(dx / scale, dy / scale)
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = state.current
    state.current = null
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    if (!s || !s.moved) onClick(e)
  }

  return (
    <div
      className={`map-pin${selected ? ' is-selected' : ''}${draggable ? ' is-draggable' : ''}`}
      style={{ left: screenX, top: screenY, ['--pin-color' as string]: color }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="map-pin__head">
        <span className="map-pin__icon">{icon}</span>
      </div>
      <div className="map-pin__label">{label}</div>
    </div>
  )
}
