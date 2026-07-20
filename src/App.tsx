import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { MapCanvas } from './components/MapCanvas'
import { DetailPanel } from './components/DetailPanel'
import { TimeSlider } from './components/TimeSlider'
import { Timeline } from './components/Timeline'
import { StoryTree } from './components/StoryTree'
import { useStore } from './store/useStore'

export default function App() {
  const timelineOpen = useStore((s) => s.timelineOpen)
  const storyTreeOpen = useStore((s) => s.storyTreeOpen)

  return (
    <div className="app">
      <TopBar />
      <div className="app__body">
        <Sidebar />
        <main className="app__map">
          <TimeSlider />
          <MapCanvas />
          {timelineOpen && <Timeline />}
          {storyTreeOpen && <StoryTree />}
        </main>
        <DetailPanel />
      </div>
    </div>
  )
}
