import { useRef } from 'react'
import { useStore } from '../store/useStore'
import { MINUTES_PER_DAY, formatTime } from '../utils/time'

/**
 * Uhrzeit-Regler ueber der Karte. Tageszeit und Tag/Nacht-Einfaerbung sind immer aktiv -
 * es gibt keine Schalter mehr dafuer, die Zeit ist fester Teil der Karte.
 */
export function TimeSlider() {
  const timeOfDay = useStore((s) => s.timeOfDay)
  const currentDay = useStore((s) => s.currentDay)
  const setTime = useStore((s) => s.setTimeOfDay)
  const setCurrentDay = useStore((s) => s.setCurrentDay)
  /**
   * Ein Tageswechsel je Zug. Nach dem Umschlagen steht der Regler am anderen Ende, waehrend
   * der Finger noch am Anschlag liegt - schon ein Zittern wuerde sonst gleich den naechsten
   * Tag aufschlagen. Loslassen gibt ihn wieder frei.
   */
  const wrapped = useRef(false)

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
          className="time-slider__range"
          type="range"
          // Je einen Schritt ueber den Tag hinaus: Wer bis ans Ende zieht, landet auf 0 Uhr
          // des naechsten Tages, wer darueber hinaus nach links zieht, auf 23:59 des
          // vorherigen (setTimeOfDay rechnet das um). Der Regler springt dabei ans andere
          // Ende - genau das macht den Uebergang sichtbar.
          min={-1}
          max={MINUTES_PER_DAY}
          // Minutenweise: Mit groesseren Schritten waere das Tagesende (23:59) nicht
          // erreichbar, weil es auf keinem Vielfachen davon liegt.
          step={1}
          value={timeOfDay}
          onChange={(e) => {
            const value = Number(e.target.value)
            const wraps = value < 0 || value >= MINUTES_PER_DAY
            if (wraps && wrapped.current) return
            if (wraps) wrapped.current = true
            setTime(value)
          }}
          onPointerUp={() => {
            wrapped.current = false
          }}
          onKeyUp={() => {
            wrapped.current = false
          }}
          onBlur={() => {
            wrapped.current = false
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
