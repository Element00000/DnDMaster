// Bild eines Objekts setzen und aufraeumen. Ein Objektbild besteht immer aus zwei Assets:
// dem Portraet in Anzeigegroesse und einem winzigen Miniaturbild fuer Kartenpinnadeln und
// Listen. Beide entstehen und verschwinden gemeinsam - deshalb hier gebuendelt, statt an
// jeder Aufrufstelle einzeln.

import type { Entity } from '../types'
import { deleteAsset, putAsset } from './assets'
import { dataUrlToThumb } from './image'

export interface EntityImage {
  imageUrl: string
  thumbUrl: string
}

/**
 * Legt Portraet und Miniaturbild als Assets ab und liefert beide Referenzen.
 * Schlaegt die Miniatur fehl (z.B. exotisches Format), wird auf das Portraet
 * zurueckgefallen, damit ueberhaupt ein Bild erscheint.
 */
export async function storeEntityImage(dataUrl: string): Promise<EntityImage> {
  const imageUrl = await putAsset(dataUrl)
  try {
    const thumbUrl = await putAsset(await dataUrlToThumb(dataUrl))
    return { imageUrl, thumbUrl }
  } catch {
    return { imageUrl, thumbUrl: imageUrl }
  }
}

/** Beide Assets eines abgeloesten Objektbildes verwerfen. */
export function discardEntityImage(entity: Pick<Entity, 'imageUrl' | 'thumbUrl'>): void {
  void deleteAsset(entity.imageUrl)
  // Beim Rueckfall oben zeigen beide auf dasselbe Asset - dann nicht doppelt loeschen.
  if (entity.thumbUrl && entity.thumbUrl !== entity.imageUrl) void deleteAsset(entity.thumbUrl)
}
