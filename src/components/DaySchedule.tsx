import { useCallback, useRef, useState } from 'react'
import { entityDisplayMeta } from '../types'
import type { Entity, ScheduleKey } from '../types'
import { useStore } from '../store/useStore'
import { MINUTES_PER_DAY, formatTime, keyEndsAt, parseTime, scheduleForDay, wrapMinutes } from '../utils/time'

/** Raster, auf das Ziehen und Klicken im Zeitstrahl einrastet (Minuten). */
const SNAP = 15

function pct(minutes: number): string {
  return `${(minutes / MINUTES_PER_DAY) * 100}%`
}

/**
 * Tagesablauf eines Objekts als 24-Stunden-Zeitstrahl mit Schluesselpunkten: Jeder Punkt
 * haelt fest, wo das Objekt ab dieser Uhrzeit steht - bis der naechste Punkt es
 * weiterschickt. Die Basis-Platzierung ist der feste Punkt um 0 Uhr.
 *
 * Zwei Spuren: der Standardplan, der an jedem Kampagnentag gilt, und die Ausnahmen des
 * aktuell eingestellten Kalendertags, die den Standard ueberschreiben.
 */
export function DaySchedule({ entity }: { entity: Entity }) {
  const timeOfDay = useStore((s) => s.timeOfDay)
  const currentDay = useStore((s) => s.currentDay)
  const tableMode = useStore((s) => s.tableMode)
  const setTimeOfDay = useStore((s) => s.setTimeOfDay)
  const addScheduleKey = useStore((s) => s.addScheduleKey)
  const updateScheduleKey = useStore((s) => s.updateScheduleKey)
  const removeScheduleKey = useStore((s) => s.removeScheduleKey)
  const placingScheduleId = useStore((s) => s.placingScheduleId)
  const setPlacingSchedule = useStore((s) => s.setPlacingSchedule)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const drag = useRef<{ keyId: string; grabbedAt: number; origTime: number; moved: boolean } | null>(null)
  const lastKeyAt = useRef(0)

  const readOnly = tableMode
  const meta = entityDisplayMeta(entity)
  const standard = entity.schedule.filter((k) => k.day == null).sort((a, b) => a.time - b.time)
  const exceptions = entity.schedule.filter((k) => k.day === currentDay).sort((a, b) => a.time - b.time)
  const selected = entity.schedule.find((k) => k.id === selectedId) ?? null
  // Was gerade gilt - beides zusammen, wie es die Karte auswertet.
  const today = scheduleForDay(entity.schedule, currentDay)

  const minutesFromPointer = useCallback((el: HTMLElement, clientX: number): number => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return 0
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return wrapMinutes(Math.round((ratio * MINUTES_PER_DAY) / SNAP) * SNAP)
  }, [])

  function setKey(day: number | null) {
    if (readOnly) return
    const id = addScheduleKey(entity.id, { time: timeOfDay, day })
    if (id) setSelectedId(id)
  }

  // ---------- Schluesselpunkt verschieben ----------
  const onKeyDown = useCallback(
    (e: React.PointerEvent, key: ScheduleKey) => {
      if (readOnly || e.button !== 0) return
      e.stopPropagation()
      const lane = e.currentTarget.closest('.daytrack__lane') as HTMLElement | null
      if (!lane) return
      lane.setPointerCapture(e.pointerId)
      lastKeyAt.current = Date.now()
      drag.current = {
        keyId: key.id,
        grabbedAt: minutesFromPointer(lane, e.clientX),
        origTime: key.time,
        moved: false,
      }
      setSelectedId(key.id)
      setTimeOfDay(key.time)
    },
    [readOnly, minutesFromPointer, setTimeOfDay],
  )

  const onLaneMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      const lane = e.currentTarget as HTMLElement
      if (!d || !lane.hasPointerCapture(e.pointerId)) return
      const now = minutesFromPointer(lane, e.clientX)
      const delta = now - d.grabbedAt
      if (delta === 0) return
      d.moved = true
      // 0 Uhr bleibt der Basis-Platzierung vorbehalten, daher erst ab dem naechsten Raster.
      const time = Math.max(SNAP, Math.min(MINUTES_PER_DAY - SNAP, d.origTime + delta))
      updateScheduleKey(entity.id, d.keyId, { time })
      setTimeOfDay(time)
    },
    [entity.id, updateScheduleKey, minutesFromPointer, setTimeOfDay],
  )

  const onLaneUp = useCallback((e: React.PointerEvent) => {
    const lane = e.currentTarget as HTMLElement
    if (lane.hasPointerCapture(e.pointerId)) lane.releasePointerCapture(e.pointerId)
    if (drag.current) lastKeyAt.current = Date.now()
    drag.current = null
  }, [])

  // Klick auf freie Spurflaeche setzt nur die Uhrzeit - gesetzt wird per Knopf, damit
  // nicht jeder Klick auf der Suche nach dem richtigen Moment einen Punkt hinterlaesst.
  const onLaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (Date.now() - lastKeyAt.current < 400) return
      setTimeOfDay(minutesFromPointer(e.currentTarget as HTMLElement, e.clientX))
    },
    [minutesFromPointer, setTimeOfDay],
  )

  function renderLane(keys: ScheduleKey[], day: number | null) {
    return (
      <div
        className="daytrack__lane"
        onClick={onLaneClick}
        onPointerMove={onLaneMove}
        onPointerUp={onLaneUp}
        onPointerCancel={onLaneUp}
        onLostPointerCapture={onLaneUp}
      >
        {/* Der Abschnitt, den ein Punkt abdeckt: von ihm bis zum naechsten. */}
        {keys.map((k, i) => (
          <div
            key={`span-${k.id}`}
            className={`daykey__span${day != null ? ' is-exception' : ''}`}
            style={{
              left: pct(k.time),
              width: pct(keyEndsAt(keys, i) - k.time),
              ['--chip-color' as string]: meta.color,
            }}
          />
        ))}

        {keys.map((k) => (
          <button
            key={k.id}
            className={`daykey${selectedId === k.id ? ' is-selected' : ''}${
              day != null ? ' daykey--exception' : ''
            }`}
            style={{ left: pct(k.time), ['--chip-color' as string]: meta.color }}
            title={`${formatTime(k.time)}${k.label ? ` · ${k.label}` : ''}`}
            onPointerDown={(e) => onKeyDown(e, k)}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="daykey__diamond" />
            {k.label && <span className="daykey__label">{k.label}</span>}
          </button>
        ))}

        <div className="daytrack__now" style={{ left: pct(timeOfDay) }} />
      </div>
    )
  }

  return (
    <div className="dayschedule">
      <div className="dayschedule__toolbar">
        <span className="dayschedule__clock">{formatTime(timeOfDay)}</span>
        <input
          className="dayschedule__range"
          type="range"
          min={0}
          max={MINUTES_PER_DAY - SNAP}
          step={SNAP}
          value={timeOfDay}
          onChange={(e) => setTimeOfDay(Number(e.target.value))}
          title="Zeitpunkt waehlen"
        />
        <button className="btn btn--sm btn--primary" disabled={readOnly} onClick={() => setKey(null)}>
          ◆ Punkt setzen
        </button>
        <button
          className="btn btn--sm"
          disabled={readOnly}
          onClick={() => setKey(currentDay)}
          title={`Nur fuer Tag ${currentDay}`}
        >
          ◇ Nur Tag {currentDay}
        </button>
      </div>

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
          <span className="daytrack__lanelabel daytrack__lanelabel--exception">Nur Tag {currentDay}</span>
          {renderLane(exceptions, currentDay)}
        </div>
      </div>

      <p className="dayschedule__hint">
        {readOnly
          ? 'Im Spieltischmodus ist der Tagesablauf schreibgeschuetzt.'
          : 'Ab 0 Uhr gilt die normale Position des Objekts. Zeitpunkt waehlen, dann Punkt setzen — ab dort steht es an der neuen Stelle, bis der naechste Punkt kommt.'}
      </p>

      {selected ? (
        <div className="dayedit">
          <label className="dayedit__field">
            <span>Ab</span>
            <input
              className="field__control field__control--sm"
              type="time"
              value={formatTime(selected.time)}
              disabled={readOnly}
              onChange={(e) => {
                const v = parseTime(e.target.value)
                if (v != null) updateScheduleKey(entity.id, selected.id, { time: v })
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
              onChange={(e) => updateScheduleKey(entity.id, selected.id, { label: e.target.value })}
            />
          </label>
          <label className="dayedit__field">
            <span>Gilt</span>
            <select
              className="field__control field__control--sm"
              value={selected.day == null ? 'standard' : 'exception'}
              disabled={readOnly}
              onChange={(e) =>
                updateScheduleKey(entity.id, selected.id, {
                  day: e.target.value === 'standard' ? null : currentDay,
                })
              }
            >
              <option value="standard">Jeden Tag</option>
              <option value="exception">Nur Tag {currentDay}</option>
            </select>
          </label>

          <button
            className={`btn btn--sm${placingScheduleId?.scheduleId === selected.id ? ' btn--active' : ''}`}
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
              removeScheduleKey(entity.id, selected.id)
              setSelectedId(null)
            }}
          >
            Entfernen
          </button>
        </div>
      ) : (
        <p className="dayschedule__empty">
          {today.length === 0
            ? 'Noch kein Tagesablauf — das Objekt bleibt den ganzen Tag an seiner Position.'
            : 'Punkt anklicken, um Uhrzeit, Beschriftung und Ort zu bearbeiten.'}
        </p>
      )}
    </div>
  )
}
