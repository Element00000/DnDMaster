import { useState } from 'react'
import { randomEncounter, randomName, randomRumor, randomWeather } from '../../utils/tools'

interface Gen {
  key: string
  label: string
  icon: string
  fn: () => string
}

const GENERATORS: Gen[] = [
  { key: 'name', label: 'Name', icon: '\u{1F464}', fn: randomName },
  { key: 'weather', label: 'Wetter', icon: '\u{1F326}', fn: randomWeather },
  { key: 'encounter', label: 'Begegnung', icon: '\u{2694}', fn: randomEncounter },
  { key: 'rumor', label: 'Geruecht', icon: '\u{1F5E3}', fn: randomRumor },
]

export function RandomGenerators() {
  const [results, setResults] = useState<Record<string, string>>({})

  return (
    <div className="random">
      {GENERATORS.map((g) => (
        <div key={g.key} className="random__card">
          <div className="random__top">
            <span className="random__label">
              {g.icon} {g.label}
            </span>
            <button className="btn btn--sm" onClick={() => setResults((r) => ({ ...r, [g.key]: g.fn() }))}>
              Wuerfeln
            </button>
          </div>
          <div className="random__out">{results[g.key] ?? '—'}</div>
        </div>
      ))}
    </div>
  )
}
