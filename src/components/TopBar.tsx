import { useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { SearchBar } from './SearchBar'
import { downloadJson, readJsonFile, slugify, todayStamp } from '../utils/backup'
import type { AppData, Campaign } from '../types'

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
  const resetLayerImage = useStore((s) => s.resetLayerImage)
  const playerMode = useStore((s) => s.playerMode)
  const setPlayerMode = useStore((s) => s.setPlayerMode)
  const timelineOpen = useStore((s) => s.timelineOpen)
  const setTimelineOpen = useStore((s) => s.setTimelineOpen)
  const storyTreeOpen = useStore((s) => s.storyTreeOpen)
  const setStoryTreeOpen = useStore((s) => s.setStoryTreeOpen)
  const toolsOpen = useStore((s) => s.toolsOpen)
  const setToolsOpen = useStore((s) => s.setToolsOpen)
  const tableMode = useStore((s) => s.tableMode)
  const setTableMode = useStore((s) => s.setTableMode)

  const [manageOpen, setManageOpen] = useState(false)
  const entityCount = activeCampaign.entities.length

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      const img = new Image()
      img.onload = () => setLayerImage(layer.id, url, img.naturalWidth, img.naturalHeight)
      img.src = url
    }
    reader.readAsDataURL(file)
    e.target.value = ''
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

  function onExportCampaign() {
    downloadJson(`${slugify(activeCampaign.name)}-${todayStamp()}.json`, {
      app: BACKUP_APP,
      kind: 'campaign',
      version: BACKUP_VERSION,
      campaign: activeCampaign,
    })
    setManageOpen(false)
  }

  function onExportAll() {
    const data: AppData = { campaigns, activeCampaignId }
    downloadJson(`${BACKUP_APP}-backup-${todayStamp()}.json`, {
      app: BACKUP_APP,
      kind: 'full',
      version: BACKUP_VERSION,
      data,
    })
    setManageOpen(false)
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const obj = (await readJsonFile(file)) as Record<string, unknown>
      // Einzelne Kampagne
      const camp = (obj.campaign ?? (obj.kind === 'campaign' ? obj.campaign : undefined)) as
        | Campaign
        | undefined
      if (camp && Array.isArray((camp as Campaign).entities)) {
        importCampaign(camp)
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
          replaceAllData(data)
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
          className={`btn${toolsOpen ? ' btn--active' : ''}`}
          onClick={() => setToolsOpen(!toolsOpen)}
          title="DM-Werkzeuge ein-/ausblenden"
        >
          Werkzeuge
        </button>
        <button
          className="btn"
          onClick={() => setTableMode(true)}
          title="Aufgeraeumte Live-Ansicht fuer den Spieltisch"
        >
          Spieltisch
        </button>

        <label className="switch" title="Spieler-Ansicht: Geheimnisse und unentdeckte Objekte ausblenden">
          <input
            type="checkbox"
            checked={playerMode}
            onChange={(e) => setPlayerMode(e.target.checked)}
          />
          <span className="switch__track" />
          <span className="switch__label">{playerMode ? 'Spielersicht' : 'DM-Sicht'}</span>
        </label>

        {!playerMode && (
          <>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} hidden />
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Kartenbild
            </button>
            {layer.imageUrl && (
              <button className="btn btn--ghost" onClick={() => resetLayerImage(layer.id)}>
                Platzhalter
              </button>
            )}
          </>
        )}
      </div>
    </header>
  )
}
