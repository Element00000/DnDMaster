import {
  EFFECT_KINDS,
  FIELD_SCHEMA,
  RELATIONS,
  entityMeta,
} from '../types'
import type { DecisionOption, Effect, Entity, RelationType } from '../types'
import { useStore } from '../store/useStore'
import { uid } from '../utils/id'

/** Editor fuer einen Entscheidungspunkt: Optionen, Folgen, Wahl, Verkettung. */
export function DecisionEditor({ entity, readOnly }: { entity: Entity; readOnly: boolean }) {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const updateDecision = useStore((s) => s.updateDecision)
  const addOption = useStore((s) => s.addOption)
  const removeOption = useStore((s) => s.removeOption)
  const updateOption = useStore((s) => s.updateOption)
  const addEffect = useStore((s) => s.addEffect)
  const updateEffect = useStore((s) => s.updateEffect)
  const removeEffect = useStore((s) => s.removeEffect)
  const chooseOption = useStore((s) => s.chooseOption)
  const clearChoice = useStore((s) => s.clearChoice)
  const selectEntity = useStore((s) => s.selectEntity)

  const d = entity.decision
  if (!d) return null

  const others = campaign.entities.filter((e) => e.id !== entity.id)
  const situations = others.filter((e) => e.type === 'ereignis' || e.type === 'quest')
  const decisions = others.filter((e) => e.type === 'entscheidung')

  return (
    <div className="decision">
      {!readOnly && (
        <label className="field">
          <span className="field__label">Situation (Ereignis/Quest)</span>
          <select
            className="field__control"
            value={d.situationId ?? ''}
            onChange={(e) => updateDecision(entity.id, { situationId: e.target.value || null })}
          >
            <option value="">&ndash;</option>
            {situations.map((s) => (
              <option key={s.id} value={s.id}>
                {entityMeta(s.type).icon} {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="decision__optionshead">
        <span className="field__label">Optionen ({d.options.length})</span>
        {d.chosenOptionId && !readOnly && (
          <button className="decision__clear" onClick={() => clearChoice(entity.id)}>
            Wahl aufheben
          </button>
        )}
      </div>

      {d.options.length === 0 && (
        <p className="decision__empty">Noch keine Optionen. Lege 3&ndash;5 moegliche Wege an.</p>
      )}

      <div className="decision__options">
        {d.options.map((opt, i) => (
          <OptionCard
            key={opt.id}
            index={i}
            option={opt}
            chosen={d.chosenOptionId === opt.id}
            decided={d.chosenOptionId != null}
            readOnly={readOnly}
            others={others}
            decisions={decisions}
            onChoose={() => chooseOption(entity.id, opt.id)}
            onUpdate={(patch) => updateOption(entity.id, opt.id, patch)}
            onRemove={() => removeOption(entity.id, opt.id)}
            onAddEffect={(eff) => addEffect(entity.id, opt.id, eff)}
            onUpdateEffect={(eff) => updateEffect(entity.id, opt.id, eff)}
            onRemoveEffect={(effId) => removeEffect(entity.id, opt.id, effId)}
            onNavigate={selectEntity}
          />
        ))}
      </div>

      {!readOnly && d.options.length < 5 && (
        <button className="btn btn--ghost btn--full" onClick={() => addOption(entity.id)}>
          + Option hinzufuegen
        </button>
      )}
    </div>
  )
}

function OptionCard({
  index,
  option,
  chosen,
  decided,
  readOnly,
  others,
  decisions,
  onChoose,
  onUpdate,
  onRemove,
  onAddEffect,
  onUpdateEffect,
  onRemoveEffect,
  onNavigate,
}: {
  index: number
  option: DecisionOption
  chosen: boolean
  decided: boolean
  readOnly: boolean
  others: Entity[]
  decisions: Entity[]
  onChoose: () => void
  onUpdate: (patch: Partial<Pick<DecisionOption, 'label' | 'description' | 'nextDecisionId'>>) => void
  onRemove: () => void
  onAddEffect: (eff: Effect) => void
  onUpdateEffect: (eff: Effect) => void
  onRemoveEffect: (effId: string) => void
  onNavigate: (id: string) => void
}) {
  // Nicht gewaehlte Optionen nach der Wahl grau hinterlegen (als Notiz erhalten).
  const dimmed = decided && !chosen
  const nextDecision = decisions.find((e) => e.id === option.nextDecisionId)

  return (
    <div className={`option${chosen ? ' option--chosen' : ''}${dimmed ? ' option--dimmed' : ''}`}>
      <div className="option__head">
        <span className="option__num">{index + 1}</span>
        {readOnly ? (
          <span className="option__label-ro">{option.label}</span>
        ) : (
          <input
            className="option__label"
            value={option.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="Kurztitel der Option"
          />
        )}
        {!readOnly && (
          <button className="option__remove" title="Option loeschen" onClick={onRemove}>
            &times;
          </button>
        )}
      </div>

      {readOnly ? (
        option.description && <p className="option__desc-ro">{option.description}</p>
      ) : (
        <textarea
          className="field__control field__textarea option__desc"
          value={option.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Was passiert bei dieser Option?"
          rows={2}
        />
      )}

      {/* Folgen */}
      {!readOnly && (
        <div className="effects">
          <div className="effects__head">Folgen</div>
          {option.effects.map((eff) => (
            <EffectRow
              key={eff.id}
              effect={eff}
              others={others}
              onChange={onUpdateEffect}
              onRemove={() => onRemoveEffect(eff.id)}
            />
          ))}
          <button
            className="effects__add"
            onClick={() => onAddEffect({ id: uid('eff-'), kind: 'note', text: '' })}
          >
            + Folge
          </button>
        </div>
      )}

      {/* Verkettung */}
      {!readOnly && (
        <label className="option__next">
          <span>Fuehrt zu</span>
          <select
            className="field__control field__control--sm"
            value={option.nextDecisionId ?? ''}
            onChange={(e) => onUpdate({ nextDecisionId: e.target.value || null })}
          >
            <option value="">&ndash; kein weiterer Punkt &ndash;</option>
            {decisions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {readOnly && nextDecision && (
        <button className="option__next-ro" onClick={() => onNavigate(nextDecision.id)}>
          fuehrt zu: {nextDecision.name} &rarr;
        </button>
      )}

      {!readOnly && (
        <button className={`btn btn--sm option__choose${chosen ? ' is-chosen' : ''}`} onClick={onChoose}>
          {chosen ? '✓ Eingetreten (erneut = zuruecknehmen)' : 'Als eingetreten markieren'}
        </button>
      )}
      {readOnly && chosen && <div className="option__chosen-badge">Eingetreten</div>}
    </div>
  )
}

function EffectRow({
  effect,
  others,
  onChange,
  onRemove,
}: {
  effect: Effect
  others: Entity[]
  onChange: (eff: Effect) => void
  onRemove: () => void
}) {
  const target = effect.kind !== 'note' && effect.kind !== 'relation'
    ? others.find((e) => e.id === effect.targetId)
    : undefined

  function changeKind(kind: Effect['kind']) {
    onChange(defaultEffect(kind, effect.id, others))
  }

  return (
    <div className="effect">
      <div className="effect__top">
        <select
          className="field__control field__control--sm"
          value={effect.kind}
          onChange={(e) => changeKind(e.target.value as Effect['kind'])}
        >
          {EFFECT_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <button className="effect__remove" title="Folge entfernen" onClick={onRemove}>
          &times;
        </button>
      </div>

      {effect.kind === 'note' && (
        <input
          className="field__control field__control--sm"
          value={effect.text}
          placeholder="Freitext-Folge (nicht automatisch)"
          onChange={(e) => onChange({ ...effect, text: e.target.value })}
        />
      )}

      {effect.kind === 'set_field' && (
        <div className="effect__grid">
          <select
            className="field__control field__control--sm"
            value={effect.targetId}
            onChange={(e) => onChange({ ...effect, targetId: e.target.value, key: '', value: '' })}
          >
            <option value="">Objekt ...</option>
            {others.map((e) => (
              <option key={e.id} value={e.id}>
                {entityMeta(e.type).icon} {e.name}
              </option>
            ))}
          </select>
          {target && FIELD_SCHEMA[target.type].length > 0 ? (
            <>
              <select
                className="field__control field__control--sm"
                value={effect.key}
                onChange={(e) => onChange({ ...effect, key: e.target.value, value: '' })}
              >
                <option value="">Feld ...</option>
                {FIELD_SCHEMA[target.type].map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
              <FieldValueControl target={target} fieldKey={effect.key} value={effect.value} onChange={(v) => onChange({ ...effect, value: v })} />
            </>
          ) : (
            target && <span className="effect__hint">Dieser Typ hat keine Felder.</span>
          )}
        </div>
      )}

      {effect.kind === 'reveal' && (
        <div className="effect__grid">
          <select
            className="field__control field__control--sm"
            value={effect.targetId}
            onChange={(e) => onChange({ ...effect, targetId: e.target.value })}
          >
            <option value="">Objekt ...</option>
            {others.map((e) => (
              <option key={e.id} value={e.id}>
                {entityMeta(e.type).icon} {e.name}
              </option>
            ))}
          </select>
          <select
            className="field__control field__control--sm"
            value={effect.value}
            onChange={(e) => onChange({ ...effect, value: e.target.value as 'dm' | 'spieler' })}
          >
            <option value="spieler">aufdecken (Spieler)</option>
            <option value="dm">verbergen (DM)</option>
          </select>
        </div>
      )}

      {effect.kind === 'relation' && (
        <div className="effect__grid effect__grid--rel">
          <select
            className="field__control field__control--sm"
            value={effect.fromId}
            onChange={(e) => onChange({ ...effect, fromId: e.target.value })}
          >
            <option value="">Von ...</option>
            {others.map((e) => (
              <option key={e.id} value={e.id}>
                {entityMeta(e.type).icon} {e.name}
              </option>
            ))}
          </select>
          <select
            className="field__control field__control--sm"
            value={effect.relation}
            onChange={(e) => onChange({ ...effect, relation: e.target.value as RelationType })}
          >
            {RELATIONS.map((r) => (
              <option key={r.relation} value={r.relation}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            className="field__control field__control--sm"
            value={effect.toId}
            onChange={(e) => onChange({ ...effect, toId: e.target.value })}
          >
            <option value="">Zu ...</option>
            {others.map((e) => (
              <option key={e.id} value={e.id}>
                {entityMeta(e.type).icon} {e.name}
              </option>
            ))}
          </select>
          <select
            className="field__control field__control--sm"
            value={effect.op}
            onChange={(e) => onChange({ ...effect, op: e.target.value as 'add' | 'remove' })}
          >
            <option value="add">hinzufuegen</option>
            <option value="remove">entfernen</option>
          </select>
        </div>
      )}
    </div>
  )
}

function FieldValueControl({
  target,
  fieldKey,
  value,
  onChange,
}: {
  target: Entity
  fieldKey: string
  value: string
  onChange: (v: string) => void
}) {
  const def = FIELD_SCHEMA[target.type].find((f) => f.key === fieldKey)
  if (!def) return null
  if (def.kind === 'select') {
    return (
      <select className="field__control field__control--sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Wert ...</option>
        {def.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  return (
    <input
      className="field__control field__control--sm"
      value={value}
      placeholder="Neuer Wert"
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function defaultEffect(kind: Effect['kind'], id: string, others: Entity[]): Effect {
  const firstId = others[0]?.id ?? ''
  switch (kind) {
    case 'set_field':
      return { id, kind: 'set_field', targetId: '', key: '', value: '' }
    case 'reveal':
      return { id, kind: 'reveal', targetId: '', value: 'spieler' }
    case 'relation':
      return { id, kind: 'relation', op: 'add', fromId: firstId, toId: '', relation: 'verbuendet' }
    case 'note':
    default:
      return { id, kind: 'note', text: '' }
  }
}
