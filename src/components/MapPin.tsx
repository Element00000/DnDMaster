import { useRef } from 'react'
import { useAsset } from '../useAsset'

interface Props {
  screenX: number
  screenY: number
  icon: string
  /**
   * Miniaturbild des Objekts (Asset-Referenz). Ist eines hinterlegt, zeigt der Pin das
   * Portraet statt des Typ-Icons.
   */
  imageRef?: string | null
  color: string
  label: string
  selected: boolean
  draggable: boolean
  scale: number
  /** Markiert Pins, die eine eingebettete Karte repraesentieren (visuell hervorgehoben). */
  isMapLink?: boolean
  /** Icon weiss statt in Originalfarbe darstellen (z.B. Spieler-Charaktere). */
  iconInvert?: boolean
  /**
   * Vorschau-Doppel eines Pins: zeigt eine erst vorgemerkte Position an, die noch nicht
   * gespeichert ist. Nimmt keine Klicks an - bedient wird immer das Original.
   */
  ghost?: boolean
  /** Hervorgehoben (Spieler, Bosse): etwas groessere Pinnadel. */
  emphasized?: boolean
  onClick: (e: React.PointerEvent) => void
  /** Doppelklick auf den Pin. Ohne Angabe bleibt er wirkungslos. */
  onDoubleClick?: () => void
  onMove: (dxWorld: number, dyWorld: number) => void
  /** Nach einem Ziehen (nicht bei einem reinen Klick): Bildschirmkoordinaten des Loslassens. */
  onDragEnd?: (clientX: number, clientY: number) => void
}

/**
 * Konstant grosser Marker-Pin in Bildschirmkoordinaten.
 * Unterscheidet Klick (auswaehlen) von Ziehen (verschieben) per Schwellwert.
 */
export function MapPin({
  screenX,
  screenY,
  icon,
  imageRef,
  color,
  label,
  selected,
  draggable,
  scale,
  isMapLink,
  iconInvert,
  ghost,
  emphasized,
  onClick,
  onDoubleClick,
  onMove,
  onDragEnd,
}: Props) {
  const state = useRef<{ lastX: number; lastY: number; moved: boolean } | null>(null)
  const image = useAsset(imageRef)

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
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    }
    if (!s || !s.moved) onClick(e)
    else onDragEnd?.(e.clientX, e.clientY)
  }

  // Bei verlorener Zeigererfassung (z.B. wenn der Pin waehrend des Ziehens durch eine
  // andere Darstellung ersetzt wird) den Ziehzustand zuruecksetzen statt ihn haengen zu
  // lassen - sonst wuerde ein spaeterer reiner Hover faelschlich als Weiterziehen gewertet.
  function onPointerCancelOrLost() {
    state.current = null
  }

  return (
    <div
      className={`map-pin${selected ? ' is-selected' : ''}${draggable ? ' is-draggable' : ''}${isMapLink ? ' is-map-link' : ''}${iconInvert ? ' is-icon-invert' : ''}${image ? ' has-image' : ''}${ghost ? ' is-ghost' : ''}${emphasized ? ' is-emphasized' : ''}`}
      style={{ left: screenX, top: screenY, ['--pin-color' as string]: color }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancelOrLost}
      onLostPointerCapture={onPointerCancelOrLost}
      // Zwei schnelle Klicks auf einen Pin sind kein Doppelklick auf die Karte darunter -
      // sonst passt sich die Ansicht ungewollt ein.
      onDoubleClick={(e) => {
        e.stopPropagation()
        onDoubleClick?.()
      }}
    >
      <div className="map-pin__head">
        {image ? (
          // Eigener Rahmen um das Bild: Er beschneidet den Ausschnitt rund und dreht
          // gegen die Neigung des Pin-Kopfes zurueck (siehe .map-pin__portrait).
          <span className="map-pin__portrait">
            <img className="map-pin__image" src={image} alt="" draggable={false} />
          </span>
        ) : (
          <span className="map-pin__icon">{icon}</span>
        )}
      </div>
      <div className="map-pin__label">{label}</div>
    </div>
  )
}
