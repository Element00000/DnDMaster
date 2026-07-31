import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Creature } from '../types'
import { rollDie } from '../utils/tools'
import { AssetImg } from './AssetImg'
import { useAsset } from '../useAsset'

/** Kampf-Modus: Kampfkarte links, nach Initiative sortierte Kampftabelle rechts. */
export function FightMode() {
  const fightEventId = useStore((s) => s.fightEventId)
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const setFightEvent = useStore((s) => s.setFightEvent)
  const updateCreature = useStore((s) => s.updateCreature)
  const addCreature = useStore((s) => s.addCreature)
  const removeCreature = useStore((s) => s.removeCreature)

  const entity = campaign.entities.find((e) => e.id === fightEventId) ?? null
  const ev = entity?.event ?? null

  const [round, setRound] = useState(1)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [newName, setNewName] = useState('')
  const [newInit, setNewInit] = useState('')

  const creatures = ev?.creatures ?? []
  const sorted = [...creatures].sort(
    (a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity),
  )

  // Beim Oeffnen den ersten Zug setzen.
  useEffect(() => {
    if (fightEventId) {
      setRound(1)
      setCurrentId(null)
      setExpanded(new Set())
    }
  }, [fightEventId])

  if (!entity || !ev) return null

  const idx = sorted.findIndex((c) => c.id === currentId)

  function nextTurn() {
    if (sorted.length === 0) return
    if (idx < 0) {
      setCurrentId(sorted[0].id)
      return
    }
    if (idx >= sorted.length - 1) {
      setRound((r) => r + 1)
      setCurrentId(sorted[0].id)
    } else {
      setCurrentId(sorted[idx + 1].id)
    }
  }

  function prevTurn() {
    if (sorted.length === 0) return
    if (idx <= 0) {
      setRound((r) => Math.max(1, r - 1))
      setCurrentId(sorted[sorted.length - 1].id)
    } else {
      setCurrentId(sorted[idx - 1].id)
    }
  }

  function rollAll() {
    for (const cr of creatures) {
      updateCreature(entity!.id, cr.id, { initiative: rollDie(20) })
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addRow() {
    const name = newName.trim()
    if (!name) return
    addCreature(entity!.id, { name, initiative: newInit === '' ? null : Number(newInit) })
    setNewName('')
    setNewInit('')
  }

  return (
    <div className="fight">
      <div className="fight__header">
        <div className="fight__title">
          <span className="fight__badge">⚔ Kampf</span>
          <span className="fight__event">{entity.name}</span>
        </div>
        <div className="fight__round">
          <button className="btn btn--sm" onClick={prevTurn} disabled={sorted.length === 0} title="Vorheriger Zug">
            &larr;
          </button>
          <span className="fight__round-label">
            Runde <strong>{round}</strong>
          </span>
          <button className="btn btn--sm btn--primary" onClick={nextTurn} disabled={sorted.length === 0} title="Naechster Zug">
            Zug &rarr;
          </button>
        </div>
        <button className="fight__close" onClick={() => setFightEvent(null)} title="Kampf verlassen">
          &times;
        </button>
      </div>

      <div className="fight__body">
        <div className="fight__map">
          {ev.battleMapUrl ? (
            <AssetImg refUrl={ev.battleMapUrl} alt="Kampfkarte" />
          ) : (
            <div className="fight__map-empty">Keine Kampfkarte hinterlegt.</div>
          )}
        </div>

        <div className="fight__panel">
          <div className="fight__panel-head">
            <span>Initiative</span>
            <button className="chipbtn" onClick={rollAll} disabled={creatures.length === 0} title="Alle Initiativen neu wuerfeln">
              🎲 Alle wuerfeln
            </button>
          </div>

          <div className="fight__list">
            {sorted.length === 0 && <p className="fight__empty">Keine Kreaturen. Unten hinzufuegen.</p>}
            {sorted.map((cr) => (
              <FightRow
                key={cr.id}
                creature={cr}
                current={cr.id === currentId}
                expanded={expanded.has(cr.id)}
                onToggle={() => toggle(cr.id)}
                onChange={(patch) => updateCreature(entity.id, cr.id, patch)}
                onRoll={() => updateCreature(entity.id, cr.id, { initiative: rollDie(20) })}
                onRemove={() => removeCreature(entity.id, cr.id)}
              />
            ))}
          </div>

          <div className="fight__add">
            <input
              className="field__control field__control--sm"
              placeholder="Name (z.B. Spieler)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addRow()}
            />
            <input
              className="field__control field__control--sm fight__add-init"
              placeholder="Ini"
              type="number"
              value={newInit}
              onChange={(e) => setNewInit(e.target.value)}
            />
            <button className="btn btn--sm btn--primary" onClick={addRow}>
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FightRow({
  creature,
  current,
  expanded,
  onToggle,
  onChange,
  onRoll,
  onRemove,
}: {
  creature: Creature
  current: boolean
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<Omit<Creature, 'id'>>) => void
  onRoll: () => void
  onRemove: () => void
}) {
  const dead = creature.hp <= 0
  const portrait = useAsset(creature.imageUrl)
  return (
    <div className={`frow${current ? ' is-current' : ''}${dead ? ' is-dead' : ''}${creature.isPC ? ' is-pc' : ''}`}>
      <div className="frow__main">
        <div className="frow__init">
          <input
            className="frow__init-input"
            type="number"
            value={creature.initiative ?? ''}
            placeholder="–"
            onChange={(e) => onChange({ initiative: e.target.value === '' ? null : Number(e.target.value) })}
            title="Initiative"
          />
          <button className="frow__roll" onClick={onRoll} title="Initiative wuerfeln">
            🎲
          </button>
        </div>

        {portrait ? (
          <img className="frow__portrait" src={portrait} alt={creature.name} />
        ) : (
          <div className="frow__portrait frow__portrait--empty">{creature.isPC ? '🧝' : '👹'}</div>
        )}

        <div className="frow__id">
          <button className="frow__name" onClick={onToggle} title="Faehigkeiten anzeigen">
            {creature.name} {creature.abilities && <span className="frow__chev">{expanded ? '▾' : '▸'}</span>}
          </button>
          <div className="frow__meta">RK {creature.ac}{creature.speed ? ` · ${creature.speed}` : ''}</div>
        </div>

        <div className="frow__hp">
          <button className="frow__hpb" onClick={() => onChange({ hp: creature.hp - 1 })}>&minus;</button>
          <input
            className="frow__hp-input"
            type="number"
            value={creature.hp}
            onChange={(e) => onChange({ hp: Number(e.target.value) || 0 })}
          />
          <span className="frow__hp-max">/{creature.maxHp}</span>
          <button className="frow__hpb" onClick={() => onChange({ hp: Math.min(creature.maxHp, creature.hp + 1) })}>+</button>
        </div>

        <button className="frow__remove" onClick={onRemove} title="Entfernen">
          &times;
        </button>
      </div>

      {expanded && creature.abilities && <div className="frow__abilities">{creature.abilities}</div>}
    </div>
  )
}
