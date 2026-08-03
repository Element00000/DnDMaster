import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ENTITY_TYPES, GESINNUNG_OPTIONS, ITEM_ART_OPTIONS } from '../types'
import type { EntityType, MapLayer } from '../types'
import { useStore } from '../store/useStore'
import type { ToolTab } from '../store/useStore'
import { fileToScaledDataUrl } from '../utils/image'
import { deleteAsset, putAsset } from '../utils/assets'
import { MIN_EMBED_SIZE } from './MapCanvas'
import { DiceTool } from './tools/DiceTool'
import { SessionNotes } from './tools/SessionNotes'
import { AiTool } from './tools/AiTool'
import { MusicTool } from './tools/MusicTool'

const TOOL_ITEMS: { tab: ToolTab; label: string; icon: string }[] = [
  { tab: 'wuerfel', label: 'Wuerfel', icon: '\u{1F3B2}' },
  { tab: 'notizen', label: 'Notizen', icon: '\u{1F4D3}' },
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
  const embedLayer = useStore((s) => s.embedLayer)
  const viewLayerId = useStore((s) => s.viewLayerId)
  const setViewLayerId = useStore((s) => s.setViewLayerId)

  const [popup, setPopup] = useState<{ type: EntityType; top: number; left: number } | null>(null)
  const [mapsMenu, setMapsMenu] = useState<{ top: number; left: number } | null>(null)
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [imageSwapTargetId, setImageSwapTargetId] = useState<string | null>(null)
  const addSectionRef = useRef<HTMLElement>(null)
  const swapImageFileRef = useRef<HTMLInputElement>(null)
  const newLayerFileRef = useRef<HTMLInputElement>(null)

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

  // Kartenbild einer beliebigen Karte in der Hierarchie austauschen (Button je Zeile in
  // "Meine Karten"). setLayerImage skaliert bei abweichenden Bildmassen Nebel, Objekte und
  // darin eingebettete Karten proportional mit, damit dabei nichts "herunterfaellt".
  function onSwapImage(l: MapLayer) {
    setImageSwapTargetId(l.id)
    swapImageFileRef.current?.click()
  }

  async function onSwapImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const targetId = imageSwapTargetId
    setImageSwapTargetId(null)
    if (!file || !targetId) return
    const prev = campaign.layers.find((l) => l.id === targetId)?.imageUrl ?? null
    const { url, width, height } = await fileToScaledDataUrl(file, { maxDim: 2400, quality: 0.85 })
    const ref = await putAsset(url)
    setLayerImage(targetId, ref, width, height)
    void deleteAsset(prev)
  }

  // "+ Neue Karte": oeffnet direkt den Datei-Dialog. Der Dateiname (ohne Endung) wird als
  // Kartenname uebernommen - ueber das Bearbeiten-Symbol spaeter jederzeit anpassbar. Die
  // neue Karte wird sofort hierarchisch in die Karte eingebettet, die man gerade betrachtet
  // (viewLayerId, sonst die Wurzelkarte selbst) - zentriert, in einem Viertel von deren Groesse.
  async function onNewLayerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const name = file.name.replace(/\.[^./\\]+$/, '').trim() || 'Neue Karte'
    const id = addLayer(name)
    const { url, width, height } = await fileToScaledDataUrl(file, { maxDim: 2400, quality: 0.85 })
    const ref = await putAsset(url)
    setLayerImage(id, ref, width, height)
    const parentId = viewLayerId ?? layer.id
    const parent = campaign.layers.find((l) => l.id === parentId)
    if (parent) {
      const w = Math.max(MIN_EMBED_SIZE, parent.width * 0.25)
      const h = Math.max(MIN_EMBED_SIZE, w * (height / width))
      const x = Math.max(0, Math.min(parent.width - w, (parent.width - w) / 2))
      const y = Math.max(0, Math.min(parent.height - h, (parent.height - h) / 2))
      embedLayer(id, { parentLayerId: parentId, x, y, width: w, height: h })
    }
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

  // Darf draggedId per Drag & Drop auf targetId eingebettet werden? Nicht auf sich selbst
  // und nicht auf eine eigene (verschachtelte) Unterkarte, sonst entstuende ein Zyklus.
  function canEmbedOnto(draggedId: string, targetId: string): boolean {
    if (draggedId === targetId) return false
    let current = campaign.layers.find((l) => l.id === targetId)
    while (current?.embed) {
      if (current.embed.parentLayerId === draggedId) return false
      current = campaign.layers.find((l) => l.id === current!.embed!.parentLayerId)
    }
    return true
  }

  // Ist l eine (beliebig tief verschachtelte) Unterkarte der aktuellen Wurzelkarte (layer)?
  function isDescendantOfActive(l: MapLayer): boolean {
    let current: MapLayer | undefined = l
    while (current?.embed) {
      if (current.embed.parentLayerId === layer.id) return true
      current = campaign.layers.find((x) => x.id === current!.embed!.parentLayerId)
    }
    return false
  }

  // Karte in "Meine Karten" anklicken: bleibt in der Wurzelkarten-Instanz und schwenkt/zoomt
  // nur dorthin (viewLayerId), solange die Karte Teil der aktuellen Hierarchie ist. Nur bei
  // einer voellig getrennten (anderen) Wurzelkarte wird tatsaechlich die aktive Ebene gewechselt.
  function onClickLayerName(l: MapLayer) {
    if (l.id === layer.id) {
      setViewLayerId(null)
    } else if (isDescendantOfActive(l)) {
      setViewLayerId(l.id)
    } else {
      setActiveLayer(l.id)
    }
    setMapsMenu(null)
  }

  function onLayerDrop(draggedId: string, target: MapLayer) {
    const moving = campaign.layers.find((l) => l.id === draggedId)
    if (!moving || !canEmbedOnto(draggedId, target.id)) return
    const w = Math.max(MIN_EMBED_SIZE, target.width * 0.25)
    const h = Math.max(MIN_EMBED_SIZE, w * (moving.height / moving.width))
    const x = Math.max(0, Math.min(target.width - w, (target.width - w) / 2))
    const y = Math.max(0, Math.min(target.height - h, (target.height - h) / 2))
    embedLayer(draggedId, { parentLayerId: target.id, x, y, width: w, height: h })
  }

  function openTool(tab: ToolTab) {
    if (toolsOpen && toolsTab === tab) {
      setToolsOpen(false)
    } else {
      setToolsTab(tab)
      setToolsOpen(true)
    }
  }

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

  return (
    <aside className="sidebar">
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
                  <div
                    key={l.id}
                    className={`maps-menu__row${dropTargetId === l.id ? ' maps-menu__row--drop-target' : ''}${draggingLayerId === l.id ? ' maps-menu__row--dragging' : ''}`}
                    style={{ paddingLeft: 8 + depth * 18 }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', l.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDraggingLayerId(l.id)
                    }}
                    onDragEnd={() => {
                      setDraggingLayerId(null)
                      setDropTargetId(null)
                    }}
                    onDragOver={(e) => {
                      if (!draggingLayerId || !canEmbedOnto(draggingLayerId, l.id)) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDropTargetId(l.id)
                    }}
                    onDragLeave={() => setDropTargetId((cur) => (cur === l.id ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault()
                      const draggedId = e.dataTransfer.getData('text/plain')
                      setDropTargetId(null)
                      setDraggingLayerId(null)
                      if (draggedId) onLayerDrop(draggedId, l)
                    }}
                    title="Ziehen, um diese Karte auf eine andere Karte einzubetten"
                  >
                    <button
                      className={`maps-menu__name${l.id === (viewLayerId ?? layer.id) ? ' is-active' : ''}`}
                      onClick={() => onClickLayerName(l)}
                      title={depth === 0 ? 'Hauptkarten-Ebene' : `Eingebettet, Ebene ${depth + 1}`}
                    >
                      {depth > 0 ? '↳ ' : ''}
                      {l.name}
                    </button>
                    <button className="icon-btn icon-btn--sm" title="Kartenbild austauschen" onClick={() => onSwapImage(l)}>
                      <svg
                        className="swap-image-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <line x1="12" y1="3" x2="12" y2="15" />
                        <polyline points="6 9 12 3 18 9" />
                        <line x1="5" y1="20" x2="19" y2="20" />
                      </svg>
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
                  <button onClick={() => newLayerFileRef.current?.click()}>+ Neue Karte</button>
                </div>,
                document.body,
              )}
            <input ref={swapImageFileRef} type="file" accept="image/*" onChange={onSwapImageFile} hidden />
            <input ref={newLayerFileRef} type="file" accept="image/*" onChange={onNewLayerFile} hidden />
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

        {toolsOpen && (
          <div className="sidebar-tool">
            <div className="sidebar-tool__head">
              <span className="sidebar-tool__title">{TOOL_ITEMS.find((t) => t.tab === toolsTab)?.label}</span>
              <button className="sidebar-tool__close" onClick={() => setToolsOpen(false)} title="Schliessen">
                &times;
              </button>
            </div>
            <div className="sidebar-tool__body">
              {toolsTab === 'wuerfel' && <DiceTool />}
              {toolsTab === 'notizen' && <SessionNotes />}
              {toolsTab === 'ki' && <AiTool />}
              {toolsTab === 'musik' && <MusicTool />}
            </div>
          </div>
        )}
      </section>
    </aside>
  )
}
