import { useCallback, useRef, useState } from 'react'
import { entityDisplayMeta, isAtBase } from '../types'
import type { Entity, Timestone } from '../types'
import { useStore } from '../store/useStore'
import { MINUTES_PER_DAY, formatTime, timestoneEndsAt, scheduleForDay } from '../utils/time'

/** Raster, auf das Ziehen und Klicken im Zeitstrahl einrastet (Minuten). */
const SNAP = 15

function pct(minutes: number): string {
  return `${(minutes / MINUTES_PER_DAY) * 100}%`
}

/**
 * Aufs Raster legen und auf den Tag begrenzen: 0 Uhr bis 23:59. Das Tagesende faellt
 * bewusst aus dem Raster - 24:00 waere wieder 0 Uhr, wo schon die Basis-Platzierung sitzt,
 * also endet die Spur eine Minute davor.
 */
function clampTime(minutes: number): number {
  const snapped = Math.round(minutes / SNAP) * SNAP
  return Math.max(0, Math.min(MINUTES_PER_DAY - 1, snapped))
}

/** Welche Timestones gehoeren in eine Spur? */
interface Lane {
  /** Objekt, dessen Tagesablauf die Spur zeigt. */
  entity: Entity
  label: string
  /** null = Standardplan, Zahl = Ausnahme dieses Kalendertags. */
  day: number | null
  keys: Timestone[]
}

/**
 * Tagesablauf als 24-Stunden-Zeitstrahl mit Timestones: Ein Timestone haelt fest, wo ein
 * Objekt ab dieser Uhrzeit steht - bis der naechste Timestone es weiterschickt. Die
 * Basis-Platzierung ist der feste Timestone um 0 Uhr.
 *
 * Der Ablauf ist dreiteilig: Uhrzeit am Zeiger einstellen, Objekte auf der Karte an ihren
 * Platz schieben, Timestone setzen. Das Verschieben wird bis dahin nur vorgemerkt (siehe
 * draftPos im Store), damit es nicht den zuletzt gueltigen Timestone mitverschiebt.
 *
 * Sind mehrere Objekte ausgewaehlt, bekommt jedes eine eigene Spur und ein Klick auf ◆
 * setzt fuer alle gemeinsam einen Timestone.
 */
export function DaySchedule({ entities }: { entities: Entity[] }) {
  const timeOfDay = useStore((s) => s.timeOfDay)
  const currentDay = useStore((s) => s.currentDay)
  const tableMode = useStore((s) => s.tableMode)
  const setTimeOfDay = useStore((s) => s.setTimeOfDay)
  const addTimestone = useStore((s) => s.addTimestone)
  const updateTimestone = useStore((s) => s.updateTimestone)
  const removeTimestone = useStore((s) => s.removeTimestone)
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
  const hasExceptions = entities.some((e) => e.schedule.some((k) => k.day === currentDay))
  // Sind fuer diesen Tag schon Ausnahmen hinterlegt, muss die Spur natuerlich zu sehen sein.
  const showException = single && (exceptionOpen || hasExceptions)

  // Bei einem Objekt trennen die Spuren Standardplan und Ausnahme, bei mehreren steht
  // eine Spur je Objekt - sonst laegen die Timestones verschiedener Figuren uebereinander.
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
    return clampTime(ratio * MINUTES_PER_DAY)
  }, [])

  /** Timestone setzen - fuer alle ausgewaehlten Objekte auf einmal. */
  function setKeys(day: number | null) {
    if (readOnly) return
    let firstId: string | null = null
    for (const e of entities) {
      const id = addTimestone(e.id, { time: timeOfDay, day })
      if (id && !firstId) firstId = id
    }
    if (firstId) setSelectedId(firstId)
  }

  /**
   * Timestone setzen, der zurueck an die Startposition fuehrt. Ohne ihn gilt der letzte Timestone
   * bis Mitternacht - die Figur bliebe also fuer den Rest des Tages dort stehen, wo sie
   * zuletzt hingeschickt wurde.
   */
  function setHomeKeys(list: Entity[], day: number | null) {
    if (readOnly) return
    let firstId: string | null = null
    for (const e of list) {
      if (!e.placement) continue
      // Ohne Beschriftung: Dass es die Startposition ist, ergibt sich aus der Position
      // selbst (isAtBase). Ein gespeichertes "Start" wuerde beim Verschieben luegen.
      const id = addTimestone(e.id, { time: timeOfDay, day, x: e.placement.x, y: e.placement.y })
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

  // ---------- Timestone verschieben ----------
  const onKeyPointerDown = useCallback(
    (e: React.PointerEvent, entityId: string, key: Timestone) => {
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
      updateTimestone(d.entityId, d.keyId, { time })
      setTimeOfDay(time)
    },
    [updateTimestone, minutesFromPointer, setTimeOfDay],
  )

  const onLaneUp = useCallback((e: React.PointerEvent) => {
    const lane = e.currentTarget as HTMLElement
    if (lane.hasPointerCapture(e.pointerId)) lane.releasePointerCapture(e.pointerId)
    if (keyDrag.current) lastKeyAt.current = Date.now()
    keyDrag.current = null
  }, [])

  // Klick auf freie Spurflaeche setzt nur die Uhrzeit - Timestones entstehen ueber den Knopf,
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
          {/* Die Basis-Platzierung ist der feste Timestone um 0 Uhr. Sie steht nicht in den
              Daten, wird aber gezeigt - gedaempft, weil sie nicht zu bearbeiten ist und
              zurueckweicht, sobald man dort einen echten Timestone setzt. */}
          {showBase && (
            <>
              <div
                className="daykey__span is-athome"
                style={{ left: 0, width: pct(lane.keys[0]?.time ?? MINUTES_PER_DAY) }}
              />
              <span
                className="daykey daykey--base is-athome"
                style={{ left: 0 }}
                title="Basisposition — gilt, bis der erste Timestone kommt"
              >
                <span className="daykey__diamond" />
              </span>
            </>
          )}

          {/* Der Abschnitt, den ein Timestone abdeckt: von ihm bis zum naechsten. */}
          {lane.keys.map((k, i) => (
            <div
              key={`span-${k.id}`}
              className={`daykey__span${k.day != null ? ' is-exception' : ''}${
                isAtBase(lane.entity, k) ? ' is-athome' : ''
              }`}
              style={{
                left: pct(k.time),
                width: pct(timestoneEndsAt(lane.keys, i) - k.time),
                ['--chip-color' as string]: meta.color,
              }}
            />
          ))}

          {lane.keys.map((k) => {
            // "Start" ist keine gespeicherte Beschriftung, sondern gilt genau solange der
            // Timestone auf der Startposition liegt.
            const caption = k.label || (isAtBase(lane.entity, k) ? 'Start' : '')
            return (
              <button
                key={k.id}
                className={`daykey${selectedId === k.id ? ' is-selected' : ''}${
                  k.day != null ? ' daykey--exception' : ''
                }${isAtBase(lane.entity, k) ? ' is-athome' : ''}`}
                style={{ left: pct(k.time), ['--chip-color' as string]: meta.color }}
                title={`${formatTime(k.time)}${caption ? ` · ${caption}` : ''}`}
                onPointerDown={(e) => onKeyPointerDown(e, lane.entity.id, k)}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="daykey__diamond" />
                {caption && <span className="daykey__label">{caption}</span>}
              </button>
            )
          })}
        </div>
        <div className="daytrack__laneactions">
          <button
            className={`daytrack__add${draftPos[lane.entity.id] && isBaseLane ? ' is-pending' : ''}`}
            disabled={readOnly}
            onClick={() => (single ? setKeys(lane.day) : addTimestone(lane.entity.id, { time: timeOfDay }))}
            title={`Timestone bei ${formatTime(timeOfDay)} setzen`}
          >
            ◆
          </button>
          <button
            className="daytrack__add"
            disabled={readOnly}
            onClick={() => setHomeKeys(single ? entities : [lane.entity], lane.day)}
            title={`Ab ${formatTime(timeOfDay)} wieder an der Startposition`}
          >
            ◇
          </button>
        </div>
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
          <>
            <button className="btn btn--sm btn--primary" onClick={() => setKeys(null)}>
              ◆ Timestone fuer alle {entities.length} setzen
            </button>
            <button
              className="btn btn--sm"
              onClick={() => setHomeKeys(entities, null)}
              title="Alle ab hier wieder an ihrer Startposition"
            >
              ◇ Alle zum Start
            </button>
          </>
        )}
        {single && !showException && !readOnly && (
          <button className="dayschedule__addlane" onClick={() => setExceptionOpen(true)}>
            + Ausnahme fuer Tag {currentDay}
          </button>
        )}
        {/* Der angeklickte Timestone laesst sich nur noch loeschen - Uhrzeit stellt man am
            Zeitstrahl ein, den Ort auf der Karte. Eine Eingabeleiste braucht es dafuer nicht. */}
        {selected && selectedOwner && !readOnly && (
          <button
            className="btn btn--sm btn--danger"
            onClick={() => {
              removeTimestone(selectedOwner.id, selected.id)
              setSelectedId(null)
            }}
          >
            Timestone entfernen
          </button>
        )}
      </div>

    </div>
  )
}
