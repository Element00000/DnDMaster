import { entityDisplayMeta } from '../types'
import type { Entity } from '../types'
import { useAsset } from '../useAsset'

/**
 * Sinnbild eines Objekts in Listen: sein Portraet, sofern eines hinterlegt ist, sonst das
 * Typ-Icon. Greift immer auf die Miniatur zurueck (siehe THUMB_SIZE) - aeltere Objekte
 * ohne Miniatur zeigen ersatzweise das volle Portraet.
 */
export function EntityIcon({ entity, className }: { entity: Entity; className?: string }) {
  const meta = entityDisplayMeta(entity)
  const image = useAsset(entity.thumbUrl ?? entity.imageUrl)
  const base = className ?? 'entity-icon'

  if (image) {
    return <img className={`${base} ${base}--image`} src={image} alt="" draggable={false} />
  }
  return <span className={`${base}${meta.iconInvert ? ' is-icon-invert' : ''}`}>{meta.icon}</span>
}
