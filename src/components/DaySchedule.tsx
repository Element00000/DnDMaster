import { useCallback, useRef, useState } from 'react'
import { entityDisplayMeta } from '../types'
import type { Entity, ScheduleKey } from '../types'
import { useStore } from '../store/useStore'
import { MINUTES_PER_DAY, formatTime, keyEndsAt, parseTime, scheduleForDay } from '../utils/time'

/** Raster, auf das Ziehen und Klicken im Zeitstrahl einrastet (Minuten). */
const SNAP = 15

function pct(minutes: number): string {
  return `${(minutes / MINUTES_PER_DAY) * 100}%`
}

/** Auf den Tag begrenzen: 0 Uhr bis zum letzten Rasterschritt davor. */
function clampTime(minutes: number): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY - SNAP, minutes))
}

/** Welche Punkte gehoeren in eine Spur? */
interface Lane {
  /** Objekt, dessen Tagesablauf die Spur zeigt. */
  entity: Entity
  label: string
  /** null = Standardplan, Zahl = Ausnahme dieses Kalendertags. */
  day: number | null
  keys: ScheduleKey[]
}

/**
 * Tagesablauf als 24-Stunden-Zeitstrahl mit Schluesselpunkten: Ein Punkt haelt fest, wo ein
 * Objekt ab dieser Uhrzeit steht - bis der naechste Punkt es weiterschickt. Die
 * Basis-Platzierung ist der feste Punkt um 0 Uhr.
 *
 * Der Ablauf ist dreiteilig: Uhrzeit am Zeiger einstellen, Objekte auf der Karte an ihren
 * Platz schieben, Punkt setzen. Das Verschieben wird bis dahin nur vorgemerkt (siehe
 * draftPos im Store), damit es nicht den zuletzt gueltigen Punkt mitverschiebt.
 *
 * Sind mehrere Objekte ausgewaehlt, bekommt jedes eine eigene Spur und ein Klick auf ◆
 * setzt fuer alle gemeinsam einen Punkt.
 */
export function DaySchedule({ entities }: { entities: Entity[] }) {
  const timeOfDay = useStore((s) => s.timeOfDay)
  const currentDay = useStore((s) => s.currentDay)
  const tableMode = useStore((s) => s.tableMode)
  const setTimeOfDay = useStore((s) => s.setTimeOfDay)
  const addScheduleKey = useStore((s) => s.addScheduleKey)
  const updateScheduleKey = useStore((s) => s.updateScheduleKey)
  const removeScheduleKey = useStore((s) => s.removeScheduleKey)
  const placingScheduleId = useStore((s) => s.placingScheduleId)
  const setPlacingSchedule = useStore((s) => s.setPlacingSchedule)
  const draftPos = useStore((s) => s.draftPos)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exceptionOpen, setExceptionOpen] = useState(false)
  const scaleRef = useRef<HTMLDivElement>(null)
  const keyDrag = useRef<{ entityId: string; keyId: string; grabbedAt: number; origTime: number } | null>(null)
  const lastKeyAt = useRef(0)

  const readOnly = tableMode
  const single = entities.length === 1
  const selected = entities.flatMap((e) => e.schedule).find((k) => k.id === selectedId) ?? null
  const selectedOwner = entities.find((e) => e.schedule.some((k) => k.id === selectedId)) ?? null
  const hasDraft = entities.some((e) => draftPos[e.id])
  const anyKeys = entities.some((e) => scheduleForDay(e.schedule, currentDay).length > 0)
  const hasExceptions = entities.some((e) => e.schedule.some((k) => k.day === currentDay))
  // Sind fuer diesen Tag schon Ausnahmen hinterlegt, muss die Spur natuerlich zu sehen sein.
  const showException = single && (exceptionOpen || hasExceptions)

  // Bei einem Objekt trennen die Spuren Standardplan und Ausnahme, bei mehreren steht
  // eine Spur je Objekt - sonst laegen die Punkte verschiedener Figuren uebereinander.
  const lanes: Lane[] = single
    ? [
        {
          entity: entities[0],
          label: 'Jeden Tag',
          day: null,
          keys: entities[0].schedule.filter((k) => k.day == null).sort((a, b) => a.time - b.time),
        },
        ...(showException
          ? [
              {
                entity: entities[0],
                label: `Nur Tag ${currentDay}`,
                day: currentDay as number | null,
                keys: entities[0].schedule.filter((k) => k.day === currentDay).sort((a, b) => a.time - b.time),
              },
            ]
          : []),
      ]
    : entities.map((e) => ({
        entity: e,
        label: e.name,
        day: null,
        keys: scheduleForDay(e.schedule, currentDay),
      }))

  /** Uhrzeit an einer Zeigerposition - gemessen an der Skala, die alle Spuren teilen. */
  const minutesFromPointer = useCallback((clientX: number): number => {
    const el = scaleRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return 0
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    // Begrenzen statt umlaufen zu lassen: Am rechten Rand ergaebe die Rundung sonst
    // 24:00 und damit wieder 0 Uhr, der Zeiger spraenge also an den Anfang zurueck.
    return clampTime(Math.round((ratio * MINUTES_PER_DAY) / SNAP) * SNAP)
  }, [])

  /** Punkt setzen - fuer alle ausgewaehlten Objekte auf einmal. */
  function setKeys(day: number | null) {
    if (readOnly) return
    let firstId: string | null = null
    for (const e of entities) {
      const id = addScheduleKey(e.id, { time: timeOfDay, day })
      if (id && !firstId) firstId = id
    }
    if (firstId) setSelectedId(firstId)
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
  const onKeyPointerDown = useCallback(
    (e: React.PointerEvent, entityId: string, key: ScheduleKey) => {
      if (readOnly || e.button !== 0) return
      e.stopPropagation()
      const lane = e.currentTarget.closest('.daytrack__lane') as HTMLElement | null
      if (!lane) return
      lane.setPointerCapture(e.pointerId)
      lastKeyAt.current = Date.now()
      keyDrag.current = { entityId, keyId: key.id, grabbedAt: minutesFromPointer(e.clientX), origTime: key.time }
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
      const time = clampTime(d.origTime + delta)
      updateScheduleKey(d.entityId, d.keyId, { time })
      setTimeOfDay(time)
    },
    [updateScheduleKey, minutesFromPointer, setTimeOfDay],
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

  function renderLane(lane: Lane) {
    const meta = entityDisplayMeta(lane.entity)
    const isBaseLane = lane.day == null
    const showBase = isBaseLane && !lane.keys.some((k) => k.time === 0)
    return (
      <div className="daytrack__row" key={`${lane.entity.id}-${lane.day ?? 'std'}`}>
        <span
          className={`daytrack__lanelabel${lane.day != null ? ' daytrack__lanelabel--exception' : ''}`}
          title={lane.label}
        >
          {lane.label}
        </span>
        <div
          className="daytrack__lane"
          onClick={onLaneClick}
          onPointerMove={onLaneMove}
          onPointerUp={onLaneUp}
          onPointerCancel={onLaneUp}
          onLostPointerCapture={onLaneUp}
        >
          {/* Die Basis-Platzierung ist der feste Punkt um 0 Uhr. Sie steht nicht in den
              Daten, wird aber gezeigt - gedaempft, weil sie nicht zu bearbeiten ist und
              zurueckweicht, sobald man dort einen echten Punkt setzt. */}
          {showBase && (
            <>
              <div
                className="daykey__span daykey__span--base"
                style={{ left: 0, width: pct(lane.keys[0]?.time ?? MINUTES_PER_DAY) }}
              />
              <span
                className="daykey daykey--base"
                style={{ left: 0 }}
                title="Basisposition — gilt, bis der erste Punkt kommt"
              >
                <span className="daykey__diamond" />
              </span>
            </>
          )}

          {/* Der Abschnitt, den ein Punkt abdeckt: von ihm bis zum naechsten. */}
          {lane.keys.map((k, i) => (
            <div
              key={`span-${k.id}`}
              className={`daykey__span${k.day != null ? ' is-exception' : ''}`}
              style={{
                left: pct(k.time),
                width: pct(keyEndsAt(lane.keys, i) - k.time),
                ['--chip-color' as string]: meta.color,
              }}
            />
          ))}

          {lane.keys.map((k) => (
            <button
              key={k.id}
              className={`daykey${selectedId === k.id ? ' is-selected' : ''}${
                k.day != null ? ' daykey--exception' : ''
              }`}
              style={{ left: pct(k.time), ['--chip-color' as string]: meta.color }}
              title={`${formatTime(k.time)}${k.label ? ` · ${k.label}` : ''}`}
              onPointerDown={(e) => onKeyPointerDown(e, lane.entity.id, k)}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="daykey__diamond" />
              {k.label && <span className="daykey__label">{k.label}</span>}
            </button>
          ))}
        </div>
        <button
          className={`daytrack__add${draftPos[lane.entity.id] && isBaseLane ? ' is-pending' : ''}`}
          disabled={readOnly}
          onClick={() => (single ? setKeys(lane.day) : addScheduleKey(lane.entity.id, { time: timeOfDay }))}
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

        {lanes.map(renderLane)}

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

      <div className="dayschedule__actions">
        {!single && !readOnly && (
          <button className="btn btn--sm btn--primary" onClick={() => setKeys(null)}>
            ◆ Punkt fuer alle {entities.length} setzen
          </button>
        )}
        {single && !showException && !readOnly && (
          <button className="dayschedule__addlane" onClick={() => setExceptionOpen(true)}>
            + Ausnahme fuer Tag {currentDay}
          </button>
        )}
      </div>

      <p className={`dayschedule__hint${hasDraft ? ' is-pending' : ''}`}>
        {readOnly
          ? 'Im Spieltischmodus ist der Tagesablauf schreibgeschuetzt.'
          : hasDraft
            ? `Neue Stelle fuer ${formatTime(timeOfDay)} vorgemerkt — mit ◆ festhalten.`
            : 'Zuerst die Uhrzeit am Zeiger ziehen, dann die Figur auf der Karte an ihren Platz schieben, dann mit ◆ den Punkt setzen. Vor dem ersten Punkt gilt die normale Position.'}
      </p>

      {selected && selectedOwner ? (
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
                if (v != null) updateScheduleKey(selectedOwner.id, selected.id, { time: v })
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
              onChange={(e) => updateScheduleKey(selectedOwner.id, selected.id, { label: e.target.value })}
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
                updateScheduleKey(selectedOwner.id, selected.id, { day })
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
                  : { entityId: selectedOwner.id, scheduleId: selected.id },
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
              removeScheduleKey(selectedOwner.id, selected.id)
              setSelectedId(null)
            }}
          >
            Entfernen
          </button>
        </div>
      ) : (
        <p className="dayschedule__empty">
          {!anyKeys
            ? 'Noch kein Tagesablauf — die Objekte bleiben den ganzen Tag an ihrer Position.'
            : 'Punkt anklicken, um Uhrzeit, Beschriftung und Ort zu bearbeiten.'}
        </p>
      )}
    </div>
  )
}
