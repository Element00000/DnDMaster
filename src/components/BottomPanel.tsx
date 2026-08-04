import { useCallback, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Timeline } from './Timeline'
import { StoryTree } from './StoryTree'
import { RelationGraph } from './RelationGraph'

/**
 * Rahmen der unteren, hochfahrenden Leiste: stellt Schliessen-Knopf und den Ziehgriff zum
 * Verstellen der Hoehe bereit; den Inhalt liefert die jeweils gewaehlte Ansicht.
 */
export function BottomPanel() {
  const panel = useStore((s) => s.bottomPanel)
  const height = useStore((s) => s.bottomPanelHeight)
  const setBottomPanel = useStore((s) => s.setBottomPanel)
  const setBottomPanelHeight = useStore((s) => s.setBottomPanelHeight)
  const ref = useRef<HTMLDivElement>(null)

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

  return (
    <div ref={ref} className="bottompanel" style={{ height: `${height}%` }}>
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
        {panel === 'beziehungen' && <RelationGraph />}
      </div>
    </div>
  )
}
