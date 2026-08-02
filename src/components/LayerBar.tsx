import { useStore } from '../store/useStore'

/** Nebel-des-Krieges-Steuerung, oben links auf der Karte. */
export function LayerBar() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const layer = campaign.layers.find((l) => l.id === campaign.activeLayerId) ?? campaign.layers[0]
  const tableMode = useStore((s) => s.tableMode)
  const setLayerFog = useStore((s) => s.setLayerFog)
  const clearReveals = useStore((s) => s.clearReveals)
  const fogEditing = useStore((s) => s.fogEditing)
  const setFogEditing = useStore((s) => s.setFogEditing)
  const fogBrush = useStore((s) => s.fogBrush)
  const setFogBrush = useStore((s) => s.setFogBrush)

  if (tableMode) return null

  return (
    <div className="layerbar">
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
    </div>
  )
}
