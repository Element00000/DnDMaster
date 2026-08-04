// Hilfsfunktionen fuer die Tageszeit (Minuten seit Mitternacht, 0..1439).

import type { ScheduleEntry } from '../types'

export const MINUTES_PER_DAY = 24 * 60

/** 725 -> "12:05" */
export function formatTime(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** "12:05" -> 725; ungueltig -> null */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

/**
 * Ist die aktuelle Uhrzeit im Zeitfenster? Fehlt das Fenster, gilt "immer".
 * Faenster mit start>end laufen ueber Mitternacht (z.B. 22:00-06:00).
 */
export function inWindow(now: number, start: number | null, end: number | null): boolean {
  if (start == null || end == null) return true
  if (start === end) return true
  if (start < end) return now >= start && now < end
  return now >= start || now < end
}

/**
 * Welcher Zeitplan-Eintrag gilt zur Uhrzeit "minutes" am Kalendertag "day"?
 *
 * Ausnahmen des konkreten Tages schlagen den Standard-Tagesablauf: Steht die Wirtin
 * normalerweise ab 6 Uhr im Schankraum, an Tag 12 aber auf dem Fest, gewinnt der
 * Eintrag mit day === 12. Gibt es fuer die Uhrzeit gar keinen Eintrag, liefert die
 * Funktion undefined und es gilt die Basis-Platzierung des Objekts.
 */
export function activeScheduleEntry(
  schedule: ScheduleEntry[],
  minutes: number,
  day: number,
): ScheduleEntry | undefined {
  const exception = schedule.find((s) => s.day === day && inWindow(minutes, s.timeStart, s.timeEnd))
  if (exception) return exception
  return schedule.find((s) => s.day == null && inWindow(minutes, s.timeStart, s.timeEnd))
}

/**
 * Zerlegt ein Zeitfenster in die Abschnitte, die es auf einem 0-24-Uhr-Balken belegt.
 * Fenster ueber Mitternacht (22:00-06:00) ergeben zwei Abschnitte, alle anderen einen.
 */
export function windowSegments(start: number, end: number): { from: number; to: number }[] {
  if (start === end) return [{ from: 0, to: MINUTES_PER_DAY }]
  if (start < end) return [{ from: start, to: end }]
  return [
    { from: start, to: MINUTES_PER_DAY },
    { from: 0, to: end },
  ]
}

/** Laenge eines Zeitfensters in Minuten (ueber Mitternacht mitgerechnet). */
export function windowDuration(start: number, end: number): number {
  if (start === end) return MINUTES_PER_DAY
  return ((end - start) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

/** Minuten auf 0..1439 normieren (auch fuer negative Werte). */
export function wrapMinutes(minutes: number): number {
  return ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

/**
 * Tag/Nacht-Ueberlagerung: liefert eine CSS-Farbe (rgba) fuer eine
 * Vollflaechen-Ebene ueber der Karte, rein zur Orientierung.
 */
export function dayNightOverlay(minutes: number): string {
  const h = minutes / 60
  // Stuetzpunkte: Nacht, Morgendaemmerung, Tag, Abenddaemmerung
  // [Stunde, r, g, b, a]
  const stops: [number, number, number, number, number][] = [
    [0, 12, 20, 48, 0.5],
    [5, 12, 20, 48, 0.45],
    [7, 220, 130, 80, 0.22],
    [9, 255, 240, 210, 0.0],
    [17, 255, 240, 210, 0.0],
    [19, 220, 120, 70, 0.24],
    [21, 20, 26, 60, 0.4],
    [24, 12, 20, 48, 0.5],
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    const [h1, r1, g1, b1, a1] = stops[i]
    const [h2, r2, g2, b2, a2] = stops[i + 1]
    if (h >= h1 && h <= h2) {
      const t = h2 === h1 ? 0 : (h - h1) / (h2 - h1)
      const r = Math.round(lerp(r1, r2, t))
      const g = Math.round(lerp(g1, g2, t))
      const b = Math.round(lerp(b1, b2, t))
      const a = lerp(a1, a2, t)
      return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
    }
  }
  return 'rgba(0,0,0,0)'
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
