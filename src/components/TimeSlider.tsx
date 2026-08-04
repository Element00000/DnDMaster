import { useStore } from '../store/useStore'
import { formatTime } from '../utils/time'

/** Uhrzeit-Regler ueber der Karte (Abschnitt 5 des Konzepts). */
export function TimeSlider() {
  const enabled = useStore((s) => s.timeEnabled)
  const timeOfDay = useStore((s) => s.timeOfDay)
  const currentDay = useStore((s) => s.currentDay)
  const dayNight = useStore((s) => s.dayNight)
  const setEnabled = useStore((s) => s.setTimeEnabled)
  const setTime = useStore((s) => s.setTimeOfDay)
  const setCurrentDay = useStore((s) => s.setCurrentDay)
  const setDayNight = useStore((s) => s.setDayNight)

  return (
    <div className={`time-slider${enabled ? ' is-enabled' : ''}`}>
      <label className="time-slider__toggle" title="Tageszeit-Filter ein-/ausschalten">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Tageszeit</span>
      </label>

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
          disabled={!enabled}
          onChange={(e) => setTime(Number(e.target.value))}
        />
        <span className="time-slider__clock">{formatTime(timeOfDay)}</span>
      </div>

      <label className="time-slider__daynight" title="Karte nach Tageszeit einfaerben">
        <input
          type="checkbox"
          checked={dayNight}
          disabled={!enabled}
          onChange={(e) => setDayNight(e.target.checked)}
        />
        <span>Tag/Nacht</span>
      </label>
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
