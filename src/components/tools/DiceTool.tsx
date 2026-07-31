import { useEffect, useRef, useState } from 'react'
import { rollDie } from '../../utils/tools'

const DICE = [4, 6, 8, 10, 12, 20, 100]
type Mode = 'normal' | 'vorteil' | 'nachteil'
type Phase = 'idle' | 'rolling' | 'settled'

interface HistoryEntry {
  sides: number
  rolls: number[]
  mode: Mode
  modifier: number
  keptIndex: number | null
  total: number
}

export function DiceTool() {
  const [count, setCount] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [mode, setMode] = useState<Mode>('normal')
  const [sides, setSides] = useState(20)

  const [phase, setPhase] = useState<Phase>('idle')
  const [displayed, setDisplayed] = useState<number[]>([])
  const [keptIndex, setKeptIndex] = useState<number | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearInterval(timer.current), [])

  function doRoll(s: number) {
    window.clearInterval(timer.current)
    setSides(s)
    const n = mode === 'normal' ? Math.max(1, Math.min(20, count)) : 2
    const finals = Array.from({ length: n }, () => rollDie(s))
    setPhase('rolling')
    setKeptIndex(null)
    setTotal(null)
    setDisplayed(Array.from({ length: n }, () => rollDie(s)))

    const start = Date.now()
    timer.current = window.setInterval(() => {
      if (Date.now() - start >= 750) {
        window.clearInterval(timer.current)
        settle(s, finals)
      } else {
        setDisplayed(Array.from({ length: n }, () => rollDie(s)))
      }
    }, 70)
  }

  function settle(s: number, finals: number[]) {
    setDisplayed(finals)
    let kept: number | null = null
    let counted: number
    if (mode !== 'normal') {
      const maxI = finals[0] >= finals[1] ? 0 : 1
      const minI = finals[0] <= finals[1] ? 0 : 1
      kept = mode === 'vorteil' ? maxI : minI
      counted = finals[kept]
    } else {
      counted = finals.reduce((a, b) => a + b, 0)
    }
    const tot = counted + modifier
    setKeptIndex(kept)
    setTotal(tot)
    setPhase('settled')
    setHistory((h) => [{ sides: s, rolls: finals, mode, modifier, keptIndex: kept, total: tot }, ...h].slice(0, 12))
  }

  // Kritischer Treffer / Patzer nur bei einem einzelnen gezaehlten d20.
  const singleD20 = phase === 'settled' && sides === 20 && (mode !== 'normal' || displayed.length === 1)
  const countedDie = singleD20 ? displayed[keptIndex ?? 0] : null
  const crit = countedDie === 20
  const fumble = countedDie === 1

  const modLabel = modifier !== 0 ? ` ${modifier > 0 ? '+' : ''}${modifier}` : ''

  return (
    <div className="dice">
      <div className={`dice__stage${crit ? ' is-crit' : ''}${fumble ? ' is-fumble' : ''}`}>
        {phase === 'idle' ? (
          <>
            <div className="dice__tray">
              <Die sides={sides} value={null} state="idle" />
            </div>
            <div className="dice__hint">Wuerfel waehlen und werfen</div>
          </>
        ) : (
          <>
            <div className="dice__tray">
              {displayed.map((v, i) => (
                <Die
                  key={i}
                  sides={sides}
                  value={v}
                  state={
                    phase === 'rolling'
                      ? 'rolling'
                      : keptIndex == null
                        ? undefined
                        : i === keptIndex
                          ? 'kept'
                          : 'dropped'
                  }
                />
              ))}
            </div>
            {phase === 'settled' && total != null && (
              <>
                <div className="dice__total">{total}</div>
                <div className="dice__breakdown">
                  {mode !== 'normal' ? `${mode} · ` : displayed.length > 1 ? `${displayed.length}w${sides} · ` : `w${sides} · `}
                  [{displayed.join(', ')}]
                  {mode !== 'normal' && keptIndex != null ? ` → ${displayed[keptIndex]}` : ''}
                  {modLabel}
                </div>
                {crit && <div className="dice__flag dice__flag--crit">Kritischer Treffer</div>}
                {fumble && <div className="dice__flag dice__flag--fumble">Patzer</div>}
              </>
            )}
          </>
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
            disabled={mode !== 'normal'}
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
            title={
              m === 'normal'
                ? 'Normaler Wurf'
                : m === 'vorteil'
                  ? 'Zwei Wuerfel — der hoechste zaehlt'
                  : 'Zwei Wuerfel — der niedrigste zaehlt'
            }
          >
            {m === 'normal' ? 'Normal' : m === 'vorteil' ? 'Vorteil' : 'Nachteil'}
          </button>
        ))}
      </div>

      <div className="dice__grid">
        {DICE.map((d) => (
          <button key={d} className={`dice__btn${sides === d ? ' is-active' : ''}`} onClick={() => doRoll(d)}>
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
                  {h.mode !== 'normal' ? h.mode.slice(0, 3) + '.' : h.rolls.length > 1 ? `${h.rolls.length}w${h.sides}` : `w${h.sides}`}
                </span>
                <span className="dice__h-detail">
                  [{h.rolls.join(', ')}]
                  {h.keptIndex != null ? `→${h.rolls[h.keptIndex]}` : ''}
                  {h.modifier !== 0 ? ` ${h.modifier > 0 ? '+' : ''}${h.modifier}` : ''}
                </span>
                <span className="dice__h-total">{h.total}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Ein Würfel als SVG-Form (Silhouette je nach Seitenzahl) mit Zahl. */
function Die({
  sides,
  value,
  state,
}: {
  sides: number
  value: number | null
  state?: 'idle' | 'rolling' | 'kept' | 'dropped'
}) {
  return (
    <div className={`die${state ? ` is-${state}` : ''}`}>
      <svg viewBox="0 0 100 100" className="die__svg">
        <DieShape sides={sides} />
        {value != null && (
          <text x="50" y="52" className="die__num" textAnchor="middle" dominantBaseline="central">
            {value}
          </text>
        )}
      </svg>
    </div>
  )
}

function DieShape({ sides }: { sides: number }) {
  switch (sides) {
    case 4:
      return <polygon className="die__shape" points="50,10 88,84 12,84" />
    case 6:
      return <rect className="die__shape" x="14" y="14" width="72" height="72" rx="14" />
    case 8:
      return <polygon className="die__shape" points="50,8 90,50 50,92 10,50" />
    case 10:
      return <polygon className="die__shape" points="50,8 86,38 72,90 28,90 14,38" />
    case 12:
      return <polygon className="die__shape" points="50,6 84,26 84,66 50,92 16,66 16,26" />
    case 100:
      return <circle className="die__shape" cx="50" cy="50" r="44" />
    case 20:
    default:
      return (
        <>
          <polygon className="die__shape" points="50,6 88,28 88,72 50,94 12,72 12,28" />
          <polygon className="die__inner" points="50,22 76,66 24,66" />
        </>
      )
  }
}
