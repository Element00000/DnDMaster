import { useEffect, useRef, useState } from 'react'

/** Tage je Zeile und Zeilen je Blatt - ein Blatt fasst also vier Wochen. */
const COLS = 7
const ROWS = 4
const PAGE = COLS * ROWS

/**
 * Kleiner Kalender zur Wahl eines Kampagnentags. Kampagnentage sind schlicht
 * durchnummeriert (Tag 1, Tag 2, ...), es gibt also keine Monate - geblaettert wird in
 * Vierwochenblaettern.
 *
 * Oben steht "Jeden Tag": Damit gilt die Station im Standard-Tagesablauf, unabhaengig vom
 * Kalender. Ohne diese Wahl waere jede Station an einen einzelnen Tag gebunden und ein
 * wiederkehrender Ablauf gar nicht mehr anzulegen.
 */
export function DayPicker({
  value,
  today,
  onPick,
  onClose,
}: {
  /** Gewaehlter Tag; null = jeden Tag. */
  value: number | null
  /** Der Tag, auf dem die Kampagne gerade steht - wird eigens hervorgehoben. */
  today: number
  onPick: (day: number | null) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Das Blatt, auf dem der gewaehlte Tag liegt (bei "jeden Tag" das des aktuellen).
  const [start, setStart] = useState(() => {
    const anchor = value ?? today
    return Math.max(1, Math.floor((anchor - 1) / PAGE) * PAGE + 1)
  })

  // Klick daneben oder Escape schliesst - wie bei jedem anderen Menue auch.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const days = Array.from({ length: PAGE }, (_, i) => start + i)

  return (
    <div className="daypicker" ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      <button
        className={`daypicker__every${value == null ? ' is-selected' : ''}`}
        onClick={() => onPick(null)}
      >
        Jeden Tag
      </button>

      <div className="daypicker__nav">
        <button
          className="daypicker__page"
          disabled={start <= 1}
          onClick={() => setStart(Math.max(1, start - PAGE))}
          title="Frueher"
        >
          ‹
        </button>
        <span className="daypicker__range">
          Tag {start}–{start + PAGE - 1}
        </span>
        <button className="daypicker__page" onClick={() => setStart(start + PAGE)} title="Spaeter">
          ›
        </button>
      </div>

      <div className="daypicker__grid">
        {days.map((d) => (
          <button
            key={d}
            className={`daypicker__day${d === value ? ' is-selected' : ''}${
              d === today ? ' is-today' : ''
            }`}
            onClick={() => onPick(d)}
            title={d === today ? `Tag ${d} — aktueller Kampagnentag` : `Tag ${d}`}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}
