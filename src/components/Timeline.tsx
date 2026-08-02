import { useState } from 'react'
import { entityMeta } from '../types'
import type { Entity } from '../types'
import { useStore } from '../store/useStore'
import { formatTime } from '../utils/time'

/** Kampagnen-Zeitleiste nach Kalendertag (Abschnitt 5 des Konzepts). */
export function Timeline() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const tableMode = useStore((s) => s.tableMode)
  const setTimelineOpen = useStore((s) => s.setTimelineOpen)
  const selectEntity = useStore((s) => s.selectEntity)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
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
    .sort((a, b) => (a.day! - b.day!) || (a.timeStart ?? -1) - (b.timeStart ?? -1))

  // Nach Tag gruppieren.
  const days: { day: number; items: Entity[] }[] = []
  for (const e of dated) {
    const last = days[days.length - 1]
    if (last && last.day === e.day) last.items.push(e)
    else days.push({ day: e.day!, items: [e] })
  }

  function openEntity(e: Entity) {
    if (e.placement && e.placement.layerId !== campaign.activeLayerId) {
      setActiveLayer(e.placement.layerId)
    }
    selectEntity(e.id)
  }

  const filterCandidates = all.filter((e) => !tableMode || e.visibility === 'spieler')

  return (
    <div className="timeline">
      <div className="timeline__header">
        <h2 className="timeline__title">Zeitleiste</h2>
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
        <button className="timeline__close" onClick={() => setTimelineOpen(false)} title="Schliessen">
          &times;
        </button>
      </div>

      {days.length === 0 ? (
        <p className="timeline__empty">
          Keine datierten Ereignisse. Setze bei einem Objekt einen Kalendertag im Detailpanel.
        </p>
      ) : (
        <div className="timeline__track">
          {days.map((group) => (
            <div key={group.day} className="timeline__day">
              <div className="timeline__daymark">Tag {group.day}</div>
              <div className="timeline__events">
                {group.items.map((e) => {
                  const meta = entityMeta(e.type)
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
                        <span>{meta.icon}</span>
                        <span className="timeline__event-name">{e.name}</span>
                        {e.timeStart != null && e.timeEnd != null && (
                          <span className="timeline__event-time">
                            {formatTime(e.timeStart)}&ndash;{formatTime(e.timeEnd)}
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
    </div>
  )
}
