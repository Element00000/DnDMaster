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
import { useStore } from './store/useStore'

export default function App() {
  const timelineOpen = useStore((s) => s.timelineOpen)
  const storyTreeOpen = useStore((s) => s.storyTreeOpen)
  const toolsOpen = useStore((s) => s.toolsOpen)
  const tableMode = useStore((s) => s.tableMode)
  const fightEventId = useStore((s) => s.fightEventId)

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
          {toolsOpen && <ToolsPanel />}
        </main>
        {!tableMode && <DetailPanel />}
      </div>
      {fightEventId && <FightMode />}
    </div>
  )
}
