import { useState } from 'react'
import { RELATIONS, entityDisplayMeta, entityMeta, relationMeta } from '../types'
import type { Entity, Placement, RelationType } from '../types'
import { useStore } from '../store/useStore'
import { EntityIcon } from './EntityIcon'

/**
 * Beziehungen eines Objekts: seine Fraktion und alle Verknuepfungen. Sitzt im Reiter
 * "Beziehungen" der unteren Leiste, nicht mehr im Detailpanel - dort waere fuer beides
 * kaum Platz, und beides gehoert sachlich zum Beziehungsgeflecht der Kampagne.
 */
export function EntityRelations({ entity }: { entity: Entity }) {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const tableMode = useStore((s) => s.tableMode)
  const addEntity = useStore((s) => s.addEntity)
  const addLink = useStore((s) => s.addLink)
  const removeLink = useStore((s) => s.removeLink)
  const selectEntity = useStore((s) => s.selectEntity)
  const goToLayer = useStore((s) => s.goToLayer)

  const readOnly = tableMode
  const meta = entityDisplayMeta(entity)
  const others = campaign.entities.filter((e) => e.id !== entity.id)
  // Eingehende Verknuepfungen (andere Objekte, die auf dieses zeigen).
  const incoming = others.flatMap((e) =>
    e.links.filter((l) => l.targetId === entity.id).map((l) => ({ from: e, relation: l.relation })),
  )

  /** Zu einem verknuepften Objekt springen: Karte nachziehen und es auswaehlen. */
  function navigate(id: string) {
    const target = campaign.entities.find((e) => e.id === id)
    if (target?.placement) goToLayer(target.placement.layerId)
    selectEntity(id)
  }

  return (
    <div className="relations">
      <div className="relations__subject" style={{ ['--chip-color' as string]: meta.color }}>
        <EntityIcon entity={entity} className="relations__subject-icon" />
        <span className="relations__subject-name">{entity.name}</span>
        <span className="relations__subject-type">{entityMeta(entity.type).label}</span>
      </div>

      {entity.type === 'nsc' && (
        <FactionField
          entity={entity}
          readOnly={readOnly}
          factions={campaign.entities.filter((e) => e.type === 'fraktion')}
          onAdd={(name) => {
            const id = addEntity({ type: 'fraktion', name, placement: newFactionSpot(entity, campaign) })
            addLink(entity.id, id, 'gehoert_zu')
            return id
          }}
          onLink={(targetId) => addLink(entity.id, targetId, 'gehoert_zu')}
          onUnlink={(targetId) => removeLink(entity.id, targetId, 'gehoert_zu')}
        />
      )}

      <div className="field">
        <span className="field__label">Verknuepfungen</span>
        <LinksEditor
          entity={entity}
          others={others}
          incoming={incoming}
          readOnly={readOnly}
          onAdd={addLink}
          onRemove={removeLink}
          onNavigate={navigate}
        />
      </div>
    </div>
  )
}

/** Startposition einer neu angelegten Fraktion: neben dem Charakter, sonst Kartenmitte. */
function newFactionSpot(entity: Entity, campaign: { layers: { id: string; width: number; height: number }[]; activeLayerId: string }): Placement {
  if (entity.placement) {
    return { ...entity.placement, x: entity.placement.x + 40, y: entity.placement.y + 40 }
  }
  const layer = campaign.layers.find((l) => l.id === campaign.activeLayerId) ?? campaign.layers[0]
  return { layerId: layer.id, x: layer.width / 2, y: layer.height / 2 }
}

/** Fraktion eines Charakters waehlen oder neu anlegen. */
function FactionField({
  entity,
  readOnly,
  factions,
  onAdd,
  onLink,
  onUnlink,
}: {
  entity: Entity
  readOnly: boolean
  factions: Entity[]
  onAdd: (name: string) => string
  onLink: (targetId: string) => void
  onUnlink: (targetId: string) => void
}) {
  const currentId =
    entity.links.find((l) => l.relation === 'gehoert_zu' && factions.some((f) => f.id === l.targetId))?.targetId ?? ''

  function onChange(value: string) {
    if (currentId) onUnlink(currentId)
    if (value === '__new__') {
      const name = prompt('Name der neuen Fraktion:')
      if (name && name.trim()) onAdd(name.trim())
    } else if (value) {
      onLink(value)
    }
  }

  return (
    <label className="field">
      <span className="field__label">Fraktion</span>
      <select
        className="field__control"
        value={currentId}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      >
        <option value="">&ndash; keine &ndash;</option>
        {factions.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
        <option value="__new__">+ Neue Fraktion ...</option>
      </select>
    </label>
  )
}

/** Liste aller aus- und eingehenden Verknuepfungen samt Eingabe fuer neue. */
function LinksEditor({
  entity,
  others,
  incoming,
  readOnly,
  onAdd,
  onRemove,
  onNavigate,
}: {
  entity: Entity
  others: Entity[]
  incoming: { from: Entity; relation: RelationType }[]
  readOnly: boolean
  onAdd: (fromId: string, targetId: string, relation: RelationType) => void
  onRemove: (fromId: string, targetId: string, relation: RelationType) => void
  onNavigate: (id: string) => void
}) {
  const [relation, setRelation] = useState<RelationType>('befindet_sich_in')
  const [targetId, setTargetId] = useState('')

  const byId = (id: string) => others.find((e) => e.id === id)

  return (
    <div className="links">
      {entity.links.length === 0 && incoming.length === 0 && (
        <p className="links__empty">Keine Verknuepfungen.</p>
      )}

      <ul className="links__list">
        {entity.links.map((l) => {
          const target = byId(l.targetId)
          if (!target) return null
          const tMeta = entityDisplayMeta(target)
          return (
            <li key={`${l.targetId}-${l.relation}`} className="links__item">
              <span className="links__rel">{relationMeta(l.relation).label}</span>
              <button
                className="links__target"
                onClick={() => onNavigate(target.id)}
                style={{ ['--chip-color' as string]: tMeta.color }}
              >
                <EntityIcon entity={target} className="links__target-icon" />
                {target.name}
              </button>
              {!readOnly && (
                <button
                  className="links__remove"
                  title="Verknuepfung entfernen"
                  onClick={() => onRemove(entity.id, l.targetId, l.relation)}
                >
                  &times;
                </button>
              )}
            </li>
          )
        })}

        {/* Eingehend, nur zur Anzeige */}
        {incoming.map(({ from, relation: rel }) => {
          const fMeta = entityDisplayMeta(from)
          return (
            <li key={`in-${from.id}-${rel}`} className="links__item links__item--incoming">
              <span className="links__rel">{relationMeta(rel).inverseLabel}</span>
              <button
                className="links__target"
                onClick={() => onNavigate(from.id)}
                style={{ ['--chip-color' as string]: fMeta.color }}
              >
                <EntityIcon entity={from} className="links__target-icon" />
                {from.name}
              </button>
            </li>
          )
        })}
      </ul>

      {!readOnly && others.length > 0 && (
        <div className="links__add">
          <select
            className="field__control field__control--sm"
            value={relation}
            onChange={(e) => setRelation(e.target.value as RelationType)}
          >
            {RELATIONS.map((r) => (
              <option key={r.relation} value={r.relation}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            className="field__control field__control--sm"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">Objekt waehlen ...</option>
            {others.map((e) => (
              <option key={e.id} value={e.id}>
                {entityMeta(e.type).icon} {e.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn--sm"
            disabled={!targetId}
            onClick={() => {
              if (targetId) {
                onAdd(entity.id, targetId, relation)
                setTargetId('')
              }
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}
