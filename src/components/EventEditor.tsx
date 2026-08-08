import { useRef } from 'react'
import { EVENT_KINDS } from '../types'
import type { Creature, Entity, EventBlock, EventKind } from '../types'
import { useStore } from '../store/useStore'
import { uid } from '../utils/id'
import {
  BATTLE_MAP_IMAGE,
  CONTENT_IMAGE,
  CREATURE_IMAGE,
  deleteAsset,
  replaceImageAsset,
} from '../utils/assets'
import { AssetImg } from './AssetImg'

/** Editor fuer ein reiches Ereignis: Art, Inhaltsbloecke, Kampfkarte, Kreaturen. */
export function EventEditor({ entity, readOnly }: { entity: Entity; readOnly: boolean }) {
  const updateEvent = useStore((s) => s.updateEvent)
  const addBlock = useStore((s) => s.addBlock)
  const updateBlock = useStore((s) => s.updateBlock)
  const removeBlock = useStore((s) => s.removeBlock)
  const setBattleMap = useStore((s) => s.setBattleMap)
  const addCreature = useStore((s) => s.addCreature)
  const updateCreature = useStore((s) => s.updateCreature)
  const removeCreature = useStore((s) => s.removeCreature)
  const duplicateCreature = useStore((s) => s.duplicateCreature)
  const setFightEvent = useStore((s) => s.setFightEvent)

  const ev = entity.event
  if (!ev) return null

  const canFight = ev.battleMapUrl != null || ev.creatures.length > 0

  if (readOnly) {
    // Spieler-/Tischsicht: nur die erzaehlerischen Bloecke, keine DM-Mechanik.
    return (
      <div className="event">
        {ev.blocks.length === 0 ? (
          <p className="event__empty">Keine Inhalte.</p>
        ) : (
          <div className="event__blocks">
            {ev.blocks.map((b) => (
              <BlockView key={b.id} block={b} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="event">
      <label className="field">
        <span className="field__label">Art des Ereignisses</span>
        <select
          className="field__control"
          value={ev.kind}
          onChange={(e) => updateEvent(entity.id, { kind: e.target.value as EventKind })}
        >
          {EVENT_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.icon} {k.label}
            </option>
          ))}
        </select>
      </label>

      {/* Inhaltsbloecke */}
      <div className="event__section">
        <div className="event__section-head">
          <span className="field__label">Inhalte</span>
          <div className="event__addrow">
            <button className="chipbtn" onClick={() => addBlock(entity.id, { id: uid('b-'), kind: 'text', title: '', body: '' })}>
              + Text
            </button>
            <button className="chipbtn" onClick={() => addBlock(entity.id, { id: uid('b-'), kind: 'loot', title: 'Loot', body: '' })}>
              + Loot
            </button>
            <button className="chipbtn" onClick={() => addBlock(entity.id, { id: uid('b-'), kind: 'image', title: '', url: '' })}>
              + Bild
            </button>
          </div>
        </div>
        {ev.blocks.map((b) => (
          <BlockEditor
            key={b.id}
            block={b}
            onChange={(nb) => updateBlock(entity.id, nb)}
            onRemove={() => removeBlock(entity.id, b.id)}
          />
        ))}
      </div>

      {/* Kampfkarte */}
      <BattleMapField
        url={ev.battleMapUrl}
        onSet={(url) => setBattleMap(entity.id, url)}
      />

      {/* Kreaturen */}
      <div className="event__section">
        <div className="event__section-head">
          <span className="field__label">Kreaturen / Gegner ({ev.creatures.length})</span>
          <button className="chipbtn" onClick={() => addCreature(entity.id)}>
            + Kreatur
          </button>
        </div>
        {ev.creatures.map((cr) => (
          <CreatureEditor
            key={cr.id}
            creature={cr}
            onChange={(patch) => updateCreature(entity.id, cr.id, patch)}
            onRemove={() => removeCreature(entity.id, cr.id)}
            onDuplicate={() => duplicateCreature(entity.id, cr.id)}
          />
        ))}
      </div>

      <button
        className="btn btn--primary btn--full"
        disabled={!canFight}
        onClick={() => setFightEvent(entity.id)}
        title={canFight ? 'Kampf-Modus oeffnen' : 'Erst Kampfkarte oder Kreaturen hinzufuegen'}
      >
        ⚔ Kampf starten
      </button>
    </div>
  )
}

function BlockView({ block }: { block: EventBlock }) {
  if (block.kind === 'image') {
    return (
      <div className="eblock eblock--view">
        {block.title && <div className="eblock__title">{block.title}</div>}
        <AssetImg refUrl={block.url} className="eblock__img" alt={block.title || 'Bild'} />
      </div>
    )
  }
  return (
    <div className="eblock eblock--view">
      <div className="eblock__title">
        {block.kind === 'loot' ? '💰 ' : ''}
        {block.title || (block.kind === 'loot' ? 'Loot' : 'Text')}
      </div>
      <div className="eblock__body">{block.body}</div>
    </div>
  )
}

function BlockEditor({
  block,
  onChange,
  onRemove,
}: {
  block: EventBlock
  onChange: (b: EventBlock) => void
  onRemove: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || block.kind !== 'image') return
    const { ref } = await replaceImageAsset(file, block.url, CONTENT_IMAGE)
    onChange({ ...block, url: ref })
  }

  return (
    <div className="eblock">
      <div className="eblock__head">
        <span className="eblock__kind">
          {block.kind === 'text' ? '📝' : block.kind === 'loot' ? '💰' : '🖼'}
        </span>
        <input
          className="field__control field__control--sm"
          value={block.title}
          placeholder={block.kind === 'loot' ? 'Titel (z.B. Truhe)' : 'Titel (optional)'}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
        />
        <button className="eblock__remove" title="Block entfernen" onClick={onRemove}>
          &times;
        </button>
      </div>

      {block.kind === 'image' ? (
        <div className="eblock__imgedit">
          <AssetImg refUrl={block.url} className="eblock__img" alt={block.title || 'Bild'} />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          <button className="chipbtn" onClick={() => fileRef.current?.click()}>
            {block.url ? 'Bild ersetzen' : 'Bild hochladen'}
          </button>
        </div>
      ) : (
        <textarea
          className="field__control field__textarea field__control--sm"
          rows={3}
          value={block.body}
          placeholder={block.kind === 'loot' ? 'Was ist zu holen?' : 'Text ...'}
          onChange={(e) => onChange({ ...block, body: e.target.value })}
        />
      )}
    </div>
  )
}

function BattleMapField({ url, onSet }: { url: string | null; onSet: (url: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const { ref } = await replaceImageAsset(file, url, BATTLE_MAP_IMAGE)
    onSet(ref)
  }

  return (
    <div className="event__section">
      <div className="event__section-head">
        <span className="field__label">Kampfkarte</span>
        <div className="event__addrow">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          <button className="chipbtn" onClick={() => fileRef.current?.click()}>
            {url ? 'Ersetzen' : 'Hochladen'}
          </button>
          {url && (
            <button
              className="chipbtn chipbtn--danger"
              onClick={() => {
                onSet(null)
                void deleteAsset(url)
              }}
            >
              Entfernen
            </button>
          )}
        </div>
      </div>
      <AssetImg refUrl={url} className="event__battlemap" alt="Kampfkarte" />
    </div>
  )
}

function CreatureEditor({
  creature,
  onChange,
  onRemove,
  onDuplicate,
}: {
  creature: Creature
  onChange: (patch: Partial<Omit<Creature, 'id'>>) => void
  onRemove: () => void
  onDuplicate: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const { ref } = await replaceImageAsset(file, creature.imageUrl, CREATURE_IMAGE)
    onChange({ imageUrl: ref })
  }

  return (
    <div className={`creature${creature.isPC ? ' creature--pc' : ''}`}>
      <div className="creature__head">
        <button
          className="creature__portrait"
          onClick={() => fileRef.current?.click()}
          title="Bild hochladen"
        >
          {creature.imageUrl ? <AssetImg refUrl={creature.imageUrl} alt={creature.name} /> : <span>＋</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        <input
          className="field__control field__control--sm creature__name"
          value={creature.name}
          placeholder="Name"
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <button className="creature__icon-btn" title="Duplizieren" onClick={onDuplicate}>
          ⧉
        </button>
        <button className="creature__icon-btn creature__icon-btn--danger" title="Entfernen" onClick={onRemove}>
          &times;
        </button>
      </div>

      <div className="creature__stats">
        <label>
          <span>TP</span>
          <input
            className="field__control field__control--sm"
            type="number"
            value={creature.maxHp}
            onChange={(e) => {
              const maxHp = Number(e.target.value) || 0
              onChange({ maxHp, hp: maxHp })
            }}
          />
        </label>
        <label>
          <span>RK</span>
          <input
            className="field__control field__control--sm"
            type="number"
            value={creature.ac}
            onChange={(e) => onChange({ ac: Number(e.target.value) || 0 })}
          />
        </label>
        <label>
          <span>Bew.</span>
          <input
            className="field__control field__control--sm"
            value={creature.speed}
            placeholder="9m"
            onChange={(e) => onChange({ speed: e.target.value })}
          />
        </label>
        <label className="creature__pc">
          <input type="checkbox" checked={creature.isPC} onChange={(e) => onChange({ isPC: e.target.checked })} />
          <span>SC</span>
        </label>
      </div>

      <textarea
        className="field__control field__textarea field__control--sm"
        rows={2}
        value={creature.abilities}
        placeholder="Faehigkeiten / Angriffe / Notizen"
        onChange={(e) => onChange({ abilities: e.target.value })}
      />
    </div>
  )
}
