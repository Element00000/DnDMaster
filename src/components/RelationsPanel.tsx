import { useState } from 'react'
import { useStore } from '../store/useStore'
import { EntityRelations } from './EntityRelations'
import { RelationGraph } from './RelationGraph'

type Tab = 'objekt' | 'netzwerk'

/**
 * Inhalt der unteren Leiste im Reiter "Beziehungen": Fraktion und Verknuepfungen des
 * ausgewaehlten Objekts, daneben der Gesamtgraph aller Beziehungen. Aufbau bewusst wie
 * bei der Zeitleiste, damit sich beide Panels gleich anfuehlen.
 */
export function RelationsPanel() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const selectedEntityId = useStore((s) => s.selectedEntityId)
  const [tab, setTab] = useState<Tab>('objekt')

  const selected = campaign.entities.find((e) => e.id === selectedEntityId) ?? null
  // Ohne ausgewaehltes Objekt gibt es nichts zu bearbeiten.
  const activeTab: Tab = selected ? tab : 'netzwerk'

  return (
    <div className="relpanel">
      <div className="timeline__header">
        <h2 className="timeline__title">Beziehungen</h2>
        <div className="timeline__tabs">
          <button
            className={`timeline__tab${activeTab === 'objekt' ? ' is-active' : ''}`}
            onClick={() => setTab('objekt')}
            disabled={!selected}
            title={selected ? 'Fraktion und Verknuepfungen des Objekts' : 'Erst ein Objekt auswaehlen'}
          >
            Objekt
            {selected && <span className="timeline__tabname">{selected.name}</span>}
          </button>
          <button
            className={`timeline__tab${activeTab === 'netzwerk' ? ' is-active' : ''}`}
            onClick={() => setTab('netzwerk')}
            title="Graph aller Beziehungen"
          >
            Netzwerk
          </button>
        </div>
      </div>

      <div className="relpanel__body">
        {activeTab === 'objekt' && selected ? <EntityRelations entity={selected} /> : <RelationGraph />}
      </div>
    </div>
  )
}
