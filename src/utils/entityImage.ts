// Bild eines Objekts setzen und aufraeumen. Ein Objektbild besteht immer aus zwei Assets:
// dem Portraet in Anzeigegroesse und einem winzigen Miniaturbild fuer Kartenpinnadeln und
// Listen. Beide entstehen und verschwinden gemeinsam - deshalb hier gebuendelt, statt an
// jeder Aufrufstelle einzeln.

import type { Entity, ThumbCrop } from '../types'
import { deleteAsset, putAsset } from './assets'
import { dataUrlToThumb } from './image'

export interface EntityImage {
  imageUrl: string
  thumbUrl: string
  thumbCrop: ThumbCrop | null
}

/**
 * Legt Portraet und Miniaturbild als Assets ab und liefert beide Referenzen.
 * Schlaegt die Miniatur fehl (z.B. exotisches Format), wird auf das Portraet
 * zurueckgefallen, damit ueberhaupt ein Bild erscheint.
 */
export async function storeEntityImage(
  dataUrl: string,
  crop: ThumbCrop | null = null,
): Promise<EntityImage> {
  const imageUrl = await putAsset(dataUrl)
  try {
    const thumbUrl = await putAsset(await dataUrlToThumb(dataUrl, crop))
    return { imageUrl, thumbUrl, thumbCrop: crop }
  } catch {
    return { imageUrl, thumbUrl: imageUrl, thumbCrop: crop }
  }
}

/**
 * Nur die Miniatur eines bereits gesetzten Bildes neu zuschneiden - das Portraet selbst
 * bleibt unangetastet.
 */
export async function restoreEntityThumb(
  imageDataUrl: string,
  crop: ThumbCrop,
): Promise<{ thumbUrl: string; thumbCrop: ThumbCrop }> {
  return { thumbUrl: await putAsset(await dataUrlToThumb(imageDataUrl, crop)), thumbCrop: crop }
}

/** Beide Assets eines abgeloesten Objektbildes verwerfen. */
export function discardEntityImage(entity: Pick<Entity, 'imageUrl' | 'thumbUrl'>): void {
  void deleteAsset(entity.imageUrl)
  // Beim Rueckfall oben zeigen beide auf dasselbe Asset - dann nicht doppelt loeschen.
  if (entity.thumbUrl && entity.thumbUrl !== entity.imageUrl) void deleteAsset(entity.thumbUrl)
}
