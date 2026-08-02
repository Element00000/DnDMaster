import { useStore } from '../store/useStore'

/** Ebenen-Wechsler und Nebel-Steuerung, oben links auf der Karte. */
export function LayerBar() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const layer = campaign.layers.find((l) => l.id === campaign.activeLayerId) ?? campaign.layers[0]
  const tableMode = useStore((s) => s.tableMode)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
  const addLayer = useStore((s) => s.addLayer)
  const renameLayer = useStore((s) => s.renameLayer)
  const deleteLayer = useStore((s) => s.deleteLayer)
  const setLayerFog = useStore((s) => s.setLayerFog)
  const clearReveals = useStore((s) => s.clearReveals)
  const fogEditing = useStore((s) => s.fogEditing)
  const setFogEditing = useStore((s) => s.setFogEditing)
  const fogBrush = useStore((s) => s.fogBrush)
  const setFogBrush = useStore((s) => s.setFogBrush)

  function onAdd() {
    const name = prompt('Name der neuen Kartenebene (z.B. Regionalkarte, Stadtplan):')
    if (name && name.trim()) addLayer(name.trim())
  }

  function onRename() {
    const name = prompt('Ebene umbenennen:', layer.name)
    if (name && name.trim()) renameLayer(layer.id, name.trim())
  }

  function onDelete() {
    if (campaign.layers.length <= 1) {
      alert('Die letzte Ebene kann nicht geloescht werden.')
      return
    }
    if (confirm(`Ebene "${layer.name}" loeschen? Marker auf ihr verlieren ihre Position.`)) {
      deleteLayer(layer.id)
    }
  }

  return (
    <div className="layerbar">
      <div className="layerbar__row">
        <span className="layerbar__icon">◈</span>
        <select
          className="layerbar__select"
          value={layer.id}
          onChange={(e) => setActiveLayer(e.target.value)}
          title="Kartenebene wechseln"
        >
          {campaign.layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        {!tableMode && (
          <>
            <button className="layerbar__btn" title="Neue Ebene" onClick={onAdd}>
              +
            </button>
            <button className="layerbar__btn" title="Ebene umbenennen" onClick={onRename}>
              ✎
            </button>
            {campaign.layers.length > 1 && (
              <button className="layerbar__btn" title="Ebene loeschen" onClick={onDelete}>
                🗑
              </button>
            )}
          </>
        )}
      </div>

      {!tableMode && (
        <div className="layerbar__fog">
          <label className="layerbar__fogtoggle" title="Nebel des Krieges auf dieser Ebene">
            <input
              type="checkbox"
              checked={layer.fogEnabled}
              onChange={(e) => setLayerFog(layer.id, e.target.checked)}
            />
            <span>Nebel</span>
          </label>

          {layer.fogEnabled && (
            <>
              <button
                className={`layerbar__btn${fogEditing ? ' is-active' : ''}`}
                title="Bereiche aufdecken (auf die Karte malen)"
                onClick={() => setFogEditing(!fogEditing)}
              >
                Pinsel
              </button>
              {fogEditing && (
                <input
                  className="layerbar__brush"
                  type="range"
                  min={40}
                  max={400}
                  step={10}
                  value={fogBrush}
                  onChange={(e) => setFogBrush(Number(e.target.value))}
                  title="Pinselgroesse"
                />
              )}
              <button className="layerbar__btn" title="Alles wieder verdecken" onClick={() => clearReveals(layer.id)}>
                Reset
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
