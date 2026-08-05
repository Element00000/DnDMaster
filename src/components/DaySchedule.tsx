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
 * Standardmaessig gibt es nur die Spur, die an jedem Kampagnentag gilt. Eine zweite Spur
 * fuer Ausnahmen eines einzelnen Tages wird erst auf Wunsch eingeblendet.
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
  const [exceptionOpen, setExceptionOpen] = useState(false)
  const scaleRef = useRef<HTMLDivElement>(null)
  const keyDrag = useRef<{ keyId: string; grabbedAt: number; origTime: number } | null>(null)
  const lastKeyAt = useRef(0)

  const readOnly = tableMode
  const meta = entityDisplayMeta(entity)
  const standard = entity.schedule.filter((k) => k.day == null).sort((a, b) => a.time - b.time)
  const exceptions = entity.schedule.filter((k) => k.day === currentDay).sort((a, b) => a.time - b.time)
  const selected = entity.schedule.find((k) => k.id === selectedId) ?? null
  const today = scheduleForDay(entity.schedule, currentDay)
  // Sind fuer diesen Tag schon Ausnahmen hinterlegt, muss die Spur natuerlich zu sehen sein.
  const showException = exceptionOpen || exceptions.length > 0

  /** Uhrzeit an einer Zeigerposition - gemessen an der Skala, die alle Spuren teilen. */
  const minutesFromPointer = useCallback((clientX: number): number => {
    const el = scaleRef.current
    if (!el) return 0
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

  // ---------- Abspielkopf ziehen ----------
  const onScrubDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onScrubMove = useCallback(
    (e: React.PointerEvent) => {
      if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
      setTimeOfDay(minutesFromPointer(e.clientX))
    },
    [minutesFromPointer, setTimeOfDay],
  )

  const onScrubUp = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }, [])

  // ---------- Schluesselpunkt verschieben ----------
  const onKeyDown = useCallback(
    (e: React.PointerEvent, key: ScheduleKey) => {
      if (readOnly || e.button !== 0) return
      e.stopPropagation()
      const lane = e.currentTarget.closest('.daytrack__lane') as HTMLElement | null
      if (!lane) return
      lane.setPointerCapture(e.pointerId)
      lastKeyAt.current = Date.now()
      keyDrag.current = { keyId: key.id, grabbedAt: minutesFromPointer(e.clientX), origTime: key.time }
      setSelectedId(key.id)
      setTimeOfDay(key.time)
    },
    [readOnly, minutesFromPointer, setTimeOfDay],
  )

  const onLaneMove = useCallback(
    (e: React.PointerEvent) => {
      const d = keyDrag.current
      const lane = e.currentTarget as HTMLElement
      if (!d || !lane.hasPointerCapture(e.pointerId)) return
      const delta = minutesFromPointer(e.clientX) - d.grabbedAt
      if (delta === 0) return
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
    if (keyDrag.current) lastKeyAt.current = Date.now()
    keyDrag.current = null
  }, [])

  // Klick auf freie Spurflaeche setzt nur die Uhrzeit - Punkte entstehen ueber den Knopf,
  // damit nicht jeder Klick auf der Suche nach dem richtigen Moment einen hinterlaesst.
  const onLaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (Date.now() - lastKeyAt.current < 400) return
      setTimeOfDay(minutesFromPointer(e.clientX))
    },
    [minutesFromPointer, setTimeOfDay],
  )

  function renderRow(label: string, keys: ScheduleKey[], day: number | null) {
    return (
      <div className="daytrack__row">
        <span className={`daytrack__lanelabel${day != null ? ' daytrack__lanelabel--exception' : ''}`}>
          {label}
        </span>
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
        </div>
        <button
          className="daytrack__add"
          disabled={readOnly}
          onClick={() => setKey(day)}
          title={`Punkt bei ${formatTime(timeOfDay)} setzen`}
        >
          ◆
        </button>
      </div>
    )
  }

  return (
    <div className="dayschedule">
      <div className="daytrack">
        <div className="daytrack__hours">
          {Array.from({ length: 9 }, (_, i) => i * 3).map((h) => (
            <span key={h} className="daytrack__hour" style={{ left: pct(h * 60) }}>
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>

        {renderRow('Jeden Tag', standard, null)}
        {showException && renderRow(`Nur Tag ${currentDay}`, exceptions, currentDay)}

        {/* Abspielkopf ueber alle Spuren. Liegt in einer eigenen Ebene, die genau den
            Bereich der Spuren abdeckt - so laesst er sich auch oben an der Stundenleiste
            greifen, wo keine Spur im Weg ist. */}
        <div className="daytrack__scale" ref={scaleRef}>
          <div
            className="daytrack__now"
            style={{ left: pct(timeOfDay) }}
            title={`${formatTime(timeOfDay)} — ziehen, um die Uhrzeit zu aendern`}
            onPointerDown={onScrubDown}
            onPointerMove={onScrubMove}
            onPointerUp={onScrubUp}
            onPointerCancel={onScrubUp}
          >
            <span className="daytrack__now-grip">{formatTime(timeOfDay)}</span>
          </div>
        </div>
      </div>

      {!showException && !readOnly && (
        <button className="dayschedule__addlane" onClick={() => setExceptionOpen(true)}>
          + Ausnahme fuer Tag {currentDay}
        </button>
      )}

      <p className="dayschedule__hint">
        {readOnly
          ? 'Im Spieltischmodus ist der Tagesablauf schreibgeschuetzt.'
          : 'Ab 0 Uhr gilt die normale Position des Objekts. Uhrzeit am Zeiger ziehen, dann mit ◆ einen Punkt setzen — ab dort steht es an der neuen Stelle, bis der naechste Punkt kommt.'}
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
              onChange={(e) => {
                const day = e.target.value === 'standard' ? null : currentDay
                if (day != null) setExceptionOpen(true)
                updateScheduleKey(entity.id, selected.id, { day })
              }}
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
