import { useStore } from '../store/useStore'
import { useActiveLayer } from '../store/useActive'

/** Nebel-des-Krieges-Steuerung, oben links auf der Karte. */
export function LayerBar() {
  const layer = useActiveLayer()
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
              <label className="layerbar__brushfield" title="Pinselgroesse">
                <input
                  className="layerbar__brush"
                  type="range"
                  // Fein genug fuer einzelne Raeume auf einer kleinen Kampfkarte. Die
                  // Schrittweite waechst mit der Groesse, damit der Regler unten
                  // feinfuehlig bleibt und oben trotzdem den ganzen Bereich abdeckt.
                  min={4}
                  max={400}
                  step={fogBrush < 40 ? 2 : 10}
                  value={fogBrush}
                  onChange={(e) => setFogBrush(Number(e.target.value))}
                />
                <span className="layerbar__brushsize">{Math.round(fogBrush)}</span>
              </label>
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
