import { useRef, useState } from 'react'
import { useStore } from '../store/useStore'

export function TopBar() {
  const fileRef = useRef<HTMLInputElement>(null)
  const campaigns = useStore((s) => s.campaigns)
  const activeCampaignId = useStore((s) => s.activeCampaignId)
  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId) ?? campaigns[0]
  const layer = activeCampaign.layers.find((l) => l.id === activeCampaign.activeLayerId) ?? activeCampaign.layers[0]

  const setActiveCampaign = useStore((s) => s.setActiveCampaign)
  const addCampaign = useStore((s) => s.addCampaign)
  const renameCampaign = useStore((s) => s.renameCampaign)
  const deleteCampaign = useStore((s) => s.deleteCampaign)
  const setLayerImage = useStore((s) => s.setLayerImage)
  const resetLayerImage = useStore((s) => s.resetLayerImage)
  const playerMode = useStore((s) => s.playerMode)
  const setPlayerMode = useStore((s) => s.setPlayerMode)
  const timelineOpen = useStore((s) => s.timelineOpen)
  const setTimelineOpen = useStore((s) => s.setTimelineOpen)
  const storyTreeOpen = useStore((s) => s.storyTreeOpen)
  const setStoryTreeOpen = useStore((s) => s.setStoryTreeOpen)

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
            <button className="campaign-menu__danger" onClick={onDelete}>
              Loeschen
            </button>
          </div>
        )}
      </div>

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
