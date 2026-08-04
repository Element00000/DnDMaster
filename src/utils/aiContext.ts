// Baut aus dem aktuellen Projektzustand einen kompakten Textkontext, den die KI
// bei jeder Generierung erhaelt ("immer der neueste Projektstand").

import type { Campaign, Entity } from '../types'
import { entityMeta, relationMeta } from '../types'

function clip(s: string, n = 240): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

/**
 * Bildbeschreibung fuer das Portraet eines Objekts. Wird sowohl vom Bildfeld im
 * Detailpanel als auch vom KI-Werkzeug genutzt, damit beide dasselbe Ergebnis liefern.
 */
export function portraitPrompt(entity: Entity): string {
  const meta = entityMeta(entity.type)
  const bits = [
    `Fantasy TTRPG character portrait, head and shoulders, of ${entity.name}`,
    entity.fields.rolle ? `role: ${entity.fields.rolle}` : '',
    entity.description ? entity.description : '',
    `type: ${meta.label}`,
    'detailed digital painting, dramatic lighting, high quality',
  ]
  return bits.filter(Boolean).join('. ')
}

function entityLine(e: Entity, campaign: Campaign): string {
  const meta = entityMeta(e.type)
  const fields = Object.entries(e.fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
  const links = e.links
    .map((l) => {
      const target = campaign.entities.find((x) => x.id === l.targetId)
      return target ? `${relationMeta(l.relation).label} ${target.name}` : ''
    })
    .filter(Boolean)
    .join('; ')
  const parts = [`- ${meta.label}: ${e.name}`]
  if (fields) parts.push(`(${fields})`)
  if (e.description) parts.push(`— ${clip(e.description, 160)}`)
  if (links) parts.push(`[${links}]`)
  return parts.join(' ')
}

/**
 * Kompakter Kontext der aktiven Kampagne. Bei einer Auswahl wird das gewaehlte
 * Objekt hervorgehoben. Geheimnisse werden bewusst mitgegeben (nur DM-Nutzung).
 */
export function buildCampaignContext(campaign: Campaign, selected: Entity | null): string {
  const lines: string[] = []
  lines.push(`KAMPAGNE: ${campaign.name}`)
  if (campaign.description) lines.push(`Beschreibung: ${clip(campaign.description, 300)}`)

  // Objekte nach Typ, auf sinnvolle Menge begrenzt.
  const others = campaign.entities.filter((e) => e.id !== selected?.id).slice(0, 60)
  if (others.length > 0) {
    lines.push('', 'BEKANNTE OBJEKTE:')
    for (const e of others) lines.push(entityLine(e, campaign))
  }

  if (selected) {
    lines.push('', 'AKTUELL AUSGEWAEHLT:')
    lines.push(entityLine(selected, campaign))
    if (selected.secret) lines.push(`Geheimnis (nur DM): ${clip(selected.secret, 200)}`)
  }

  return lines.join('\n')
}
