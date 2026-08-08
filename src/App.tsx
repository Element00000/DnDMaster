import { useEffect } from 'react'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { MapCanvas } from './components/MapCanvas'
import { DetailPanel } from './components/DetailPanel'
import { BottomBar } from './components/BottomBar'
import { BottomPanel } from './components/BottomPanel'
import { FightMode } from './components/FightMode'
import { useStore } from './store/useStore'
import { isTextEntry } from './utils/keys'

export default function App() {
  const tableMode = useStore((s) => s.tableMode)
  const fightEventId = useStore((s) => s.fightEventId)
  const undo = useStore((s) => s.undo)

  // Strg+Z (bzw. Cmd+Z): letzte Aenderung rueckgaengig machen. Wird in Text-
  // feldern ignoriert, damit dort das native Eingabe-Undo greift.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (tableMode || isTextEntry(e.target)) return
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
        {/* Zeitregler und Nebel-Steuerung sitzen in der oberen Leiste, nicht mehr
            schwebend ueber der Karte. */}
        <main className="app__map">
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
