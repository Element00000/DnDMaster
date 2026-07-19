import { ENTITY_TYPES, entityMeta } from '../types'
import type { Entity, EntityType } from '../types'
import { useStore } from '../store/useStore'

export function Sidebar() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const tool = useStore((s) => s.tool)
  const pendingType = useStore((s) => s.pendingEntityType)
  const playerMode = useStore((s) => s.playerMode)
  const setTool = useStore((s) => s.setTool)
  const setPendingType = useStore((s) => s.setPendingEntityType)
  const selectEntity = useStore((s) => s.selectEntity)
  const selectedId = useStore((s) => s.selectedEntityId)
  const addEntity = useStore((s) => s.addEntity)

  // Im Spielermodus nur entdeckte Objekte anzeigen.
  const visible = campaign.entities.filter((e) => !playerMode || e.visibility === 'spieler')

  function startAdding(type: EntityType) {
    setPendingType(type)
    setTool('add')
  }

  // Objekte nach Typ gruppieren, in der Reihenfolge von ENTITY_TYPES.
  const groups = ENTITY_TYPES.map((meta) => ({
    meta,
    items: visible.filter((e) => e.type === meta.type),
  })).filter((g) => g.items.length > 0)

  return (
    <aside className="sidebar">
      {!playerMode && (
        <section className="sidebar__section">
          <h2 className="sidebar__heading">Objekt anlegen</h2>
          <p className="sidebar__hint">
            {tool === 'add'
              ? 'Klick auf die Karte platziert das Objekt. Ohne Karte: Button unten.'
              : 'Typ waehlen, dann auf die Karte klicken.'}
          </p>
          <div className="type-grid">
            {ENTITY_TYPES.map((t) => (
              <button
                key={t.type}
                className={`type-chip${tool === 'add' && pendingType === t.type ? ' is-active' : ''}`}
                style={{ ['--chip-color' as string]: t.color }}
                onClick={() => startAdding(t.type)}
                title={`${t.label} hinzufuegen`}
              >
                <span className="type-chip__icon">{t.icon}</span>
                <span className="type-chip__label">{t.label}</span>
              </button>
            ))}
          </div>
          {tool === 'add' ? (
            <div className="sidebar__actions">
              <button
                className="btn btn--ghost btn--full"
                onClick={() => {
                  addEntity({ type: pendingType })
                  setTool('select')
                }}
                title="Objekt ohne Kartenposition anlegen"
              >
                Ohne Karte anlegen
              </button>
              <button className="btn btn--ghost btn--full" onClick={() => setTool('select')}>
                Abbrechen
              </button>
            </div>
          ) : null}
        </section>
      )}

      <section className="sidebar__section sidebar__section--grow">
        <h2 className="sidebar__heading">
          {playerMode ? 'Entdeckt' : 'Objekte'} <span className="sidebar__count">{visible.length}</span>
        </h2>
        {visible.length === 0 ? (
          <p className="sidebar__empty">
            {playerMode
              ? 'Noch nichts entdeckt.'
              : 'Noch keine Objekte. Waehle oben einen Typ und klicke auf die Karte.'}
          </p>
        ) : (
          <div className="entity-groups">
            {groups.map((g) => (
              <div key={g.meta.type} className="entity-group">
                <div className="entity-group__title" style={{ ['--chip-color' as string]: g.meta.color }}>
                  <span>{g.meta.icon}</span>
                  {g.meta.plural}
                  <span className="entity-group__count">{g.items.length}</span>
                </div>
                <ul className="marker-list">
                  {g.items.map((e) => (
                    <EntityRow key={e.id} entity={e} selected={e.id === selectedId} onSelect={selectEntity} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  )
}

function EntityRow({
  entity,
  selected,
  onSelect,
}: {
  entity: Entity
  selected: boolean
  onSelect: (id: string) => void
}) {
  const meta = entityMeta(entity.type)
  return (
    <li>
      <button
        className={`marker-list__item${selected ? ' is-selected' : ''}`}
        style={{ ['--chip-color' as string]: meta.color }}
        onClick={() => onSelect(entity.id)}
      >
        <span className="marker-list__icon">{meta.icon}</span>
        <span className="marker-list__name">{entity.name}</span>
        {!entity.placement && <span className="marker-list__badge" title="Nicht auf der Karte">Liste</span>}
      </button>
    </li>
  )
}
