import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Timeline } from './Timeline'
import { StoryTree } from './StoryTree'
import { RelationsPanel } from './RelationsPanel'

/**
 * Rahmen der unteren, hochfahrenden Leiste: stellt Schliessen-Knopf und den Ziehgriff zum
 * Verstellen der Hoehe bereit; den Inhalt liefert die jeweils gewaehlte Ansicht.
 *
 * Die Hoehe folgt standardmaessig dem Inhalt - die Leiste bleibt also schmal und waechst
 * erst, wenn Spuren oder Objekte dazukommen. Zieht man am Griff, gilt ab da die
 * eingestellte Hoehe.
 */
export function BottomPanel() {
  const panel = useStore((s) => s.bottomPanel)
  const height = useStore((s) => s.bottomPanelHeight)
  const auto = useStore((s) => s.bottomPanelAuto)
  const setBottomPanel = useStore((s) => s.setBottomPanel)
  const setBottomPanelHeight = useStore((s) => s.setBottomPanelHeight)
  const setBottomPanelPx = useStore((s) => s.setBottomPanelPx)
  const ref = useRef<HTMLDivElement>(null)

  // Die tatsaechliche Hoehe melden, damit sich die schwebenden Leisten daran ausrichten
  // koennen - im mitwachsenden Zustand sagt die Prozentangabe nichts darueber aus.
  useEffect(() => {
    const el = ref.current
    if (!el) {
      setBottomPanelPx(0)
      return
    }
    const report = () => setBottomPanelPx(el.offsetHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => {
      ro.disconnect()
      setBottomPanelPx(0)
    }
  }, [panel, setBottomPanelPx])

  // Hoehe relativ zum Kartenbereich (dem positionierenden Elternelement) berechnen, damit
  // der Griff dem Zeiger exakt folgt.
  const applyHeight = useCallback(
    (clientY: number) => {
      const parent = ref.current?.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      if (rect.height === 0) return
      setBottomPanelHeight(((rect.bottom - clientY) / rect.height) * 100)
    },
    [setBottomPanelHeight],
  )

  const onGripDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onGripMove = useCallback(
    (e: React.PointerEvent) => {
      if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
      applyHeight(e.clientY)
    },
    [applyHeight],
  )

  const onGripUp = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }, [])

  if (!panel) return null

  // Nur die Zeitleiste hat eine natuerliche Hoehe, an der sich etwas ablesen laesst.
  // Handlungsbaum und Beziehungsgraph fuellen die Flaeche, die sie bekommen - fuer sie
  // bleibt es bei der eingestellten Hoehe.
  const autoHeight = auto && panel === 'zeitleiste'

  return (
    <div
      ref={ref}
      className={`bottompanel${autoHeight ? ' is-auto' : ''}`}
      style={autoHeight ? undefined : { height: `${height}%` }}
    >
      <div
        className="bottompanel__grip"
        title="Hoehe ziehen"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
      />
      <button className="bottompanel__close" onClick={() => setBottomPanel(null)} title="Schliessen">
        &times;
      </button>
      <div className="bottompanel__content">
        {panel === 'zeitleiste' && <Timeline />}
        {panel === 'handlungsbaum' && <StoryTree />}
        {panel === 'beziehungen' && <RelationsPanel />}
      </div>
    </div>
  )
}
