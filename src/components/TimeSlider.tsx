import { useStore } from '../store/useStore'
import { formatTime } from '../utils/time'

/**
 * Uhrzeit-Regler ueber der Karte. Tageszeit und Tag/Nacht-Einfaerbung sind immer aktiv -
 * es gibt keine Schalter mehr dafuer, die Zeit ist fester Teil der Karte.
 */
export function TimeSlider() {
  const timeOfDay = useStore((s) => s.timeOfDay)
  const currentDay = useStore((s) => s.currentDay)
  const setTime = useStore((s) => s.setTimeOfDay)
  const setCurrentDay = useStore((s) => s.setCurrentDay)

  return (
    <div className="time-slider is-enabled">
      {/* Kampagnentag: bestimmt, welche Tagesplan-Ausnahmen der Objekte greifen. */}
      <div className="time-slider__day" title="Aktueller Kampagnentag">
        <button
          className="time-slider__daybtn"
          onClick={() => setCurrentDay(currentDay - 1)}
          disabled={currentDay <= 0}
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
          min={0}
          max={1439}
          step={5}
          value={timeOfDay}
          onChange={(e) => setTime(Number(e.target.value))}
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
