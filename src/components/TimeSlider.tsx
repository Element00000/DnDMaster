import { useCallback, useRef } from 'react'
import { useStore } from '../store/useStore'
import { MINUTES_PER_DAY, formatTime } from '../utils/time'

/**
 * Breite des Reglerknopfes. Der Browser laesst ihn an beiden Enden ganz im Feld stehen, die
 * Skala liegt also um je eine halbe Knopfbreite eingerueckt. Ohne diese Korrektur liefe der
 * Knopf beim Ziehen dem Zeiger davon.
 */
const THUMB = 16

/**
 * Uhrzeit-Regler ueber der Karte. Tageszeit und Tag/Nacht-Einfaerbung sind immer aktiv -
 * es gibt keine Schalter mehr dafuer, die Zeit ist fester Teil der Karte.
 *
 * Das Ziehen ist selbst gebaut statt dem Feld ueberlassen: Nur so laesst sich ueber das
 * Tagesende hinausziehen. Zieht man weiter nach rechts, laeuft die Zeit in den naechsten
 * Kalendertag hinein, nach links in den vorherigen - eine Reglerbreite entspricht einem Tag.
 * Ein Bereichsfeld kann das nicht: Es kennt nur seine eigenen Grenzen und wuerde am Anschlag
 * stehenbleiben.
 *
 * Gerechnet wird dabei vom Tag, in dem der Zug begonnen hat. Sonst wuerde jede weitere
 * Bewegung am Anschlag den eben gewechselten Tag erneut weiterschieben.
 */
export function TimeSlider() {
  const timeOfDay = useStore((s) => s.timeOfDay)
  const currentDay = useStore((s) => s.currentDay)
  const setMoment = useStore((s) => s.setMoment)
  const setCurrentDay = useStore((s) => s.setCurrentDay)

  const rangeRef = useRef<HTMLInputElement>(null)
  const dragDay = useRef(currentDay)

  const applyFromPointer = useCallback(
    (clientX: number) => {
      const el = rangeRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const usable = Math.max(1, rect.width - THUMB)
      // Bewusst nicht begrenzt: Werte unter 0 und ueber einem Tag sind der Uebergang in den
      // Nachbartag, den setMoment umrechnet.
      const ratio = (clientX - rect.left - THUMB / 2) / usable
      setMoment(dragDay.current, ratio * MINUTES_PER_DAY)
    },
    [setMoment],
  )

  return (
    <div className="time-slider">
      {/* Kampagnentag: bestimmt, welche Tagesplan-Ausnahmen der Objekte greifen. */}
      <div className="time-slider__day" title="Aktueller Kampagnentag">
        <button
          className="time-slider__daybtn"
          onClick={() => setCurrentDay(currentDay - 1)}
          disabled={currentDay <= 1}
          title="Vorheriger Tag"
        >
          &minus;
        </button>
        <span className="time-slider__daylabel">Tag {currentDay}</span>
        <button
          className="time-slider__daybtn"
          onClick={() => setCurrentDay(currentDay + 1)}
          title="Naechster Tag"
        >
          +
        </button>
      </div>

      <div className="time-slider__body">
        <span className="time-slider__icon">{iconForTime(timeOfDay)}</span>
        <input
          ref={rangeRef}
          className="time-slider__range"
          type="range"
          min={0}
          max={MINUTES_PER_DAY - 1}
          // Minutenweise: Mit groesseren Schritten waere das Tagesende (23:59) nicht
          // erreichbar, weil es auf keinem Vielfachen davon liegt.
          step={1}
          value={timeOfDay}
          // Das Feld zeigt nur an; gezogen wird von Hand (siehe oben). preventDefault haelt
          // sein eigenes Ziehen zurueck, das am Tagesende stehenbliebe.
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            e.currentTarget.focus()
            dragDay.current = currentDay
            applyFromPointer(e.clientX)
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
            applyFromPointer(e.clientX)
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId)
            }
          }}
          // Pfeiltasten bedient weiterhin das Feld selbst - minutenweise, und am Tagesrand
          // ebenfalls in den Nachbartag.
          onChange={(e) => setMoment(currentDay, Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' && timeOfDay >= MINUTES_PER_DAY - 1) {
              e.preventDefault()
              setMoment(currentDay, MINUTES_PER_DAY)
            }
            if (e.key === 'ArrowLeft' && timeOfDay <= 0) {
              e.preventDefault()
              setMoment(currentDay, -1)
            }
          }}
        />
        <span className="time-slider__clock">{formatTime(timeOfDay)}</span>
      </div>
    </div>
  )
}

function iconForTime(minutes: number): string {
  const h = minutes / 60
  if (h < 5 || h >= 21) return '\u{1F319}' // Mond
  if (h < 8) return '\u{1F305}' // Sonnenaufgang
  if (h < 18) return '\u{2600}' // Sonne
  return '\u{1F307}' // Sonnenuntergang
}
