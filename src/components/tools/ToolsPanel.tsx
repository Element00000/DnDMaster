import { useStore } from '../../store/useStore'
import type { ToolTab } from '../../store/useStore'
import { DiceTool } from './DiceTool'
import { CombatTracker } from './CombatTracker'
import { SessionNotes } from './SessionNotes'
import { RandomGenerators } from './RandomGenerators'
import { AiTool } from './AiTool'

const TABS: { tab: ToolTab; label: string; icon: string }[] = [
  { tab: 'wuerfel', label: 'Wuerfel', icon: '\u{1F3B2}' },
  { tab: 'kampf', label: 'Kampf', icon: '\u{2694}' },
  { tab: 'notizen', label: 'Notizen', icon: '\u{1F4D3}' },
  { tab: 'zufall', label: 'Zufall', icon: '\u{1F52E}' },
  { tab: 'ki', label: 'KI', icon: '\u{2728}' },
]

export function ToolsPanel() {
  const tab = useStore((s) => s.toolsTab)
  const setTab = useStore((s) => s.setToolsTab)
  const setOpen = useStore((s) => s.setToolsOpen)

  return (
    <aside className="tools">
      <div className="tools__header">
        <h2 className="tools__title">Werkzeuge</h2>
        <button className="tools__close" onClick={() => setOpen(false)} title="Schliessen">
          &times;
        </button>
      </div>

      <div className="tools__tabs">
        {TABS.map((t) => (
          <button
            key={t.tab}
            className={`tools__tab${tab === t.tab ? ' is-active' : ''}`}
            onClick={() => setTab(t.tab)}
          >
            <span className="tools__tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="tools__body">
        {tab === 'wuerfel' && <DiceTool />}
        {tab === 'kampf' && <CombatTracker />}
        {tab === 'notizen' && <SessionNotes />}
        {tab === 'zufall' && <RandomGenerators />}
        {tab === 'ki' && <AiTool />}
      </div>
    </aside>
  )
}
