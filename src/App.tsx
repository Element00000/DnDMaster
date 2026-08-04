import { useEffect } from 'react'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { MapCanvas } from './components/MapCanvas'
import { DetailPanel } from './components/DetailPanel'
import { TimeSlider } from './components/TimeSlider'
import { BottomBar } from './components/BottomBar'
import { BottomPanel } from './components/BottomPanel'
import { LayerBar } from './components/LayerBar'
import { FightMode } from './components/FightMode'
import { useStore } from './store/useStore'

export default function App() {
  const tableMode = useStore((s) => s.tableMode)
  const fightEventId = useStore((s) => s.fightEventId)
  const undo = useStore((s) => s.undo)

  // Strg+Z (bzw. Cmd+Z): letzte Aenderung rueckgaengig machen. Wird in Text-
  // feldern ignoriert, damit dort das native Eingabe-Undo greift.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (tableMode) return
        const target = e.target as HTMLElement | null
        const tag = target?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tableMode, undo])

  return (
    <div className={`app${tableMode ? ' app--table' : ''}`}>
      <TopBar />
      <div className="app__body">
        {!tableMode && <Sidebar />}
        <main className="app__map">
          <LayerBar />
          <TimeSlider />
          <MapCanvas />
          <BottomPanel />
          {!tableMode && <BottomBar />}
        </main>
        {!tableMode && <DetailPanel />}
      </div>
      {fightEventId && <FightMode />}
    </div>
  )
}
