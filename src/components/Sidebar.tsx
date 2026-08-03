import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ENTITY_TYPES, GESINNUNG_OPTIONS, ITEM_ART_OPTIONS, entityDisplayMeta } from '../types'
import type { Entity, EntityType, MapLayer } from '../types'
import { useStore } from '../store/useStore'
import type { ToolTab } from '../store/useStore'
import { fileToScaledDataUrl } from '../utils/image'
import { deleteAsset, putAsset } from '../utils/assets'

const TOOL_ITEMS: { tab: ToolTab; label: string; icon: string }[] = [
  { tab: 'wuerfel', label: 'Wuerfel', icon: '\u{1F3B2}' },
  { tab: 'kampf', label: 'Kampf', icon: '\u{2694}' },
  { tab: 'notizen', label: 'Notizen', icon: '\u{1F4D3}' },
  { tab: 'zufall', label: 'Zufall', icon: '\u{1F52E}' },
  { tab: 'ki', label: 'KI', icon: '\u{2728}' },
  { tab: 'musik', label: 'Musik', icon: '\u{1F3B5}' },
]

/** Typen, die beim Anlegen erst eine Auswahl per PopUp verlangen (Feld -> Optionen). */
const PICKER_POPUPS: Partial<Record<EntityType, { fieldKey: string; options: { value: string; label: string }[] }>> = {
  nsc: { fieldKey: 'gesinnung', options: GESINNUNG_OPTIONS },
  item: { fieldKey: 'art', options: ITEM_ART_OPTIONS },
}

export function Sidebar() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const layer = campaign.layers.find((l) => l.id === campaign.activeLayerId) ?? campaign.layers[0]
  const tool = useStore((s) => s.tool)
  const pendingType = useStore((s) => s.pendingEntityType)
  const pendingFields = useStore((s) => s.pendingEntityFields)
  const tableMode = useStore((s) => s.tableMode)
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
  const setLayerImage = useStore((s) => s.setLayerImage)
  const addLayer = useStore((s) => s.addLayer)
  const renameLayer = useStore((s) => s.renameLayer)
  const deleteLayer = useStore((s) => s.deleteLayer)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
  const placingLayerId = useStore((s) => s.placingLayerId)
  const setPlacingLayer = useStore((s) => s.setPlacingLayer)

  const [popup, setPopup] = useState<{ type: EntityType; top: number; left: number } | null>(null)
  const [mapsMenu, setMapsMenu] = useState<{ top: number; left: number } | null>(null)
  const addSectionRef = useRef<HTMLElement>(null)
  const mapFileRef = useRef<HTMLInputElement>(null)

  // "Objekt anlegen"-Menue (Ohne Karte anlegen/Abbrechen) automatisch schliessen, sobald
  // woanders hingeklickt wird - auf ein anderes Objekt (Liste oder Pin) oder allgemein
  // irgendwohin ausserhalb der Anlege-Steuerung. Ein Klick auf die Karte selbst platziert
  // das Objekt dort (bzw. verwirft den Klick daneben) und regelt das Beenden selbst.
  useEffect(() => {
    if (tool !== 'add') return
    function onPointerDownCapture(e: PointerEvent) {
      const target = e.target as HTMLElement
      if (addSectionRef.current?.contains(target)) return
      if (target.closest('.picker-popover') || target.closest('.popover-backdrop') || target.closest('.maps-menu')) return
      if (target.closest('.map-pin')) {
        setTool('select')
        return
      }
      if (target.closest('.map-canvas')) return
      setTool('select')
    }
    document.addEventListener('pointerdown', onPointerDownCapture, true)
    return () => document.removeEventListener('pointerdown', onPointerDownCapture, true)
  }, [tool, setTool])

  async function onMapFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const prev = layer.imageUrl
    const { url, width, height } = await fileToScaledDataUrl(file, { maxDim: 2400, quality: 0.85 })
    const ref = await putAsset(url)
    setLayerImage(layer.id, ref, width, height)
    void deleteAsset(prev)
  }

  function onAddLayer() {
    const name = prompt('Name der neuen Karte (z.B. Regionalkarte, Stadtplan):')
    if (name && name.trim()) addLayer(name.trim())
  }

  function onRenameLayer(l: MapLayer) {
    const name = prompt('Karte umbenennen:', l.name)
    if (name && name.trim()) renameLayer(l.id, name.trim())
  }

  function onDeleteLayer(l: MapLayer) {
    if (campaign.layers.length <= 1) {
      alert('Die letzte Karte kann nicht geloescht werden.')
      return
    }
    if (confirm(`Karte "${l.name}" loeschen? Marker auf ihr verlieren ihre Position.`)) {
      deleteLayer(l.id)
    }
  }

  // Kartenhierarchie: Wurzel = nicht eingebettete Karten (Hauptkarte-Ebene), darunter
  // rekursiv jede Karte, die auf einer anderen Karte eingebettet ist. So bildet die Liste
  // ab, auf welcher Karten-Ebene sich eine Karte befindet.
  function mapLayerRows(): { layer: MapLayer; depth: number }[] {
    const byParent = new Map<string | null, MapLayer[]>()
    campaign.layers.forEach((l) => {
      const parentId = l.embed?.parentLayerId ?? null
      const siblings = byParent.get(parentId) ?? []
      siblings.push(l)
      byParent.set(parentId, siblings)
    })
    const rows: { layer: MapLayer; depth: number }[] = []
    const seen = new Set<string>()
    function visit(parentId: string | null, depth: number) {
      for (const l of byParent.get(parentId) ?? []) {
        if (seen.has(l.id)) continue
        seen.add(l.id)
        rows.push({ layer: l, depth })
        visit(l.id, depth + 1)
      }
    }
    visit(null, 0)
    return rows
  }

  function openTool(tab: ToolTab) {
    if (toolsOpen && toolsTab === tab) {
      setToolsOpen(false)
    } else {
      setToolsTab(tab)
      setToolsOpen(true)
    }
  }

  // Im Spieltischmodus nur entdeckte Objekte anzeigen.
  const visible = campaign.entities.filter((e) => !tableMode || e.visibility === 'spieler')

  function startAdding(type: EntityType) {
    setPopup(null)
    setPendingType(type)
    setTool('add')
  }

  function startAddingWithChoice(type: EntityType, fieldKey: string, value: string) {
    setPopup(null)
    setPendingType(type)
    setPendingFields({ [fieldKey]: value })
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

      {!tableMode && (
        <section className="sidebar__section" ref={addSectionRef}>
          <div className="sidebar-maps">
            <button
              className={`btn btn--full sidebar-maps__toggle${mapsMenu ? ' btn--active' : ''}${placingLayerId ? ' btn--active' : ''}`}
              onClick={(e) => {
                if (mapsMenu) {
                  setMapsMenu(null)
                  return
                }
                const r = e.currentTarget.getBoundingClientRect()
                setMapsMenu({ top: r.bottom + 6, left: r.left })
              }}
            >
              <span className="sidebar-maps__label">
                <span className="sidebar-maps__icon" aria-hidden="true">
                  🗺
                </span>
                Meine Karten
              </span>
              <span className="sidebar-maps__arrow" aria-hidden="true">
                &#9662;
              </span>
            </button>
            {mapsMenu &&
              createPortal(
                <div
                  className="campaign-menu maps-menu sidebar-maps__menu"
                  style={{ top: mapsMenu.top, left: mapsMenu.left }}
                  onMouseLeave={() => setMapsMenu(null)}
                >
                {mapLayerRows().map(({ layer: l, depth }) => (
                  <div key={l.id} className="maps-menu__row" style={{ paddingLeft: 8 + depth * 18 }}>
                    <button
                      className={`maps-menu__name${l.id === layer.id ? ' is-active' : ''}`}
                      onClick={() => setActiveLayer(l.id)}
                      title={depth === 0 ? 'Hauptkarten-Ebene' : `Eingebettet, Ebene ${depth + 1}`}
                    >
                      {depth > 0 ? '↳ ' : ''}
                      {l.name}
                    </button>
                    <button className="icon-btn icon-btn--sm" title="Umbenennen" onClick={() => onRenameLayer(l)}>
                      ✎
                    </button>
                    {campaign.layers.length > 1 && (
                      <button className="icon-btn icon-btn--sm" title="Loeschen" onClick={() => onDeleteLayer(l)}>
                        🗑
                      </button>
                    )}
                    {!l.embed && l.id !== layer.id && (
                      <button
                        className="chipbtn"
                        title="Diese Karte an einer Stelle der aktiven Karte einbetten"
                        onClick={() => {
                          setPlacingLayer(l.id)
                          setMapsMenu(null)
                        }}
                      >
                        Auf Karte platzieren
                      </button>
                    )}
                  </div>
                ))}
                  <div className="campaign-menu__sep" />
                  <button onClick={onAddLayer}>+ Neue Karte</button>
                  <button onClick={() => mapFileRef.current?.click()}>Bild fuer „{layer.name}“ hochladen</button>
                </div>,
                document.body,
              )}
            <input ref={mapFileRef} type="file" accept="image/*" onChange={onMapFile} hidden />
          </div>

          <h2 className="sidebar__heading">Objekt anlegen</h2>
          <p className="sidebar__hint">
            {tool === 'add'
              ? 'Klick auf die Karte platziert das Objekt. Ohne Karte: Button unten.'
              : 'Typ waehlen, dann auf die Karte klicken.'}
          </p>
          <div className="type-grid">
            {ENTITY_TYPES.filter((t) => t.type !== 'fraktion' && t.type !== 'quest' && t.type !== 'gefahr' && t.type !== 'schatz').map((t) => {
              const picker = PICKER_POPUPS[t.type]
              return (
                <button
                  key={t.type}
                  className={`type-chip${tool === 'add' && pendingType === t.type ? ' is-active' : ''}`}
                  style={{ ['--chip-color' as string]: t.color }}
                  onClick={(e) => {
                    if (!picker) {
                      startAdding(t.type)
                      return
                    }
                    if (popup?.type === t.type) {
                      setPopup(null)
                      return
                    }
                    const r = e.currentTarget.getBoundingClientRect()
                    setPopup({ type: t.type, top: r.top, left: r.right + 8 })
                  }}
                  title={`${t.label} hinzufuegen`}
                >
                  <span className="type-chip__icon">{t.icon}</span>
                  <span className="type-chip__label">{t.label}</span>
                </button>
              )
            })}
          </div>

          {popup &&
            PICKER_POPUPS[popup.type] &&
            createPortal(
              <>
                <div className="popover-backdrop" onClick={() => setPopup(null)} />
                <div className="picker-popover" style={{ top: popup.top, left: popup.left }}>
                  {PICKER_POPUPS[popup.type]!.options.map((o) => (
                    <button
                      key={o.value}
                      className="picker-popover__opt"
                      onClick={() => startAddingWithChoice(popup.type, PICKER_POPUPS[popup.type]!.fieldKey, o.value)}
                    >
                      {o.label}
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
          {tableMode ? 'Entdeckt' : 'Objekte'} <span className="sidebar__count">{visible.length}</span>
        </h2>
        {visible.length === 0 ? (
          <p className="sidebar__empty">
            {tableMode
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
