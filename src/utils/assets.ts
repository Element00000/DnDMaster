// Bild-Assets in IndexedDB, damit sie nicht das LocalStorage-Limit sprengen.
// Im State stehen nur Referenzen der Form "asset:<id>". Alte data:-URLs bleiben
// abwaertskompatibel (Passthrough).

import type { Campaign } from '../types'
import { fileToScaledDataUrl } from './image'

const DB_NAME = 'dnd-weltkarte'
const STORE = 'assets'

let dbPromise: Promise<IDBDatabase> | null = null
/** Kurzzeit-Cache, damit einmal geladene Bilder ohne DB-Zugriff verfuegbar sind. */
const cache = new Map<string, string>()

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export function isAssetRef(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('asset:')
}

/** Speichert eine data-URL in IndexedDB und liefert ihre Referenz. */
export async function putAsset(dataUrl: string): Promise<string> {
  const ref = `asset:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(dataUrl, ref)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  cache.set(ref, dataUrl)
  return ref
}

/** Loest eine Referenz (oder data-URL) zu einer anzeigbaren URL auf. */
export async function getAsset(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return null
  if (!isAssetRef(ref)) return ref // Passthrough: data: / http
  const cached = cache.get(ref)
  if (cached !== undefined) return cached
  const db = await openDb()
  const val = await new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(ref)
    req.onsuccess = () => resolve((req.result as string) ?? null)
    req.onerror = () => reject(req.error)
  })
  if (val != null) cache.set(ref, val)
  return val
}

/** Synchroner Cache-Zugriff: string = da, null = kein Bild, undefined = noch laden. */
export function getCachedAsset(ref: string | null | undefined): string | null | undefined {
  if (!ref) return null
  if (!isAssetRef(ref)) return ref
  return cache.get(ref)
}

/**
 * Wie stark ein Bild je nach Verwendung verkleinert wird. Eine Karte wird herangezoomt und
 * braucht Reserve, ein Kreaturen-Bildchen steht dauerhaft klein in der Liste.
 */
export const MAP_IMAGE = { maxDim: 2400, quality: 0.85 }
export const BATTLE_MAP_IMAGE = { maxDim: 1600 }
export const CONTENT_IMAGE = { maxDim: 900 }
export const CREATURE_IMAGE = { maxDim: 400 }

/**
 * Eine gewaehlte Bilddatei uebernehmen: verkleinern, als Asset ablegen und das bisherige
 * Bild wegraeumen. Genau diese Reihenfolge stand an sechs Stellen einzeln geschrieben -
 * wurde dabei das Aufraeumen vergessen, blieb das alte Bild fuer immer im Speicher liegen.
 *
 * Liefert die Bildmasse mit: Karten ziehen ihre Groesse daran nach.
 */
export async function replaceImageAsset(
  file: File,
  prev: string | null | undefined,
  opts: { maxDim: number; quality?: number },
): Promise<{ ref: string; width: number; height: number }> {
  const { url, width, height } = await fileToScaledDataUrl(file, {
    maxDim: opts.maxDim,
    quality: opts.quality ?? 0.82,
  })
  const ref = await putAsset(url)
  // Erst wegraeumen, wenn das neue Bild sicher liegt - sonst stuende bei einem Fehler
  // ueberhaupt kein Bild mehr da.
  void deleteAsset(prev)
  return { ref, width, height }
}

export async function deleteAsset(ref: string | null | undefined): Promise<void> {
  if (!isAssetRef(ref)) return
  cache.delete(ref)
  const db = await openDb()
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(ref)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

/**
 * Wendet eine (asynchrone) Transformation auf jede bildtragende Stelle einer
 * Kampagne an: Kartenebenen-Bild, Kampfkarte, Bildbloecke, Kreaturen-Portraits.
 */
export async function mapCampaignAssets(
  campaign: Campaign,
  fn: (val: string) => Promise<string>,
): Promise<Campaign> {
  const layers = await Promise.all(
    (campaign.layers ?? []).map(async (l) =>
      l.imageUrl ? { ...l, imageUrl: await fn(l.imageUrl) } : l,
    ),
  )
  const entities = await Promise.all(
    (campaign.entities ?? []).map(async (e) => {
      const imageUrl = e.imageUrl ? await fn(e.imageUrl) : e.imageUrl
      const thumbUrl = e.thumbUrl ? await fn(e.thumbUrl) : e.thumbUrl
      if (!e.event) return { ...e, imageUrl, thumbUrl }
      const ev = e.event
      const battleMapUrl = ev.battleMapUrl ? await fn(ev.battleMapUrl) : ev.battleMapUrl
      const blocks = await Promise.all(
        ev.blocks.map(async (b) => (b.kind === 'image' && b.url ? { ...b, url: await fn(b.url) } : b)),
      )
      const creatures = await Promise.all(
        ev.creatures.map(async (cr) => (cr.imageUrl ? { ...cr, imageUrl: await fn(cr.imageUrl) } : cr)),
      )
      return { ...e, imageUrl, thumbUrl, event: { ...ev, battleMapUrl, blocks, creatures } }
    }),
  )
  return { ...campaign, layers, entities }
}

/** Referenzen -> eingebettete data-URLs (fuer autarke Backups). */
export const inlineAsset = async (val: string): Promise<string> => (await getAsset(val)) ?? val

/** Eingebettete data-URLs -> IndexedDB-Referenzen (beim Import). */
export const internAsset = async (val: string): Promise<string> =>
  val.startsWith('data:') ? await putAsset(val) : val
