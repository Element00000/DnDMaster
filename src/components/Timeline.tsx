import { useState } from 'react'
import { entityDisplayMeta, entityMeta } from '../types'
import type { Entity } from '../types'
import { useStore } from '../store/useStore'
import { formatTime } from '../utils/time'
import { DaySchedule } from './DaySchedule'
import { EntityIcon } from './EntityIcon'

type Tab = 'objekt' | 'kampagne'

/** Kurzanleitung zum Tagesablauf; haengt am Infopunkt neben dem Reiter. */
const SCHEDULE_HELP =
  'Zuerst die Uhrzeit am Zeiger ziehen, dann die Figur auf der Karte an ihren Platz ' +
  'schieben, dann mit ◆ den Punkt setzen. Vor dem ersten Punkt gilt die normale Position. ' +
  'Mit ◇ kehrt die Figur ab dieser Uhrzeit wieder dorthin zurueck.'

/**
 * Inhalt der unteren Zeitleiste. Zeigt zum ausgewaehlten Objekt dessen Tagesablauf
 * (wann es sich wo auf der Karte aufhaelt) und daneben die Kampagnen-Zeitleiste
 * aller datierten Objekte.
 */
export function Timeline() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const selectedIds = useStore((s) => s.selectedIds)
  const [tab, setTab] = useState<Tab>('objekt')

  // Reihenfolge der Auswahl beibehalten, damit die Spuren nicht springen.
  const selected = selectedIds
    .map((id) => campaign.entities.find((e) => e.id === id))
    .filter((e): e is Entity => !!e)
  // Ohne ausgewaehltes Objekt gibt es keinen Tagesablauf zu zeigen.
  const activeTab: Tab = selected.length > 0 ? tab : 'kampagne'

  return (
    <div className="timeline">
      <div className="timeline__header">
        <h2 className="timeline__title">Zeitleiste</h2>
        <div className="timeline__tabs">
          <button
            className={`timeline__tab${activeTab === 'objekt' ? ' is-active' : ''}`}
            onClick={() => setTab('objekt')}
            disabled={selected.length === 0}
            title={selected.length > 0 ? 'Tagesablauf der ausgewaehlten Objekte' : 'Erst ein Objekt auswaehlen'}
          >
            Tagesablauf
            {selected.length > 1 && <span className="timeline__tabname">{selected.length} Objekte</span>}
          </button>
          {/* Die Anleitung steckt hier statt unter dem Zeitstrahl - dort nahm sie
              dauerhaft Hoehe weg, obwohl man sie nur einmal braucht. */}
          <span
            className="infodot"
            tabIndex={0}
            role="note"
            aria-label={SCHEDULE_HELP}
            title={SCHEDULE_HELP}
          >
            i<span className="infodot__bubble">{SCHEDULE_HELP}</span>
          </span>
          <button
            className={`timeline__tab${activeTab === 'kampagne' ? ' is-active' : ''}`}
            onClick={() => setTab('kampagne')}
            title="Alle Objekte mit Kalendertag"
          >
            Kampagnentage
          </button>
        </div>
      </div>

      <div className="timeline__body">
        {activeTab === 'objekt' && selected.length > 0 ? (
          <ObjectSchedule entities={selected} />
        ) : (
          <CampaignDays />
        )}
      </div>
    </div>
  )
}

/**
 * Tagesablauf der ausgewaehlten Objekte. Oben stehen sie als Kacheln wie in der rechten
 * Leiste; ein Klick darauf schraenkt die Auswahl auf dieses eine Objekt ein.
 */
function ObjectSchedule({ entities }: { entities: Entity[] }) {
  const setPlacingEntity = useStore((s) => s.setPlacingEntity)
  const selectEntity = useStore((s) => s.selectEntity)

  // Ein Tagesablauf beschreibt, wo etwas zu welcher Uhrzeit liegt - ohne Kartenposition
  // gibt es dafuer keine Grundlage.
  const unplaced = entities.filter((e) => !e.placement)
  const placed = entities.filter((e) => e.placement)

  if (placed.length === 0) {
    const first = unplaced[0]
    return (
      <div className="timeline__notice">
        <p>
          <strong>{first.name}</strong> liegt noch auf keiner Karte. Ein Tagesablauf beschreibt,
          wo sich ein Objekt zu welcher Uhrzeit befindet — dafuer braucht es zuerst eine
          Position auf der Karte.
        </p>
        <button className="btn btn--primary btn--sm" onClick={() => setPlacingEntity(first.id)}>
          Jetzt auf der Karte platzieren
        </button>
      </div>
    )
  }

  return (
    <div className="timeline__schedule">
      <ul className="timeline__subjects">
        {placed.map((e) => {
          const meta = entityDisplayMeta(e)
          return (
            <li key={e.id}>
              <button
                className="marker-list__item is-selected"
                style={{ ['--chip-color' as string]: meta.color }}
                onClick={() => selectEntity(e.id)}
                title={placed.length > 1 ? 'Nur dieses Objekt bearbeiten' : e.name}
              >
                <EntityIcon entity={e} className="marker-list__icon" />
                <span className="marker-list__name">{e.name}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {unplaced.length > 0 && (
        <p className="dayschedule__hint">
          {unplaced.length === 1
            ? `${unplaced[0].name} liegt auf keiner Karte und bleibt hier aussen vor.`
            : `${unplaced.length} ausgewaehlte Objekte liegen auf keiner Karte und bleiben hier aussen vor.`}
        </p>
      )}

      <DaySchedule entities={placed} />
    </div>
  )
}

/** Bisherige Kampagnen-Zeitleiste: alle Objekte mit Kalendertag, nach Tag gruppiert. */
function CampaignDays() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const tableMode = useStore((s) => s.tableMode)
  const currentDay = useStore((s) => s.currentDay)
  const selectEntity = useStore((s) => s.selectEntity)
  const setCurrentDay = useStore((s) => s.setCurrentDay)
  const goToLayer = useStore((s) => s.goToLayer)
  const [filterId, setFilterId] = useState('')

  const all = campaign.entities
  const byId = (id: string) => all.find((e) => e.id === id)

  // Zwei Objekte gelten als verbunden, wenn eines auf das andere verweist.
  function related(e: Entity, targetId: string): boolean {
    if (e.id === targetId) return true
    if (e.links.some((l) => l.targetId === targetId)) return true
    const target = byId(targetId)
    return target?.links.some((l) => l.targetId === e.id) ?? false
  }

  const dated = all
    .filter((e) => e.day != null)
    .filter((e) => !tableMode || e.visibility === 'spieler')
    .filter((e) => !filterId || related(e, filterId))
    .sort((a, b) => (a.day! - b.day!) || (a.schedule[0]?.time ?? -1) - (b.schedule[0]?.time ?? -1))

  // Nach Tag gruppieren.
  const days: { day: number; items: Entity[] }[] = []
  for (const e of dated) {
    const last = days[days.length - 1]
    if (last && last.day === e.day) last.items.push(e)
    else days.push({ day: e.day!, items: [e] })
  }

  function openEntity(e: Entity) {
    if (e.placement) goToLayer(e.placement.layerId)
    selectEntity(e.id)
  }

  const filterCandidates = all.filter((e) => !tableMode || e.visibility === 'spieler')

  return (
    <>
      <div className="timeline__toolbar">
        <select
          className="field__control field__control--sm timeline__filter"
          value={filterId}
          onChange={(e) => setFilterId(e.target.value)}
        >
          <option value="">Alle Objekte</option>
          {filterCandidates.map((e) => (
            <option key={e.id} value={e.id}>
              {entityMeta(e.type).icon} {e.name}
            </option>
          ))}
        </select>
      </div>

      {days.length === 0 ? (
        <p className="timeline__empty">
          Keine datierten Ereignisse. Setze bei einem Objekt einen Kalendertag im Detailpanel.
        </p>
      ) : (
        <div className="timeline__track">
          {days.map((group) => (
            <div key={group.day} className={`timeline__day${group.day === currentDay ? ' is-current' : ''}`}>
              <button
                className="timeline__daymark"
                onClick={() => setCurrentDay(group.day)}
                title="Diesen Tag als aktuellen Kampagnentag setzen"
              >
                Tag {group.day}
              </button>
              <div className="timeline__events">
                {group.items.map((e) => {
                  // entityDisplayMeta statt entityMeta: beruecksichtigt die Gesinnung eines
                  // Charakters (Freund gruen, Feind rot, neutral grau, Spieler dunkelgruen).
                  const meta = entityDisplayMeta(e)
                  const places = e.links
                    .map((l) => byId(l.targetId))
                    .filter((t): t is Entity => !!t && t.type === 'ort')
                  return (
                    <button
                      key={e.id}
                      className="timeline__event"
                      style={{ ['--chip-color' as string]: meta.color }}
                      onClick={() => openEntity(e)}
                    >
                      <div className="timeline__event-head">
                        <EntityIcon entity={e} className="timeline__event-icon" />
                        <span className="timeline__event-name">{e.name}</span>
                        {e.schedule.length > 0 && (
                          <span
                            className="timeline__event-time"
                            title={e.schedule
                              .slice()
                              .sort((a, b) => a.time - b.time)
                              .map((s) => `ab ${formatTime(s.time)}${s.label ? ` ${s.label}` : ''}`)
                              .join(', ')}
                          >
                            {'\u{1F55B}'} wechselt Ort
                          </span>
                        )}
                      </div>
                      {places.length > 0 && (
                        <div className="timeline__event-places">
                          {'\u{1F3F0}'} {places.map((p) => p.name).join(', ')}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
