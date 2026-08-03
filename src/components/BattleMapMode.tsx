import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { COMBAT_STAT_FIELDS } from '../types'
import { rollDie } from '../utils/tools'

/**
 * Kampfmodus fuer eine als Kampfkarte markierte Ebene: listet alle auf ihr platzierten
 * Feinde als Tabelle - jede Spalte ein Charakter, oberste Zeile die (pro Kampf gewuerfelte)
 * Initiative, danach die hinterlegten Kampfwerte. Spalten sortieren sich automatisch nach
 * Initiative.
 */
export function BattleMapMode() {
  const battleModeLayerId = useStore((s) => s.battleModeLayerId)
  const setBattleMode = useStore((s) => s.setBattleMode)
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const setEntityField = useStore((s) => s.setEntityField)

  const layer = campaign.layers.find((l) => l.id === battleModeLayerId) ?? null

  // Initiative wird pro Kampf gewuerfelt, nicht am Charakter gespeichert - daher nur
  // fluechtiger Komponentenzustand, der beim (Wieder-)Oeffnen des Kampfmodus zurueckgesetzt wird.
  const [initiatives, setInitiatives] = useState<Record<string, number | null>>({})

  useEffect(() => {
    setInitiatives({})
  }, [battleModeLayerId])

  if (!layer) return null

  const enemies = campaign.entities.filter(
    (e) => e.type === 'nsc' && e.fields.gesinnung === 'feind' && e.placement?.layerId === layer.id,
  )
  const sorted = [...enemies].sort(
    (a, b) => (initiatives[b.id] ?? -Infinity) - (initiatives[a.id] ?? -Infinity),
  )

  function rollOne(id: string) {
    setInitiatives((prev) => ({ ...prev, [id]: rollDie(20) }))
  }
  function rollAll() {
    setInitiatives(Object.fromEntries(enemies.map((e) => [e.id, rollDie(20)])))
  }

  return (
    <div className="fight">
      <div className="fight__header">
        <div className="fight__title">
          <span className="fight__badge">⚔ Kampfmodus</span>
          <span className="fight__event">{layer.name}</span>
        </div>
        <button
          className="chipbtn"
          onClick={rollAll}
          disabled={enemies.length === 0}
          title="Alle Initiativen neu wuerfeln"
        >
          🎲 Alle Initiativen wuerfeln
        </button>
        <button className="fight__close" onClick={() => setBattleMode(null)} title="Kampfmodus verlassen">
          &times;
        </button>
      </div>

      <div className="battlemap__body">
        {sorted.length === 0 ? (
          <p className="fight__empty">Keine Feinde auf dieser Karte platziert.</p>
        ) : (
          <div className="battlemap__tablewrap">
            <table className="battlemap__table">
              <thead>
                <tr>
                  <th className="battlemap__corner" />
                  {sorted.map((e) => (
                    <th key={e.id} className="battlemap__colhead">
                      {e.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="battlemap__initrow">
                  <th>Initiative (wird gewürfelt)</th>
                  {sorted.map((e) => (
                    <td key={e.id}>
                      <div className="battlemap__init">
                        <input
                          type="number"
                          value={initiatives[e.id] ?? ''}
                          placeholder="–"
                          onChange={(ev) =>
                            setInitiatives((prev) => ({
                              ...prev,
                              [e.id]: ev.target.value === '' ? null : Number(ev.target.value),
                            }))
                          }
                        />
                        <button onClick={() => rollOne(e.id)} title="Initiative wuerfeln">
                          🎲
                        </button>
                      </div>
                    </td>
                  ))}
                </tr>

                {COMBAT_STAT_FIELDS.map((f) => (
                  <tr key={f.key}>
                    <th>{f.label}</th>
                    {sorted.map((e) => (
                      <td key={e.id}>
                        {f.kind === 'textarea' ? (
                          <textarea
                            value={e.fields[f.key] ?? ''}
                            onChange={(ev) => setEntityField(e.id, f.key, ev.target.value)}
                            rows={2}
                          />
                        ) : (
                          <input
                            value={e.fields[f.key] ?? ''}
                            onChange={(ev) => setEntityField(e.id, f.key, ev.target.value)}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
