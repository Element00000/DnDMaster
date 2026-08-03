import { useEffect } from 'react'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { MapCanvas } from './components/MapCanvas'
import { DetailPanel } from './components/DetailPanel'
import { TimeSlider } from './components/TimeSlider'
import { Timeline } from './components/Timeline'
import { StoryTree } from './components/StoryTree'
import { ToolsPanel } from './components/tools/ToolsPanel'
import { LayerBar } from './components/LayerBar'
import { FightMode } from './components/FightMode'
import { BattleMapMode } from './components/BattleMapMode'
import { RelationGraph } from './components/RelationGraph'
import { useStore } from './store/useStore'

export default function App() {
  const timelineOpen = useStore((s) => s.timelineOpen)
  const storyTreeOpen = useStore((s) => s.storyTreeOpen)
  const relationGraphOpen = useStore((s) => s.relationGraphOpen)
  const toolsOpen = useStore((s) => s.toolsOpen)
  const tableMode = useStore((s) => s.tableMode)
  const fightEventId = useStore((s) => s.fightEventId)
  const battleModeLayerId = useStore((s) => s.battleModeLayerId)
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
          {timelineOpen && <Timeline />}
          {storyTreeOpen && <StoryTree />}
          {relationGraphOpen && <RelationGraph />}
          {toolsOpen && <ToolsPanel />}
        </main>
        {!tableMode && <DetailPanel />}
      </div>
      {fightEventId && <FightMode />}
      {battleModeLayerId && <BattleMapMode />}
    </div>
  )
}
