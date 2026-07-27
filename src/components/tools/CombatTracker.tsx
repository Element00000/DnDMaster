import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { rollDie } from '../../utils/tools'

export function CombatTracker() {
  const combatants = useStore((s) => s.combatants)
  const round = useStore((s) => s.combatRound)
  const turn = useStore((s) => s.combatTurn)
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const combatPlace = useStore((s) => s.combatPlace)
  const add = useStore((s) => s.addCombatant)
  const update = useStore((s) => s.updateCombatant)
  const remove = useStore((s) => s.removeCombatant)
  const sort = useStore((s) => s.sortCombat)
  const next = useStore((s) => s.nextTurn)
  const prev = useStore((s) => s.prevTurn)
  const reset = useStore((s) => s.resetCombat)
  const setPlace = useStore((s) => s.setCombatPlace)

  const [name, setName] = useState('')
  const [init, setInit] = useState('')
  const [hp, setHp] = useState('')
  const [isPC, setIsPC] = useState(false)

  const places = campaign.entities.filter((e) => e.type === 'ort')
  const nscs = campaign.entities.filter((e) => e.type === 'nsc')

  function addRow() {
    const n = name.trim()
    if (!n) return
    const initiative = init === '' ? rollDie(20) : Number(init)
    const maxHp = hp === '' ? 10 : Number(hp)
    add({ name: n, initiative, hp: maxHp, maxHp, isPC })
    setName('')
    setInit('')
    setHp('')
    setIsPC(false)
  }

  return (
    <div className="combat">
      <div className="combat__bar">
        <div className="combat__round">
          <span className="combat__round-label">Runde</span>
          <span className="combat__round-num">{round}</span>
        </div>
        <div className="combat__nav">
          <button className="btn btn--sm" onClick={prev} disabled={combatants.length === 0}>
            &larr;
          </button>
          <button className="btn btn--sm btn--primary" onClick={next} disabled={combatants.length === 0}>
            Zug &rarr;
          </button>
        </div>
        <div className="combat__actions">
          <button className="btn btn--sm" onClick={sort} disabled={combatants.length === 0} title="Nach Initiative sortieren">
            Sortieren
          </button>
          <button className="btn btn--sm btn--danger" onClick={reset} disabled={combatants.length === 0}>
            Reset
          </button>
        </div>
      </div>

      <label className="combat__place">
        <span>Ort</span>
        <select className="field__control field__control--sm" value={combatPlace ?? ''} onChange={(e) => setPlace(e.target.value || null)}>
          <option value="">&ndash; kein Ort &ndash;</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {combatants.length === 0 ? (
        <p className="combat__empty">Noch keine Teilnehmer. Fuege Charaktere und Gegner hinzu.</p>
      ) : (
        <ul className="combat__list">
          {combatants.map((c, i) => {
            const dead = c.hp <= 0
            return (
              <li key={c.id} className={`combat__row${i === turn ? ' is-turn' : ''}${dead ? ' is-dead' : ''}${c.isPC ? ' is-pc' : ''}`}>
                <span className="combat__init">{c.initiative}</span>
                <span className="combat__name">{c.name}</span>
                <div className="combat__hp">
                  <button className="combat__hp-btn" onClick={() => update(c.id, { hp: c.hp - 1 })} title="Schaden">
                    &minus;
                  </button>
                  <span className="combat__hp-val">
                    {c.hp}/{c.maxHp}
                  </span>
                  <button className="combat__hp-btn" onClick={() => update(c.id, { hp: Math.min(c.maxHp, c.hp + 1) })} title="Heilung">
                    +
                  </button>
                </div>
                <button className="combat__remove" onClick={() => remove(c.id)} title="Entfernen">
                  &times;
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="combat__add">
        <input
          className="field__control field__control--sm combat__add-name"
          placeholder="Name"
          value={name}
          list="combat-nscs"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addRow()}
        />
        <datalist id="combat-nscs">
          {nscs.map((n) => (
            <option key={n.id} value={n.name} />
          ))}
        </datalist>
        <input
          className="field__control field__control--sm combat__add-num"
          placeholder="Ini"
          type="number"
          value={init}
          onChange={(e) => setInit(e.target.value)}
          title="Initiative (leer = 1w20)"
        />
        <input
          className="field__control field__control--sm combat__add-num"
          placeholder="TP"
          type="number"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          title="Trefferpunkte (leer = 10)"
        />
        <label className="combat__pc" title="Spielercharakter">
          <input type="checkbox" checked={isPC} onChange={(e) => setIsPC(e.target.checked)} />
          SC
        </label>
        <button className="btn btn--sm btn--primary" onClick={addRow}>
          +
        </button>
      </div>
    </div>
  )
}
