import { useState } from 'react'
import { entityDisplayMeta, entityMeta } from '../types'
import type { Entity } from '../types'
import { useStore } from '../store/useStore'
import { formatTime } from '../utils/time'
import { DaySchedule } from './DaySchedule'

type Tab = 'objekt' | 'kampagne'

/**
 * Inhalt der unteren Zeitleiste. Zeigt zum ausgewaehlten Objekt dessen Tagesablauf
 * (wann es sich wo auf der Karte aufhaelt) und daneben die Kampagnen-Zeitleiste
 * aller datierten Objekte.
 */
export function Timeline() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const selectedEntityId = useStore((s) => s.selectedEntityId)
  const [tab, setTab] = useState<Tab>('objekt')

  const selected = campaign.entities.find((e) => e.id === selectedEntityId) ?? null
  // Ohne ausgewaehltes Objekt gibt es keinen Tagesablauf zu zeigen.
  const activeTab: Tab = selected ? tab : 'kampagne'

  return (
    <div className="timeline">
      <div className="timeline__header">
        <h2 className="timeline__title">Zeitleiste</h2>
        <div className="timeline__tabs">
          <button
            className={`timeline__tab${activeTab === 'objekt' ? ' is-active' : ''}`}
            onClick={() => setTab('objekt')}
            disabled={!selected}
            title={selected ? 'Tagesablauf des ausgewaehlten Objekts' : 'Erst ein Objekt auswaehlen'}
          >
            Tagesablauf
            {selected && <span className="timeline__tabname">{selected.name}</span>}
          </button>
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
        {activeTab === 'objekt' && selected ? (
          <ObjectSchedule entity={selected} />
        ) : (
          <CampaignDays />
        )}
      </div>
    </div>
  )
}

/** Tagesablauf-Ansicht eines Objekts inkl. Kopfzeile mit Objektnamen. */
function ObjectSchedule({ entity }: { entity: Entity }) {
  const setPlacingEntity = useStore((s) => s.setPlacingEntity)
  const meta = entityDisplayMeta(entity)

  if (!entity.placement) {
    return (
      <div className="timeline__notice">
        <p>
          <strong>{entity.name}</strong> liegt noch auf keiner Karte. Ein Tagesablauf beschreibt,
          wo sich ein Objekt zu welcher Uhrzeit befindet — dafuer braucht es zuerst eine
          Position auf der Karte.
        </p>
        <button className="btn btn--primary btn--sm" onClick={() => setPlacingEntity(entity.id)}>
          Jetzt auf der Karte platzieren
        </button>
      </div>
    )
  }

  return (
    <div className="timeline__schedule">
      <div className="timeline__subject" style={{ ['--chip-color' as string]: meta.color }}>
        <span className={`timeline__subject-icon${meta.iconInvert ? ' is-icon-invert' : ''}`}>
          {meta.icon}
        </span>
        <span className="timeline__subject-name">{entity.name}</span>
        <span className="timeline__subject-hint">
          Ausserhalb aller Zeitfenster steht das Objekt an seiner normalen Position.
        </span>
      </div>
      <DaySchedule entity={entity} />
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
    .sort((a, b) => (a.day! - b.day!) || (a.schedule[0]?.timeStart ?? -1) - (b.schedule[0]?.timeStart ?? -1))

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
                        <span className={meta.iconInvert ? 'is-icon-invert' : undefined}>
                          {meta.icon}
                        </span>
                        <span className="timeline__event-name">{e.name}</span>
                        {e.schedule.length > 0 && (
                          <span
                            className="timeline__event-time"
                            title={e.schedule
                              .map((s) => `${formatTime(s.timeStart)}–${formatTime(s.timeEnd)}`)
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
