import { useCallback, useRef, useState } from 'react'
import { entityDisplayMeta } from '../types'
import type { Entity, ScheduleEntry } from '../types'
import { useStore } from '../store/useStore'
import {
  MINUTES_PER_DAY,
  formatTime,
  parseTime,
  windowDuration,
  windowSegments,
  wrapMinutes,
} from '../utils/time'

/** Raster, auf das Ziehen im Zeitstrahl einrastet (Minuten). */
const SNAP = 15
/** Kuerzestes Zeitfenster, das per Ziehen entstehen kann (Minuten). */
const MIN_WINDOW = 15
/** Laenge eines frisch angelegten Zeitfensters (Minuten). */
const NEW_WINDOW = 120

type DragMode = 'move' | 'start' | 'end'

interface Drag {
  mode: DragMode
  entryId: string
  /** Uhrzeit, an der der Block gegriffen wurde (nur fuer 'move'). */
  grabbedAt: number
  origStart: number
  origEnd: number
  /** Wurde tatsaechlich gezogen? Sonst gilt der Zeiger-Ablauf als Klick. */
  moved: boolean
}

function pct(minutes: number): string {
  return `${(minutes / MINUTES_PER_DAY) * 100}%`
}

/** Ueberschneiden sich zwei Zeitfenster? Fenster ueber Mitternacht werden zerlegt. */
function windowsOverlap(a: ScheduleEntry, b: ScheduleEntry): boolean {
  for (const sa of windowSegments(a.timeStart, a.timeEnd)) {
    for (const sb of windowSegments(b.timeStart, b.timeEnd)) {
      if (sa.from < sb.to && sb.from < sa.to) return true
    }
  }
  return false
}

/**
 * Tagesablauf eines Objekts als 24-Stunden-Zeitstrahl mit zwei Spuren: dem Standardplan,
 * der an jedem Kampagnentag gilt, und den Ausnahmen des aktuell eingestellten Kalendertags.
 * Bloecke lassen sich verschieben und an den Raendern dehnen; ein Klick auf freie Flaeche
 * legt ein neues Zeitfenster an.
 */
export function DaySchedule({ entity }: { entity: Entity }) {
  const timeOfDay = useStore((s) => s.timeOfDay)
  const currentDay = useStore((s) => s.currentDay)
  const timeEnabled = useStore((s) => s.timeEnabled)
  const tableMode = useStore((s) => s.tableMode)
  const setTimeOfDay = useStore((s) => s.setTimeOfDay)
  const setTimeEnabled = useStore((s) => s.setTimeEnabled)
  const addScheduleEntry = useStore((s) => s.addScheduleEntry)
  const updateScheduleEntry = useStore((s) => s.updateScheduleEntry)
  const removeScheduleEntry = useStore((s) => s.removeScheduleEntry)
  const placingScheduleId = useStore((s) => s.placingScheduleId)
  const setPlacingSchedule = useStore((s) => s.setPlacingSchedule)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const drag = useRef<Drag | null>(null)
  /**
   * Zeitpunkt der letzten Zeiger-Aktion auf einem Block. Waehrend eines Zugs faengt die
   * Spur die Zeigerereignisse ab (Pointer Capture), das abschliessende click-Ereignis
   * landet also auf der Spur - ohne diese Sperre wuerde jeder Klick auf einen Block
   * anschliessend ein neues Zeitfenster anlegen. Ein Zeitstempel statt eines Flags, damit
   * nichts haengen bleibt, wenn der Zug ohne click endet (pointercancel, Fensterwechsel).
   */
  const lastSegmentAt = useRef(0)

  const readOnly = tableMode
  const meta = entityDisplayMeta(entity)
  const standard = entity.schedule.filter((s) => s.day == null)
  const exceptions = entity.schedule.filter((s) => s.day === currentDay)
  const selected = entity.schedule.find((s) => s.id === selectedId) ?? null

  // Uhrzeit aus einer Zeigerposition im Zeitstrahl, eingerastet auf das Raster.
  const minutesFromPointer = useCallback((el: HTMLElement, clientX: number): number => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return 0
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return wrapMinutes(Math.round((ratio * MINUTES_PER_DAY) / SNAP) * SNAP)
  }, [])

  const onSegmentDown = useCallback(
    (e: React.PointerEvent, entry: ScheduleEntry, mode: DragMode) => {
      if (readOnly || e.button !== 0) return
      e.stopPropagation()
      const track = e.currentTarget.closest('.daytrack__lane') as HTMLElement | null
      if (!track) return
      track.setPointerCapture(e.pointerId)
      lastSegmentAt.current = Date.now()
      drag.current = {
        mode,
        entryId: entry.id,
        grabbedAt: minutesFromPointer(track, e.clientX),
        origStart: entry.timeStart,
        origEnd: entry.timeEnd,
        moved: false,
      }
      setSelectedId(entry.id)
    },
    [readOnly, minutesFromPointer],
  )

  const onLaneMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      const track = e.currentTarget as HTMLElement
      if (!d || !track.hasPointerCapture(e.pointerId)) return
      const now = minutesFromPointer(track, e.clientX)

      if (d.mode === 'move') {
        // Kuerzesten Weg nehmen, damit ein Zug knapp ueber Mitternacht nicht um fast
        // einen ganzen Tag springt.
        let delta = now - d.grabbedAt
        if (delta > MINUTES_PER_DAY / 2) delta -= MINUTES_PER_DAY
        if (delta < -MINUTES_PER_DAY / 2) delta += MINUTES_PER_DAY
        if (delta === 0) return
        d.moved = true
        updateScheduleEntry(entity.id, d.entryId, {
          timeStart: wrapMinutes(d.origStart + delta),
          timeEnd: wrapMinutes(d.origEnd + delta),
        })
        return
      }

      // start === end waere ein Fenster ueber den ganzen Tag - hier immer ungewollt.
      if (d.mode === 'start') {
        if (now === d.origEnd || windowDuration(now, d.origEnd) < MIN_WINDOW) return
        d.moved = true
        updateScheduleEntry(entity.id, d.entryId, { timeStart: now })
      } else {
        if (now === d.origStart || windowDuration(d.origStart, now) < MIN_WINDOW) return
        d.moved = true
        updateScheduleEntry(entity.id, d.entryId, { timeEnd: now })
      }
    },
    [entity.id, updateScheduleEntry, minutesFromPointer],
  )

  const onLaneUp = useCallback((e: React.PointerEvent) => {
    const track = e.currentTarget as HTMLElement
    if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId)
    if (drag.current) lastSegmentAt.current = Date.now()
    drag.current = null
  }, [])

  // Klick auf freie Spurflaeche: neues Zeitfenster ab dieser Uhrzeit anlegen.
  const onLaneClick = useCallback(
    (e: React.MouseEvent, day: number | null) => {
      // Der Klick gehoert zum gerade beendeten Zug auf einem Block, nicht der Spur.
      if (Date.now() - lastSegmentAt.current < 400) return
      if (readOnly) return
      const track = e.currentTarget as HTMLElement
      const start = minutesFromPointer(track, e.clientX)
      const id = addScheduleEntry(entity.id, {
        timeStart: start,
        timeEnd: wrapMinutes(start + NEW_WINDOW),
        day,
      })
      if (id) {
        setSelectedId(id)
        // Ohne aktiven Tageszeit-Filter wandern die Pins auf der Karte nicht mit - der
        // frisch angelegte Tagesablauf haette sichtbar keine Wirkung.
        setTimeEnabled(true)
      }
    },
    [readOnly, entity.id, addScheduleEntry, minutesFromPointer, setTimeEnabled],
  )

  function renderLane(entries: ScheduleEntry[], day: number | null) {
    return (
      <div
        className="daytrack__lane"
        onClick={(e) => onLaneClick(e, day)}
        onPointerMove={onLaneMove}
        onPointerUp={onLaneUp}
        onPointerCancel={onLaneUp}
        onLostPointerCapture={onLaneUp}
      >
        {entries.map((s) =>
          windowSegments(s.timeStart, s.timeEnd).map((seg, i, all) => (
            <div
              key={`${s.id}-${i}`}
              className={`dayseg${selectedId === s.id ? ' is-selected' : ''}${
                day != null ? ' dayseg--exception' : ''
              }`}
              style={{
                left: pct(seg.from),
                width: pct(seg.to - seg.from),
                ['--chip-color' as string]: meta.color,
              }}
              title={`${formatTime(s.timeStart)}–${formatTime(s.timeEnd)}${s.label ? ` · ${s.label}` : ''}`}
              onPointerDown={(e) => onSegmentDown(e, s, 'move')}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="dayseg__label">{s.label || formatTime(s.timeStart)}</span>
              {i === 0 && (
                <span
                  className="dayseg__handle dayseg__handle--start"
                  onPointerDown={(e) => onSegmentDown(e, s, 'start')}
                />
              )}
              {i === all.length - 1 && (
                <span
                  className="dayseg__handle dayseg__handle--end"
                  onPointerDown={(e) => onSegmentDown(e, s, 'end')}
                />
              )}
            </div>
          )),
        )}
        <div className="daytrack__now" style={{ left: pct(timeOfDay) }} />
      </div>
    )
  }

  const hasOverlap = [standard, exceptions].some((list) =>
    list.some((a, i) => list.slice(i + 1).some((b) => windowsOverlap(a, b))),
  )

  return (
    <div className="dayschedule">
      {!timeEnabled && entity.schedule.length > 0 && (
        <div className="dayschedule__banner">
          Der Tageszeit-Filter ist aus — die Objekte stehen auf der Karte an ihrer normalen
          Position, unabhaengig vom Tagesablauf.
          <button className="btn btn--sm btn--primary" onClick={() => setTimeEnabled(true)}>
            Einschalten
          </button>
        </div>
      )}

      <div className="daytrack">
        <div className="daytrack__hours">
          {Array.from({ length: 9 }, (_, i) => i * 3).map((h) => (
            <span key={h} className="daytrack__hour" style={{ left: pct(h * 60) }}>
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>

        <div className="daytrack__row">
          <span className="daytrack__lanelabel">Jeden Tag</span>
          {renderLane(standard, null)}
        </div>

        <div className="daytrack__row">
          <span className="daytrack__lanelabel daytrack__lanelabel--exception">
            Nur Tag {currentDay}
          </span>
          {renderLane(exceptions, currentDay)}
        </div>
      </div>

      <div className="dayschedule__hint">
        {readOnly
          ? 'Im Spieltischmodus ist der Tagesablauf schreibgeschuetzt.'
          : 'Auf freie Flaeche klicken legt ein Zeitfenster an · Block ziehen verschiebt · Rand ziehen dehnt · Einträge in "Nur Tag N" schlagen den Standardplan.'}
        {hasOverlap && (
          <span className="dayschedule__warn"> ⚠ Zeitfenster derselben Spur ueberschneiden sich — es gilt das zuerst angelegte.</span>
        )}
      </div>

      {selected ? (
        <div className="dayedit">
          <label className="dayedit__field">
            <span>Von</span>
            <input
              className="field__control field__control--sm"
              type="time"
              value={formatTime(selected.timeStart)}
              disabled={readOnly}
              onChange={(e) => {
                const v = parseTime(e.target.value)
                if (v != null) updateScheduleEntry(entity.id, selected.id, { timeStart: v })
              }}
            />
          </label>
          <label className="dayedit__field">
            <span>Bis</span>
            <input
              className="field__control field__control--sm"
              type="time"
              value={formatTime(selected.timeEnd)}
              disabled={readOnly}
              onChange={(e) => {
                const v = parseTime(e.target.value)
                if (v != null) updateScheduleEntry(entity.id, selected.id, { timeEnd: v })
              }}
            />
          </label>
          <label className="dayedit__field dayedit__field--grow">
            <span>Beschriftung</span>
            <input
              className="field__control field__control--sm"
              value={selected.label}
              placeholder="z.B. Marktplatz"
              disabled={readOnly}
              onChange={(e) => updateScheduleEntry(entity.id, selected.id, { label: e.target.value })}
            />
          </label>
          <label className="dayedit__field">
            <span>Gilt</span>
            <select
              className="field__control field__control--sm"
              value={selected.day == null ? 'standard' : 'exception'}
              disabled={readOnly}
              onChange={(e) =>
                updateScheduleEntry(entity.id, selected.id, {
                  day: e.target.value === 'standard' ? null : currentDay,
                })
              }
            >
              <option value="standard">Jeden Tag</option>
              <option value="exception">Nur Tag {currentDay}</option>
            </select>
          </label>

          <button
            className={`btn btn--sm${
              placingScheduleId?.scheduleId === selected.id ? ' btn--active' : ''
            }`}
            disabled={readOnly}
            title="Danach auf die Karte klicken, um den Aufenthaltsort zu setzen"
            onClick={() =>
              setPlacingSchedule(
                placingScheduleId?.scheduleId === selected.id
                  ? null
                  : { entityId: entity.id, scheduleId: selected.id },
              )
            }
          >
            {placingScheduleId?.scheduleId === selected.id
              ? 'Auf die Karte klicken …'
              : '\u{1F4CD} Ort auf Karte setzen'}
          </button>
          <button
            className="btn btn--sm btn--danger"
            disabled={readOnly}
            onClick={() => {
              removeScheduleEntry(entity.id, selected.id)
              setSelectedId(null)
            }}
          >
            Entfernen
          </button>
          <button className="btn btn--sm" onClick={() => setTimeOfDay(selected.timeStart)}>
            Uhrzeit hierhin
          </button>
        </div>
      ) : (
        <p className="dayschedule__empty">
          {entity.schedule.length === 0
            ? 'Noch kein Tagesablauf — klicke in eine Spur, um ein Zeitfenster anzulegen.'
            : 'Zeitfenster anklicken, um Uhrzeit, Beschriftung und Ort zu bearbeiten.'}
        </p>
      )}
    </div>
  )
}
