interface Props {
  screenX: number
  screenY: number
  icon: string
  color: string
  label: string
  selected: boolean
  onClick: (e: React.PointerEvent) => void
}

/** Ein konstant grosser Marker-Pin, positioniert in Bildschirmkoordinaten. */
export function MapPin({ screenX, screenY, icon, color, label, selected, onClick }: Props) {
  return (
    <div
      className={`map-pin${selected ? ' is-selected' : ''}`}
      style={{ left: screenX, top: screenY, ['--pin-color' as string]: color }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={onClick}
    >
      <div className="map-pin__head">
        <span className="map-pin__icon">{icon}</span>
      </div>
      <div className="map-pin__label">{label}</div>
    </div>
  )
}
