import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ENTITY_TYPES, GESINNUNG_OPTIONS, entityDisplayMeta } from '../types'
import type { Entity, EntityType } from '../types'
import { useStore } from '../store/useStore'
import type { ToolTab } from '../store/useStore'

const TOOL_ITEMS: { tab: ToolTab; label: string; icon: string }[] = [
  { tab: 'wuerfel', label: 'Wuerfel', icon: '\u{1F3B2}' },
  { tab: 'kampf', label: 'Kampf', icon: '\u{2694}' },
  { tab: 'notizen', label: 'Notizen', icon: '\u{1F4D3}' },
  { tab: 'zufall', label: 'Zufall', icon: '\u{1F52E}' },
  { tab: 'ki', label: 'KI', icon: '\u{2728}' },
  { tab: 'musik', label: 'Musik', icon: '\u{1F3B5}' },
]

export function Sidebar() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const tool = useStore((s) => s.tool)
  const pendingType = useStore((s) => s.pendingEntityType)
  const pendingFields = useStore((s) => s.pendingEntityFields)
  const playerMode = useStore((s) => s.playerMode)
  const setTool = useStore((s) => s.setTool)
  const setPendingType = useStore((s) => s.setPendingEntityType)
  const setPendingFields = useStore((s) => s.setPendingEntityFields)
  const selectEntity = useStore((s) => s.selectEntity)
  const selectedId = useStore((s) => s.selectedEntityId)
  const addEntity = useStore((s) => s.addEntity)
  const toolsOpen = useStore((s) => s.toolsOpen)
  const toolsTab = useStore((s) => s.toolsTab)
  const setToolsOpen = useStore((s) => s.setToolsOpen)
  const setToolsTab = useStore((s) => s.setToolsTab)

  const [nscPopupPos, setNscPopupPos] = useState<{ top: number; left: number } | null>(null)

  function openTool(tab: ToolTab) {
    if (toolsOpen && toolsTab === tab) {
      setToolsOpen(false)
    } else {
      setToolsTab(tab)
      setToolsOpen(true)
    }
  }

  // Im Spielermodus nur entdeckte Objekte anzeigen.
  const visible = campaign.entities.filter((e) => !playerMode || e.visibility === 'spieler')

  function startAdding(type: EntityType) {
    setNscPopupPos(null)
    setPendingType(type)
    setTool('add')
  }

  function startAddingCharacter(gesinnung: string) {
    setNscPopupPos(null)
    setPendingType('nsc')
    setPendingFields({ gesinnung })
    setTool('add')
  }

  // Objekte nach Typ gruppieren, in der Reihenfolge von ENTITY_TYPES.
  const groups = ENTITY_TYPES.map((meta) => ({
    meta,
    items: visible.filter((e) => e.type === meta.type),
  })).filter((g) => g.items.length > 0)

  return (
    <aside className="sidebar">
      <section className="sidebar__section">
        <h2 className="sidebar__heading">Werkzeuge</h2>
        <div className="toolbar-grid">
          {TOOL_ITEMS.map((t) => (
            <button
              key={t.tab}
              className={`toolbtn${toolsOpen && toolsTab === t.tab ? ' is-active' : ''}`}
              onClick={() => openTool(t.tab)}
              title={t.label}
            >
              <span className="toolbtn__icon">{t.icon}</span>
              <span className="toolbtn__label">{t.label}</span>
            </button>
          ))}
        </div>
      </section>

      {!playerMode && (
        <section className="sidebar__section">
          <h2 className="sidebar__heading">Objekt anlegen</h2>
          <p className="sidebar__hint">
            {tool === 'add'
              ? 'Klick auf die Karte platziert das Objekt. Ohne Karte: Button unten.'
              : 'Typ waehlen, dann auf die Karte klicken.'}
          </p>
          <div className="type-grid">
            {ENTITY_TYPES.filter((t) => t.type !== 'fraktion').map((t) =>
              t.type === 'nsc' ? (
                <button
                  key={t.type}
                  className={`type-chip${tool === 'add' && pendingType === 'nsc' ? ' is-active' : ''}`}
                  style={{ ['--chip-color' as string]: t.color }}
                  onClick={(e) => {
                    if (nscPopupPos) {
                      setNscPopupPos(null)
                      return
                    }
                    const r = e.currentTarget.getBoundingClientRect()
                    setNscPopupPos({ top: r.top, left: r.right + 8 })
                  }}
                  title={`${t.label} hinzufuegen`}
                >
                  <span className="type-chip__icon">{t.icon}</span>
                  <span className="type-chip__label">{t.label}</span>
                </button>
              ) : (
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
              ),
            )}
          </div>

          {nscPopupPos &&
            createPortal(
              <>
                <div className="popover-backdrop" onClick={() => setNscPopupPos(null)} />
                <div
                  className="gesinnung-popover"
                  style={{ top: nscPopupPos.top, left: nscPopupPos.left }}
                >
                  {GESINNUNG_OPTIONS.map((g) => (
                    <button
                      key={g.value}
                      className="gesinnung-popover__opt"
                      onClick={() => startAddingCharacter(g.value)}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </>,
              document.body,
            )}
          {tool === 'add' ? (
            <div className="sidebar__actions">
              <button
                className="btn btn--ghost btn--full"
                onClick={() => {
                  addEntity({ type: pendingType, fields: pendingFields })
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
  const meta = entityDisplayMeta(entity)
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
