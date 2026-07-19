import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { MapCanvas } from './components/MapCanvas'
import { DetailPanel } from './components/DetailPanel'
import { TimeSlider } from './components/TimeSlider'
import { Timeline } from './components/Timeline'
import { useStore } from './store/useStore'

export default function App() {
  const timelineOpen = useStore((s) => s.timelineOpen)

  return (
    <div className="app">
      <TopBar />
      <div className="app__body">
        <Sidebar />
        <main className="app__map">
          <TimeSlider />
          <MapCanvas />
          {timelineOpen && <Timeline />}
        </main>
        <DetailPanel />
      </div>
    </div>
  )
}
