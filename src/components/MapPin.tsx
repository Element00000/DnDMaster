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
   * Icon rot einfaerben als Warnung - bei Kartenpinnadeln, auf deren Karte Gegner stehen.
   * Der Kopf behaelt dabei seine Farbe, damit die Nadel als Karte erkennbar bleibt.
   */
  iconAlert?: boolean
  /**
   * Vorschau-Doppel eines Pins: zeigt eine erst vorgemerkte Position an, die noch nicht
   * gespeichert ist. Nimmt keine Klicks an - bedient wird immer das Original.
   */
  ghost?: boolean
  /** Hervorgehoben (Spieler, Bosse): etwas groessere Pinnadel. */
  emphasized?: boolean
  /** Tote Figur: weisses Kreuz ueber dem Kopf, auch ueber einem Portraet. */
  dead?: boolean
  onClick: (e: React.PointerEvent) => void
  /** Doppelklick auf den Pin. Ohne Angabe bleibt er wirkungslos. */
  onDoubleClick?: () => void
  onMove: (dxWorld: number, dyWorld: number) => void
  /**
   * Nach einem Ziehen (nicht bei einem reinen Klick): Bildschirmkoordinaten des Loslassens.
   *
   * "drag" traegt nach, was der Aufrufer selbst nicht wissen kann: ob mit Alt gezogen wurde
   * (dann ist Duplizieren gemeint) und wie weit der Zeiger insgesamt gewandert ist.
   */
  onDragEnd?: (
    clientX: number,
    clientY: number,
    drag: { alt: boolean; totalDx: number; totalDy: number },
  ) => void
  /**
   * Ziehen mit gehaltener Alt-Taste: Das Objekt selbst bleibt liegen, gemeldet wird nur, wie
   * weit die Kopie inzwischen vom Original entfernt waere. null beendet die Vorschau.
   *
   * Ohne diese Meldung (Aufrufer reicht sie nicht durch) verhaelt sich Alt wie normales
   * Ziehen.
   */
  onGhostMove?: (offset: { dx: number; dy: number } | null) => void
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
  iconAlert,
  ghost,
  emphasized,
  dead,
  onClick,
  onDoubleClick,
  onMove,
  onDragEnd,
  onGhostMove,
}: Props) {
  const state = useRef<{
    lastX: number
    lastY: number
    moved: boolean
    /** Summe aller Schritte in Weltkoordinaten - siehe onDragEnd. */
    totalDx: number
    totalDy: number
    /**
     * Mit Alt begonnen: Das Objekt bleibt liegen, gezogen wird nur eine Vorschau. Die
     * Entscheidung faellt beim Aufsetzen und gilt fuer das ganze Ziehen - sonst spraenge das
     * Objekt hin und her, je nachdem wann man die Taste drueckt oder loslaesst.
     */
    duplicating: boolean
  } | null>(null)
  const image = useAsset(imageRef)

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    state.current = {
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
      totalDx: 0,
      totalDy: 0,
      duplicating: e.altKey && !!onGhostMove,
    }
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
      s.totalDx += dx / scale
      s.totalDy += dy / scale
      if (s.duplicating) onGhostMove?.({ dx: s.totalDx, dy: s.totalDy })
      else onMove(dx / scale, dy / scale)
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = state.current
    state.current = null
    e.stopPropagation()
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    }
    if (s?.duplicating) onGhostMove?.(null)
    if (!s || !s.moved) onClick(e)
    else {
      onDragEnd?.(e.clientX, e.clientY, {
        alt: s.duplicating,
        totalDx: s.totalDx,
        totalDy: s.totalDy,
      })
    }
  }

  // Bei verlorener Zeigererfassung (z.B. wenn der Pin waehrend des Ziehens durch eine
  // andere Darstellung ersetzt wird) den Ziehzustand zuruecksetzen statt ihn haengen zu
  // lassen - sonst wuerde ein spaeterer reiner Hover faelschlich als Weiterziehen gewertet.
  function onPointerCancelOrLost() {
    if (state.current?.duplicating) onGhostMove?.(null)
    state.current = null
  }

  return (
    <div
      className={`map-pin${selected ? ' is-selected' : ''}${draggable ? ' is-draggable' : ''}${isMapLink ? ' is-map-link' : ''}${iconInvert ? ' is-icon-invert' : ''}${iconAlert ? ' is-icon-alert' : ''}${image ? ' has-image' : ''}${ghost ? ' is-ghost' : ''}${emphasized ? ' is-emphasized' : ''}`}
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
      {/* Bewusst neben dem Kopf statt in ihm: Der Kopf ist gedreht (die Tropfenform), was
          das Kreuz zum Plus machen wuerde. Hier liegt es im ungedrehten Raum der Pinnadel
          und deckt den Kopf genau ab - auch ein Portraet darin. */}
      {dead && <span className="map-pin__cross" aria-hidden="true" />}
      <div className="map-pin__label">{label}</div>
    </div>
  )
}
