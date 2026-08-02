import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { entityMeta } from '../types'

interface Hit {
  id: string
  kind: 'entity' | 'session'
  icon: string
  color: string
  name: string
  detail: string
  layerId: string | null
}

/** Globale Suche ueber Objekte und Sitzungsnotizen der aktiven Kampagne. */
export function SearchBar() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const tableMode = useStore((s) => s.tableMode)
  const selectEntity = useStore((s) => s.selectEntity)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
  const setToolsOpen = useStore((s) => s.setToolsOpen)
  const setToolsTab = useStore((s) => s.setToolsTab)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: Hit[] = []
    for (const e of campaign.entities) {
      if (tableMode && e.visibility !== 'spieler') continue
      const haystack = [e.name, e.description, ...Object.values(e.fields)].join(' ').toLowerCase()
      if (haystack.includes(q)) {
        const meta = entityMeta(e.type)
        out.push({
          id: e.id,
          kind: 'entity',
          icon: meta.icon,
          color: meta.color,
          name: e.name,
          detail: meta.label,
          layerId: e.placement?.layerId ?? null,
        })
      }
    }
    if (!tableMode) {
      for (const s of campaign.sessions) {
        if (`${s.title} ${s.body} ${s.inGameDate}`.toLowerCase().includes(q)) {
          out.push({ id: s.id, kind: 'session', icon: '\u{1F4D3}', color: '#7c83ff', name: s.title || 'Sitzung', detail: 'Notiz', layerId: null })
        }
      }
    }
    return out.slice(0, 12)
  }, [query, campaign, tableMode])

  function choose(hit: Hit) {
    if (hit.kind === 'entity') {
      if (hit.layerId && hit.layerId !== campaign.activeLayerId) setActiveLayer(hit.layerId)
      selectEntity(hit.id)
    } else {
      setToolsTab('notizen')
      setToolsOpen(true)
    }
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="search" ref={boxRef}>
      <span className="search__icon">⌕</span>
      <input
        className="search__input"
        value={query}
        placeholder="Suchen ..."
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) choose(hits[0])
          if (e.key === 'Escape') {
            setQuery('')
            setOpen(false)
          }
        }}
      />
      {open && query.trim() && (
        <div className="search__results">
          {hits.length === 0 ? (
            <div className="search__none">Nichts gefunden</div>
          ) : (
            hits.map((h) => (
              <button
                key={`${h.kind}-${h.id}`}
                className="search__hit"
                style={{ ['--chip-color' as string]: h.color }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(h)}
              >
                <span className="search__hit-icon">{h.icon}</span>
                <span className="search__hit-name">{h.name}</span>
                <span className="search__hit-detail">{h.detail}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
