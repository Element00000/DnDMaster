import { useStore } from '../store/useStore'
import type { BottomPanel } from '../store/useStore'

const PANELS: { panel: BottomPanel; label: string; icon: string; title: string }[] = [
  { panel: 'zeitleiste', label: 'Zeitleiste', icon: '\u{1F551}', title: 'Tagesablauf und Kampagnen-Zeitleiste' },
  { panel: 'handlungsbaum', label: 'Handlungsbaum', icon: '\u{1F500}', title: 'Verzweigte Handlungsstraenge' },
  { panel: 'beziehungen', label: 'Beziehungen', icon: '\u{1F578}', title: 'Beziehungsgraph der Objekte' },
]

/**
 * Schwebende Leiste am unteren Kartenrand (Gegenstueck zur Tageszeit-Leiste oben). Ein Klick
 * faehrt das zugehoerige Panel hoch; die Leiste selbst wandert dabei mit nach oben, damit sie
 * nicht verdeckt wird (siehe --bottom-panel-h in BottomPanel).
 */
export function BottomBar() {
  const bottomPanel = useStore((s) => s.bottomPanel)
  const bottomPanelHeight = useStore((s) => s.bottomPanelHeight)
  const toggleBottomPanel = useStore((s) => s.toggleBottomPanel)

  // Bei offenem Panel sitzt die Leiste direkt auf dessen Oberkante statt am Kartenrand.
  const offset = bottomPanel ? bottomPanelHeight : 0

  return (
    <div className="bottombar" style={{ bottom: `calc(${offset}% + 12px)` }}>
      {PANELS.map((p) => (
        <button
          key={p.panel}
          className={`bottombar__btn${bottomPanel === p.panel ? ' is-active' : ''}`}
          onClick={() => toggleBottomPanel(p.panel)}
          title={p.title}
        >
          <span className="bottombar__icon">{p.icon}</span>
          <span>{p.label}</span>
        </button>
      ))}
    </div>
  )
}
