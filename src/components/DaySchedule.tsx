import { useCallback, useRef, useState } from 'react'
import { entityDisplayMeta, isAtBase, phaseAt } from '../types'
import type { Entity, Timestone } from '../types'
import type { PhaseContext } from '../utils/time'
import { useStore } from '../store/useStore'
import {
  MINUTES_PER_DAY,
  activeTimestone,
  formatTime,
  timestoneEndsAt,
  scheduleForDay,
} from '../utils/time'

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

/**
 * Zerlegt den Balken eines Timestones in die Abschnitte, in denen er wirklich gilt, und
 * die, in denen ihn ein anderer abloest.
 *
 * Noetig, weil ein Balken nicht einfach bis zum naechsten Punkt seiner eigenen Spur laeuft:
 * Ein Kalendertermin setzt den Tagesablauf aus, und nach dem letzten Kalendertermin holt
 * der Tagesablauf die Figur zurueck (siehe activeTimestone). Wer nur den eigenen Balken
 * zeichnet, behauptet also eine Geltung, die es gar nicht gibt.
 *
 * "keyId = null" steht fuer die Basis-Platzierung, die keinen eigenen Timestone hat.
 */
function activeParts(
  entity: Entity,
  day: number,
  keyId: string | null,
  ctx: PhaseContext,
  from: number,
  to: number,
): { from: number; to: number; active: boolean }[] {
  // Der geltende Punkt kann nur an den Uhrzeiten wechseln, an denen heute einer liegt.
  const marks = new Set<number>([from, to])
  for (const s of scheduleForDay(entity.schedule, day, ctx)) {
    if (s.time > from && s.time < to) marks.add(s.time)
  }
  const points = [...marks].sort((a, b) => a - b)
  const parts: { from: number; to: number; active: boolean }[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const active = (activeTimestone(entity.schedule, points[i], day, ctx)?.id ?? null) === keyId
    const last = parts[parts.length - 1]
    // Gleichartige Abschnitte zusammenfassen, damit keine Fugen sichtbar werden.
    if (last && last.active === active) last.to = points[i + 1]
    else parts.push({ from: points[i], to: points[i + 1], active })
  }
  return parts
}

/**
 * Der Kalendertermin eines frueheren Tages, der heute um 0 Uhr noch gilt - also eine Reise,
 * die durch diesen Tag hindurchlaeuft. An diesem Tag steht kein eigener Punkt, die Figur ist
 * aber trotzdem unterwegs; ohne diesen Balken saehe die Spur leer aus.
 */
function carryIn(entity: Entity, day: number, ctx: PhaseContext): Timestone | undefined {
  const at0 = activeTimestone(entity.schedule, 0, day, ctx)
  return at0 && at0.day != null && at0.day !== day ? at0 : undefined
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
 * Angelegt werden Timestones auf der Karte: Figur an ihren Platz schieben, daneben die
 * Uhrzeit waehlen. Diese Spur zeigt das Ergebnis - wie lange das Objekt wo bleibt - und ist
 * der Platz fuer Ausnahmen an einzelnen Kalendertagen, die es auf der Karte nicht gibt.
 * Zeiten lassen sich hier nachtraeglich per Ziehen der Rauten geraderuecken.
 *
 * Sind mehrere Objekte ausgewaehlt, bekommt jedes eine eigene Spur und ein Klick auf ◆
 * setzt fuer alle gemeinsam einen Timestone.
 */
export function DaySchedule({ entities }: { entities: Entity[] }) {
  const timeOfDay = useStore((s) => s.timeOfDay)
  const currentDay = useStore((s) => s.currentDay)
  const campaign = useStore((s) => s.activeCampaign())
  // Die Phase des angezeigten Tages: Sie bestimmt, welche Punkte gelten und wo "Start" liegt.
  const phase = phaseAt(campaign.phases, currentDay)
  const tableMode = useStore((s) => s.tableMode)
  const setTimeOfDay = useStore((s) => s.setTimeOfDay)
  const addTimestone = useStore((s) => s.addTimestone)
  const updateTimestone = useStore((s) => s.updateTimestone)
  const removeTimestone = useStore((s) => s.removeTimestone)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exceptionOpen, setExceptionOpen] = useState(false)
  const scaleRef = useRef<HTMLDivElement>(null)
  const keyDrag = useRef<{ entityId: string; keyId: string; grabbedAt: number; origTime: number } | null>(null)
  const lastKeyAt = useRef(0)

  const readOnly = tableMode
  const single = entities.length === 1
  const selected = entities.flatMap((e) => e.schedule).find((k) => k.id === selectedId) ?? null
  const selectedOwner = entities.find((e) => e.schedule.some((k) => k.id === selectedId)) ?? null
  // Sind fuer diesen Tag Ausnahmen hinterlegt - oder laeuft eine Reise durch ihn hindurch -,
  // muss die Spur natuerlich zu sehen sein.
  const hasExceptions = entities.some(
    (e) => e.schedule.some((k) => k.day === currentDay) || carryIn(e, currentDay, campaign),
  )
  const showException = single && (exceptionOpen || hasExceptions)

  // Bei einem Objekt trennen die Spuren Standardplan und Ausnahme, bei mehreren steht
  // eine Spur je Objekt - sonst laegen die Timestones verschiedener Figuren uebereinander.
  const lanes: Lane[] = single
    ? [
        {
          entity: entities[0],
          label: 'Jeden Tag',
          day: null,
          // Nur der Ablauf dieser Phase: Der einer frueheren gehoert zu einem anderen Kapitel
          // und wird nur auf Nachfrage uebernommen.
          keys: entities[0].schedule
            .filter((k) => k.day == null && (k.phaseId ?? campaign.phases[0].id) === phase?.id)
            .sort((a, b) => a.time - b.time),
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
        keys: scheduleForDay(e.schedule, currentDay, campaign),
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
      // Karte der Startposition mitgeben: Sie muss nicht die sein, auf der die Figur
      // gerade steht - der Weg kann laengst auf einer anderen Karte weitergegangen sein.
      const id = addTimestone(e.id, {
        time: timeOfDay,
        day,
        layerId: e.placement.layerId,
        x: e.placement.x,
        y: e.placement.y,
      })
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
    // Kalendertermine stehen bei einem Objekt in der Ausnahmespur, bei mehreren in der
    // Spur des jeweiligen Objekts. Dorthin gehoert auch eine Reise, die von einem frueheren
    // Tag herueberlaeuft.
    const carry = !single || lane.day != null ? carryIn(lane.entity, currentDay, campaign) : undefined
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
              {activeParts(lane.entity, currentDay, null, campaign, 0, lane.keys[0]?.time ?? MINUTES_PER_DAY).map(
                (p) => (
                  <div
                    key={`base-${p.from}`}
                    className={`daykey__span is-athome${p.active ? '' : ' is-inactive'}`}
                    style={{ left: pct(p.from), width: pct(p.to - p.from) }}
                  />
                ),
              )}
              <span
                className="daykey daykey--base is-athome"
                style={{ left: 0 }}
                title="Basisposition — gilt, bis der erste Timestone kommt"
              >
                <span className="daykey__diamond" />
              </span>
            </>
          )}

          {/* Eine Reise, die schon gestern begonnen hat, laeuft hier ab 0 Uhr weiter - bis zum
              ersten eigenen Punkt des Tages, sonst durch den ganzen Tag. Ohne Raute: Der
              Punkt selbst liegt an einem anderen Tag und ist hier nicht zu bearbeiten. */}
          {carry &&
            activeParts(
              lane.entity,
              currentDay,
              carry.id,
              campaign,
              0,
              lane.keys[0]?.time ?? MINUTES_PER_DAY,
            ).map((p) => (
              <div
                key={`carry-${p.from}`}
                className={`daykey__span is-exception${p.active ? '' : ' is-inactive'}`}
                style={{ left: pct(p.from), width: pct(p.to - p.from) }}
                title={`Unterwegs seit Tag ${carry.day}, ${formatTime(carry.time)}`}
              />
            ))}

          {/* Der Abschnitt, den ein Timestone abdeckt: von ihm bis zum naechsten seiner Spur -
              aber nur dort ausgefuellt, wo er auch wirklich gilt. Blass heisst: Hier hat ihn
              ein anderer Punkt abgeloest. */}
          {lane.keys.flatMap((k, i) =>
            activeParts(lane.entity, currentDay, k.id, campaign, k.time, timestoneEndsAt(lane.keys, i)).map(
              (p) => (
                <div
                  key={`span-${k.id}-${p.from}`}
                  className={`daykey__span${k.day != null ? ' is-exception' : ''}${
                    isAtBase(lane.entity, k, phase) ? ' is-athome' : ''
                  }${p.active ? '' : ' is-inactive'}`}
                  style={{
                    left: pct(p.from),
                    width: pct(p.to - p.from),
                    ['--chip-color' as string]: meta.color,
                  }}
                />
              ),
            ),
          )}

          {lane.keys.map((k) => {
            // Kein abgeleitetes "Start": Dass ein Timestone auf der Startposition liegt,
            // zeigt schon seine graue, hohle Raute.
            const caption = k.label
            return (
              <button
                key={k.id}
                className={`daykey${selectedId === k.id ? ' is-selected' : ''}${
                  k.day != null ? ' daykey--exception' : ''
                }${isAtBase(lane.entity, k, phase) ? ' is-athome' : ''}`}
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
            className="daytrack__add"
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
