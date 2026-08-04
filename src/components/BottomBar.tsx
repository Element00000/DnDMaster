import { useLayoutEffect, useRef, useState } from 'react'
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
  const open = bottomPanel !== null

  /**
   * Beim Auf- und Zuklappen ohne weichen Nachlauf umsetzen: Das Panel steht sofort auf
   * voller Hoehe, die nachlaufende Leiste laege waehrend der Animation sonst darauf.
   * Beim Ziehen an der Panelhoehe bleibt der Nachlauf erhalten.
   */
  const [snap, setSnap] = useState(false)
  const wasOpen = useRef(open)

  useLayoutEffect(() => {
    if (wasOpen.current === open) return
    wasOpen.current = open
    setSnap(true)
  }, [open])

  // Ab dem naechsten Frame wieder mit Nachlauf - die Position steht dann bereits.
  useLayoutEffect(() => {
    if (!snap) return
    const id = requestAnimationFrame(() => setSnap(false))
    return () => cancelAnimationFrame(id)
  }, [snap])

  return (
    <div
      className={`bottombar${snap ? ' is-snap' : ''}`}
      style={{ bottom: `calc(${offset}% + 12px)` }}
    >
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
