import { useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { SearchBar } from './SearchBar'
import { downloadJson, readJsonFile, slugify, todayStamp } from '../utils/backup'
import { backupHint, markBackup } from '../utils/backupReminder'
import { fileToScaledDataUrl } from '../utils/image'
import { deleteAsset, inlineAsset, internAsset, mapCampaignAssets, putAsset } from '../utils/assets'
import type { AppData, Campaign, MapLayer } from '../types'

const BACKUP_APP = 'dnd-weltkarte'
const BACKUP_VERSION = 6

export function TopBar() {
  const fileRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const campaigns = useStore((s) => s.campaigns)
  const activeCampaignId = useStore((s) => s.activeCampaignId)
  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId) ?? campaigns[0]
  const layer = activeCampaign.layers.find((l) => l.id === activeCampaign.activeLayerId) ?? activeCampaign.layers[0]

  const setActiveCampaign = useStore((s) => s.setActiveCampaign)
  const addCampaign = useStore((s) => s.addCampaign)
  const renameCampaign = useStore((s) => s.renameCampaign)
  const deleteCampaign = useStore((s) => s.deleteCampaign)
  const importCampaign = useStore((s) => s.importCampaign)
  const replaceAllData = useStore((s) => s.replaceAllData)
  const setLayerImage = useStore((s) => s.setLayerImage)
  const addLayer = useStore((s) => s.addLayer)
  const renameLayer = useStore((s) => s.renameLayer)
  const deleteLayer = useStore((s) => s.deleteLayer)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
  const placingLayerId = useStore((s) => s.placingLayerId)
  const setPlacingLayer = useStore((s) => s.setPlacingLayer)
  const timelineOpen = useStore((s) => s.timelineOpen)
  const setTimelineOpen = useStore((s) => s.setTimelineOpen)
  const storyTreeOpen = useStore((s) => s.storyTreeOpen)
  const setStoryTreeOpen = useStore((s) => s.setStoryTreeOpen)
  const relationGraphOpen = useStore((s) => s.relationGraphOpen)
  const setRelationGraphOpen = useStore((s) => s.setRelationGraphOpen)
  const tableMode = useStore((s) => s.tableMode)
  const setTableMode = useStore((s) => s.setTableMode)

  const [manageOpen, setManageOpen] = useState(false)
  const [mapsMenuOpen, setMapsMenuOpen] = useState(false)
  const entityCount = activeCampaign.entities.length

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
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
    if (activeCampaign.layers.length <= 1) {
      alert('Die letzte Karte kann nicht geloescht werden.')
      return
    }
    if (confirm(`Karte "${l.name}" loeschen? Marker auf ihr verlieren ihre Position.`)) {
      deleteLayer(l.id)
    }
  }

  function onNewCampaign() {
    const name = prompt('Name der neuen Kampagne / Welt:')
    if (name && name.trim()) addCampaign(name.trim())
  }

  function onRename() {
    const name = prompt('Kampagne umbenennen:', activeCampaign.name)
    if (name && name.trim()) renameCampaign(activeCampaign.id, name.trim())
  }

  function onDelete() {
    if (campaigns.length <= 1) {
      alert('Die letzte Kampagne kann nicht geloescht werden.')
      return
    }
    if (confirm(`Kampagne "${activeCampaign.name}" mit allen Inhalten loeschen?`)) {
      deleteCampaign(activeCampaign.id)
      setManageOpen(false)
    }
  }

  async function onExportCampaign() {
    setManageOpen(false)
    // Bilder aus IndexedDB einbetten -> autarke Datei.
    const campaign = await mapCampaignAssets(activeCampaign, inlineAsset)
    downloadJson(`${slugify(activeCampaign.name)}-${todayStamp()}.json`, {
      app: BACKUP_APP,
      kind: 'campaign',
      version: BACKUP_VERSION,
      campaign,
    })
    markBackup()
  }

  async function onExportAll() {
    setManageOpen(false)
    const inlined = await Promise.all(campaigns.map((c) => mapCampaignAssets(c, inlineAsset)))
    const data: AppData = { campaigns: inlined, activeCampaignId }
    downloadJson(`${BACKUP_APP}-backup-${todayStamp()}.json`, {
      app: BACKUP_APP,
      kind: 'full',
      version: BACKUP_VERSION,
      data,
    })
    markBackup()
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const obj = (await readJsonFile(file)) as Record<string, unknown>
      // Einzelne Kampagne
      const camp = obj.campaign as Campaign | undefined
      if (camp && Array.isArray(camp.entities)) {
        // Eingebettete Bilder wieder in IndexedDB ablegen.
        const interned = await mapCampaignAssets(camp, internAsset)
        importCampaign(interned)
        setManageOpen(false)
        return
      }
      // Vollbackup
      const data = (obj.data ?? obj) as AppData
      if (data && Array.isArray(data.campaigns) && data.campaigns.length > 0) {
        if (
          confirm(
            `Backup mit ${data.campaigns.length} Kampagne(n) importieren? Das ersetzt ALLE aktuellen Daten.`,
          )
        ) {
          const interned = await Promise.all(data.campaigns.map((c) => mapCampaignAssets(c, internAsset)))
          replaceAllData({ campaigns: interned, activeCampaignId: data.activeCampaignId })
          setManageOpen(false)
        }
        return
      }
      alert('Keine gueltigen Kampagnendaten in der Datei gefunden.')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import fehlgeschlagen.')
    }
  }

  // Spieltischmodus: reduzierte Live-Ansicht.
  if (tableMode) {
    return (
      <header className="topbar topbar--table">
        <div className="topbar__brand">
          <span className="topbar__mark">&#9670;</span>
          <div>
            <div className="topbar__title">{activeCampaign.name}</div>
            <div className="topbar__subtitle">{layer.name} · Spieltisch</div>
          </div>
        </div>
        <button className="btn btn--primary" onClick={() => setTableMode(false)}>
          Spieltisch verlassen
        </button>
      </header>
    )
  }

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark">&#9670;</span>
        <div>
          <div className="topbar__title">DM Weltkarte</div>
          <div className="topbar__subtitle">{layer.name}</div>
        </div>
      </div>

      <div className="campaign-switch">
        <select
          className="campaign-switch__select"
          value={activeCampaign.id}
          onChange={(e) => setActiveCampaign(e.target.value)}
          title="Kampagne / Welt wechseln"
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="icon-btn" title="Kampagne verwalten" onClick={() => setManageOpen((o) => !o)}>
          &#9776;
        </button>
        {manageOpen && (
          <div className="campaign-menu" onMouseLeave={() => setManageOpen(false)}>
            {(() => {
              const h = backupHint()
              return (
                <div className={`campaign-menu__backup${h.stale ? ' is-stale' : ''}`}>
                  {h.stale ? '⚠ ' : ''}
                  {h.text}
                  {h.stale && <span> — jetzt sichern:</span>}
                </div>
              )
            })()}
            <button onClick={onNewCampaign}>Neue Kampagne / Welt</button>
            <button onClick={onRename}>Umbenennen</button>
            <div className="campaign-menu__sep" />
            <button onClick={onExportCampaign}>Diese Kampagne exportieren</button>
            <button onClick={onExportAll}>Backup exportieren (alles)</button>
            <button onClick={() => importRef.current?.click()}>Importieren …</button>
            <div className="campaign-menu__sep" />
            <button className="campaign-menu__danger" onClick={onDelete}>
              Loeschen
            </button>
          </div>
        )}
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
      </div>

      <div className="campaign-switch">
        <button className={`btn${placingLayerId ? ' btn--active' : ''}`} onClick={() => setMapsMenuOpen((o) => !o)}>
          Meine Karten
        </button>
        {mapsMenuOpen && (
          <div className="campaign-menu maps-menu" onMouseLeave={() => setMapsMenuOpen(false)}>
            {activeCampaign.layers.map((l) => (
              <div key={l.id} className="maps-menu__row">
                <button
                  className={`maps-menu__name${l.id === layer.id ? ' is-active' : ''}`}
                  onClick={() => setActiveLayer(l.id)}
                  title="Als aktive Karte anzeigen"
                >
                  {l.embed ? '↳ ' : ''}
                  {l.name}
                </button>
                <button className="icon-btn icon-btn--sm" title="Umbenennen" onClick={() => onRenameLayer(l)}>
                  ✎
                </button>
                {activeCampaign.layers.length > 1 && (
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
                      setMapsMenuOpen(false)
                    }}
                  >
                    Auf Karte platzieren
                  </button>
                )}
              </div>
            ))}
            <div className="campaign-menu__sep" />
            <button onClick={onAddLayer}>+ Neue Karte</button>
            <button onClick={() => fileRef.current?.click()}>Bild fuer „{layer.name}“ hochladen</button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} hidden />
      </div>

      {placingLayerId && (
        <div className="topbar__hint">
          Klicke auf die Hauptkarte, um die Karte dort einzubetten.
          <button className="linklike" onClick={() => setPlacingLayer(null)}>
            Abbrechen
          </button>
        </div>
      )}

      <SearchBar />

      <div className="topbar__meta">{entityCount} Objekte</div>

      <div className="topbar__actions">
        <button
          className={`btn${timelineOpen ? ' btn--active' : ''}`}
          onClick={() => setTimelineOpen(!timelineOpen)}
          title="Kampagnen-Zeitleiste ein-/ausblenden"
        >
          Zeitleiste
        </button>
        <button
          className={`btn${storyTreeOpen ? ' btn--active' : ''}`}
          onClick={() => setStoryTreeOpen(!storyTreeOpen)}
          title="Handlungsbaum ein-/ausblenden"
        >
          Handlungsbaum
        </button>
        <button
          className={`btn${relationGraphOpen ? ' btn--active' : ''}`}
          onClick={() => setRelationGraphOpen(!relationGraphOpen)}
          title="Beziehungsgraph ein-/ausblenden"
        >
          Beziehungen
        </button>
        <button
          className="btn"
          onClick={() => setTableMode(true)}
          title="Aufgeraeumte Live-Ansicht fuer den Spieltisch"
        >
          Spieltisch
        </button>
      </div>
    </header>
  )
}
