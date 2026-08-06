// Hilfsfunktionen fuer die Tageszeit (Minuten seit Mitternacht, 0..1439).

import type { Entity, Timestone } from '../types'
import { effectivePlacement, isDead } from '../types'

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
 * Alle Timestones, die am Kalendertag "day" gelten, chronologisch sortiert:
 * der Standard-Tagesablauf plus die Ausnahmen dieses Tages. Fallen beide auf dieselbe
 * Uhrzeit, steht die Ausnahme hinten und gewinnt damit in activeTimestone.
 */
export function scheduleForDay(schedule: Timestone[], day: number): Timestone[] {
  return schedule
    .filter((s) => s.day == null || s.day === day)
    .slice()
    .sort((a, b) => a.time - b.time || (a.day == null ? 0 : 1) - (b.day == null ? 0 : 1))
}

/** Absoluter Zeitpunkt auf dem Kampagnenkalender, in Minuten. */
function moment(day: number, minutes: number): number {
  return day * MINUTES_PER_DAY + minutes
}

/**
 * Der zuletzt vergangene Punkt des Standard-Tagesablaufs am laufenden Tag. Liegt vor der
 * Uhrzeit keiner, ist es undefined - dann gilt die Basis-Platzierung.
 */
function lastRoutineToday(routine: Timestone[], minutes: number): Timestone | undefined {
  let active: Timestone | undefined
  for (const k of routine) {
    if (k.time > minutes) break
    active = k
  }
  return active
}

/**
 * Die zuletzt vergangene Wiederholung des Tagesablaufs, absolut gerechnet - notfalls die
 * von gestern Abend. Nur dort gebraucht, wo Kalendertermine im Spiel sind und ueber
 * Mitternacht hinweg verglichen werden muss.
 */
function lastRoutineMoment(
  routine: Timestone[],
  minutes: number,
  day: number,
): { stone: Timestone; at: number } | undefined {
  let best: { stone: Timestone; at: number } | undefined
  for (const k of routine) {
    const at = moment(k.time <= minutes ? day : day - 1, k.time)
    if (!best || at > best.at) best = { stone: k, at }
  }
  return best
}

/**
 * Welcher Timestone gilt zur Uhrzeit "minutes" am Kalendertag "day"? Ein Objekt bleibt
 * stehen, bis der naechste Timestone es weiterschickt. Liegt keiner vor der Uhrzeit,
 * liefert die Funktion undefined: Dann gilt die Basis-Platzierung.
 *
 * Zwei Sorten von Punkten, die verschieden gemeint sind - und die Unterscheidung trifft
 * man schon beim Anlegen, indem man "Jeden Tag" oder einen Kalendertag waehlt:
 *
 * - Ohne Tag: der wiederkehrende Tagesablauf. Er laeuft als Schleife ueber 24 Stunden,
 *   und um Mitternacht steht das Objekt wieder an seiner Basis-Platzierung. Fuer den
 *   Schmied, der jeden Morgen in seiner Schmiede steht, ist genau das gemeint.
 * - Mit Tag: ein Punkt auf dem durchlaufenden Kalender, etwa eine Reise. Solange noch
 *   weitere folgen, setzen sie den Tagesablauf aus - sonst holte ihn die Schleife jede
 *   Nacht an seinen Ausgangsort zurueck, mitten auf der Reise. Erst nach dem letzten
 *   nimmt der Tagesablauf wieder das Ruder; hat das Objekt keinen, bleibt es schlicht,
 *   wo es zuletzt war.
 *
 * Ohne Kalendertermine bleibt es bei der reinen Tagesschleife - fuer Objekte ohne Reisen
 * aendert sich also nichts.
 */
export function activeTimestone(
  schedule: Timestone[],
  minutes: number,
  day: number,
): Timestone | undefined {
  const routine = schedule.filter((s) => s.day == null).sort((a, b) => a.time - b.time)
  const dated = schedule
    .filter((s) => s.day != null)
    .sort((a, b) => a.day! - b.day! || a.time - b.time)

  if (dated.length === 0) return lastRoutineToday(routine, minutes)

  const now = moment(day, minutes)
  let last: Timestone | undefined
  let later = false
  for (const s of dated) {
    if (moment(s.day!, s.time) > now) {
      later = true
      break
    }
    last = s
  }

  // Vor dem ersten Kalendertermin laeuft alles wie gewohnt.
  if (!last) return lastRoutineToday(routine, minutes)
  // Mitten in der Kette: Der Tagesablauf ist ausgesetzt.
  if (later) return last

  // Nach dem letzten Kalendertermin uebernimmt der Tagesablauf wieder - aber erst, wenn er
  // seither ueberhaupt an der Reihe war.
  const routineNow = lastRoutineMoment(routine, minutes, day)
  if (routineNow && routineNow.at > moment(last.day!, last.time)) return routineNow.stone
  return last
}

/**
 * Wo ein Objekt zur Uhrzeit "minutes" am Kalendertag "day" steht: Karte und Koordinaten
 * darauf. Kurzform fuer activeTimestone + effectivePlacement.
 */
export function placementAt(
  entity: Entity,
  minutes: number,
  day: number,
): { layerId: string; x: number; y: number } | null {
  // Tote gehen nicht mehr weiter: Ihr Tagesablauf ist gestrichen, sie bleiben an der Stelle
  // stehen, die beim Sterben zu ihrer Platzierung wurde.
  if (isDead(entity)) return effectivePlacement(entity, undefined)
  return effectivePlacement(entity, activeTimestone(entity.schedule, minutes, day))
}

/**
 * Bis wann ein Timestone gilt: bis zum naechsten, sonst bis Mitternacht. Nur fuer
 * die Darstellung des Zeitstrahls gedacht.
 */
export function timestoneEndsAt(keys: Timestone[], index: number): number {
  return keys[index + 1]?.time ?? MINUTES_PER_DAY
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
