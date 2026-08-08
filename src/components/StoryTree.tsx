import { entityDisplayMeta } from '../types'
import type { Entity } from '../types'
import { useStore } from '../store/useStore'
import { useActiveCampaign } from '../store/useActive'

/** Handlungsbaum: Entscheidungen nach Verkettungstiefe in Spalten. */
export function StoryTree() {
  const campaign = useActiveCampaign()
  const tableMode = useStore((s) => s.tableMode)
  const selectEntity = useStore((s) => s.selectEntity)

  const decisions = campaign.entities.filter(
    (e) => e.type === 'entscheidung' && e.decision && (!tableMode || e.visibility === 'spieler'),
  )
  const byId = new Map(decisions.map((e) => [e.id, e]))

  // Von welchen Punkten wird ein Punkt referenziert -> Wurzeln bestimmen.
  const referenced = new Set<string>()
  for (const e of decisions) {
    for (const o of e.decision!.options) {
      if (o.nextDecisionId && byId.has(o.nextDecisionId)) referenced.add(o.nextDecisionId)
    }
  }
  const roots = decisions.filter((e) => !referenced.has(e.id))

  // Tiefe per BFS (mit Zyklenschutz).
  const depth = new Map<string, number>()
  const seen = new Set<string>()
  let frontier = (roots.length > 0 ? roots : decisions).map((e) => e.id)
  let level = 0
  while (frontier.length > 0) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)
      depth.set(id, level)
      const e = byId.get(id)
      if (!e) continue
      for (const o of e.decision!.options) {
        if (o.nextDecisionId && byId.has(o.nextDecisionId) && !seen.has(o.nextDecisionId)) {
          next.push(o.nextDecisionId)
        }
      }
    }
    frontier = next
    level++
  }
  // Uebrige (getrennt/rein zyklisch) auf Ebene 0.
  for (const e of decisions) if (!depth.has(e.id)) depth.set(e.id, 0)

  const maxDepth = Math.max(0, ...[...depth.values()])
  const columns: Entity[][] = Array.from({ length: maxDepth + 1 }, () => [])
  for (const e of decisions) columns[depth.get(e.id)!].push(e)

  return (
    <div className="storytree">
      <div className="storytree__header">
        <h2 className="storytree__title">Handlungsbaum</h2>
        <span className="storytree__meta">{decisions.length} Entscheidungen</span>
      </div>

      {decisions.length === 0 ? (
        <p className="storytree__empty">
          Noch keine Entscheidungen. Lege ein Objekt vom Typ &bdquo;Entscheidung&ldquo; an
          und definiere Optionen, die zu weiteren Punkten fuehren.
        </p>
      ) : (
        <div className="storytree__board">
          {columns.map((col, ci) => (
            <div key={ci} className="storytree__col">
              <div className="storytree__collabel">Ebene {ci + 1}</div>
              {col.map((e) => (
                <DecisionNode
                  key={e.id}
                  entity={e}
                  nextName={(id: string) => byId.get(id)?.name ?? null}
                  onOpen={selectEntity}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DecisionNode({
  entity,
  nextName,
  onOpen,
}: {
  entity: Entity
  nextName: (id: string) => string | null
  onOpen: (id: string) => void
}) {
  const d = entity.decision!
  // Einheitlich wie ueberall sonst: beruecksichtigt die Gesinnung eines Charakters.
  const meta = entityDisplayMeta(entity)
  return (
    <div className="dnode" style={{ ['--chip-color' as string]: meta.color }}>
      <button className="dnode__title" onClick={() => onOpen(entity.id)}>
        {meta.icon} {entity.name}
      </button>
      <div className="dnode__options">
        {d.options.length === 0 && <div className="dnode__empty">keine Optionen</div>}
        {d.options.map((o) => {
          const chosen = d.chosenOptionId === o.id
          const dimmed = d.chosenOptionId != null && !chosen
          const nn = o.nextDecisionId ? nextName(o.nextDecisionId) : null
          return (
            <div key={o.id} className={`dnode__opt${chosen ? ' is-chosen' : ''}${dimmed ? ' is-dimmed' : ''}`}>
              <span className="dnode__opt-label">
                {chosen && '✓ '}
                {o.label}
              </span>
              {nn && (
                <button className="dnode__next" onClick={() => onOpen(o.nextDecisionId!)}>
                  &rarr; {nn}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
