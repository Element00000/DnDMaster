import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { MapCanvas } from './components/MapCanvas'
import { DetailPanel } from './components/DetailPanel'

export default function App() {
  return (
    <div className="app">
      <TopBar />
      <div className="app__body">
        <Sidebar />
        <main className="app__map">
          <MapCanvas />
        </main>
        <DetailPanel />
      </div>
    </div>
  )
}
