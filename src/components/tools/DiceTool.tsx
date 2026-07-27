import { useState } from 'react'
import { roll } from '../../utils/tools'
import type { RollResult } from '../../utils/tools'

const DICE = [4, 6, 8, 10, 12, 20, 100]

export function DiceTool() {
  const [count, setCount] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [mode, setMode] = useState<'normal' | 'vorteil' | 'nachteil'>('normal')
  const [last, setLast] = useState<RollResult | null>(null)
  const [history, setHistory] = useState<RollResult[]>([])

  function doRoll(sides: number) {
    const res = roll(sides, count, modifier, mode)
    setLast(res)
    setHistory((h) => [res, ...h].slice(0, 12))
  }

  const crit = last && last.sides === 20 && last.count === 1 && last.rolls[0] === 20
  const fumble = last && last.sides === 20 && last.count === 1 && last.rolls[0] === 1

  return (
    <div className="dice">
      <div className={`dice__stage${crit ? ' is-crit' : ''}${fumble ? ' is-fumble' : ''}`}>
        {last ? (
          <>
            <div className="dice__total">{last.total}</div>
            <div className="dice__breakdown">
              {last.count}w{last.sides}
              {last.mode !== 'normal' && ` · ${last.mode}`} [{last.rolls.join(', ')}]
              {last.modifier !== 0 && ` ${last.modifier > 0 ? '+' : ''}${last.modifier}`}
            </div>
            {crit && <div className="dice__flag dice__flag--crit">Kritischer Treffer</div>}
            {fumble && <div className="dice__flag dice__flag--fumble">Patzer</div>}
          </>
        ) : (
          <div className="dice__hint">Wuerfel waehlen und werfen</div>
        )}
      </div>

      <div className="dice__opts">
        <label className="dice__opt">
          <span>Anzahl</span>
          <input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="field__control field__control--sm"
          />
        </label>
        <label className="dice__opt">
          <span>Modifikator</span>
          <input
            type="number"
            value={modifier}
            onChange={(e) => setModifier(Number(e.target.value) || 0)}
            className="field__control field__control--sm"
          />
        </label>
      </div>

      <div className="dice__modes">
        {(['normal', 'vorteil', 'nachteil'] as const).map((m) => (
          <button
            key={m}
            className={`dice__mode${mode === m ? ' is-active' : ''}`}
            onClick={() => setMode(m)}
            title={m === 'normal' ? 'Normaler Wurf' : `${m} nur bei 1w20`}
          >
            {m === 'normal' ? 'Normal' : m === 'vorteil' ? 'Vorteil' : 'Nachteil'}
          </button>
        ))}
      </div>

      <div className="dice__grid">
        {DICE.map((d) => (
          <button key={d} className="dice__btn" onClick={() => doRoll(d)}>
            w{d}
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <div className="dice__history">
          <div className="dice__history-head">
            <span>Verlauf</span>
            <button className="linklike" onClick={() => setHistory([])}>
              leeren
            </button>
          </div>
          <ul>
            {history.map((h, i) => (
              <li key={i}>
                <span className="dice__h-die">
                  {h.count}w{h.sides}
                </span>
                <span className="dice__h-detail">[{h.rolls.join(', ')}]{h.modifier !== 0 ? ` ${h.modifier > 0 ? '+' : ''}${h.modifier}` : ''}</span>
                <span className="dice__h-total">{h.total}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
