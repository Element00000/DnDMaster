import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { entityMeta } from '../../types'

export function SessionNotes() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const addSession = useStore((s) => s.addSession)
  const updateSession = useStore((s) => s.updateSession)
  const deleteSession = useStore((s) => s.deleteSession)
  const selectEntity = useStore((s) => s.selectEntity)
  const setActiveLayer = useStore((s) => s.setActiveLayer)

  const [openId, setOpenId] = useState<string | null>(null)
  const sessions = campaign.sessions

  function openEntity(id: string) {
    const e = campaign.entities.find((x) => x.id === id)
    if (e?.placement && e.placement.layerId !== campaign.activeLayerId) setActiveLayer(e.placement.layerId)
    selectEntity(id)
  }

  return (
    <div className="sessions">
      <button
        className="btn btn--primary btn--full"
        onClick={() => {
          const id = addSession()
          setOpenId(id)
        }}
      >
        + Neue Sitzung
      </button>

      {sessions.length === 0 ? (
        <p className="sessions__empty">Noch keine Sitzungsnotizen.</p>
      ) : (
        <ul className="sessions__list">
          {sessions.map((s) => {
            const open = openId === s.id
            return (
              <li key={s.id} className={`session${open ? ' is-open' : ''}`}>
                <button className="session__head" onClick={() => setOpenId(open ? null : s.id)}>
                  <span className="session__title">{s.title || 'Ohne Titel'}</span>
                  {s.inGameDate && <span className="session__date">{s.inGameDate}</span>}
                  <span className="session__chev">{open ? '▾' : '▸'}</span>
                </button>

                {open && (
                  <div className="session__body">
                    <div className="session__row">
                      <input
                        className="field__control field__control--sm"
                        value={s.title}
                        placeholder="Titel"
                        onChange={(e) => updateSession(s.id, { title: e.target.value })}
                      />
                      <input
                        className="field__control field__control--sm session__datein"
                        value={s.inGameDate}
                        placeholder="Datum (Welt)"
                        onChange={(e) => updateSession(s.id, { inGameDate: e.target.value })}
                      />
                    </div>
                    <textarea
                      className="field__control field__textarea"
                      rows={5}
                      value={s.body}
                      placeholder="Was ist passiert? Wer war dabei?"
                      onChange={(e) => updateSession(s.id, { body: e.target.value })}
                    />

                    <div className="session__refs">
                      <span className="session__refs-label">Vorgekommene Objekte</span>
                      {s.refs.length > 0 && (
                        <div className="session__chips">
                          {s.refs.map((rid) => {
                            const e = campaign.entities.find((x) => x.id === rid)
                            if (!e) return null
                            const meta = entityMeta(e.type)
                            return (
                              <span key={rid} className="session__chip" style={{ ['--chip-color' as string]: meta.color }}>
                                <button className="session__chip-open" onClick={() => openEntity(rid)}>
                                  {meta.icon} {e.name}
                                </button>
                                <button
                                  className="session__chip-x"
                                  onClick={() => updateSession(s.id, { refs: s.refs.filter((r) => r !== rid) })}
                                  title="Entfernen"
                                >
                                  &times;
                                </button>
                              </span>
                            )
                          })}
                        </div>
                      )}
                      <select
                        className="field__control field__control--sm"
                        value=""
                        onChange={(e) => {
                          if (e.target.value && !s.refs.includes(e.target.value)) {
                            updateSession(s.id, { refs: [...s.refs, e.target.value] })
                          }
                        }}
                      >
                        <option value="">+ Objekt verknuepfen ...</option>
                        {campaign.entities
                          .filter((e) => !s.refs.includes(e.id))
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {entityMeta(e.type).icon} {e.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <button className="btn btn--sm btn--danger" onClick={() => deleteSession(s.id)}>
                      Sitzung loeschen
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
