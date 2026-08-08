// Kopieren und Einfuegen (Strg+C / Strg+V) von Objekten und Karten.
//
// Die Zwischenablage liegt bewusst nur im Speicher dieser Sitzung, nicht in der
// Systemzwischenablage und nicht im gespeicherten Stand: Was hier drinsteht, sind ganze
// Datensaetze samt Bildern - dafuer ist die Systemzwischenablage der falsche Ort, und ueber
// einen Neustart hinweg haette eine "haengengebliebene" Kopie mehr verwirrt als genutzt.
//
// Kopiert wird der Bauplan (die Objekte, wie sie dastehen), gebaut wird erst beim Einfuegen:
// Erst dort entstehen neue Ids und eigene Bilder. So laesst sich dieselbe Kopie mehrfach
// einfuegen, ohne dass die Einfuegungen sich hinterher gegenseitig veraendern.

import type { Effect, EmbeddedPlacement, Entity, MapLayer } from '../types'
import { getAsset, isAssetRef, putAsset } from './assets'
import { uid } from './id'

/**
 * Was zuletzt kopiert wurde.
 *
 * - Objekte kopiert: layers ist leer, entities sind die markierten Objekte.
 * - Karte kopiert: layers[0] ist die Karte selbst, danach folgen ihre (beliebig tief)
 *   eingebetteten Unterkarten; entities sind alle Objekte, die auf einer davon stehen.
 */
export interface CopyBundle {
  layers: MapLayer[]
  entities: Entity[]
}

let clipboard: CopyBundle | null = null

export function setClipboard(bundle: CopyBundle): void {
  clipboard = bundle
}

export function getClipboard(): CopyBundle | null {
  return clipboard
}

/** Wohin die Kopien kommen. */
export interface PasteTarget {
  /** Karte, auf der Objekte ohne mitkopierte Karte landen. */
  layerId: string
  /** Verschiebung dieser Objekte auf der Zielkarte (Weltkoordinaten). */
  dx: number
  dy: number
  /** Einbettung der kopierten Karte; nur beim Einfuegen einer Karte gesetzt. */
  embed?: EmbeddedPlacement
}

/**
 * Bild-Asset verdoppeln. Kopie und Original duerfen sich kein Bild teilen: Tauscht man es
 * spaeter an einer der beiden aus, raeumt die Anwendung das abgeloeste Asset weg - und
 * nimmt der anderen damit ihr Bild mit. Der Cache sorgt dafuer, dass ein Bild, das mehrere
 * kopierte Objekte gemeinsam nutzen, nur einmal verdoppelt wird.
 */
async function copyAsset(
  ref: string | null | undefined,
  cache: Map<string, string>,
): Promise<string | null> {
  if (!ref) return null
  // data:- und http-Bilder haengen an keinem Speicherplatz, den jemand aufraeumen koennte.
  if (!isAssetRef(ref)) return ref
  const done = cache.get(ref)
  if (done) return done
  const data = await getAsset(ref)
  if (data == null) return ref
  const next = await putAsset(data)
  cache.set(ref, next)
  return next
}

/**
 * Frische Kopien aus einem Bauplan: neue Ids, eigene Bilder, Verweise untereinander auf die
 * Kopien umgebogen (Verweise nach draussen zeigen weiter auf das urspruengliche Ziel).
 */
export async function instantiate(
  bundle: CopyBundle,
  target: PasteTarget,
): Promise<{ layers: MapLayer[]; entities: Entity[] }> {
  const assets = new Map<string, string>()
  const layerIds = new Map(bundle.layers.map((l) => [l.id, uid('layer-')]))
  const entityIds = new Map(bundle.entities.map((e) => [e.id, uid('e-')]))

  /** Verweis auf ein Objekt: mitkopiert -> auf die Kopie, sonst unveraendert. */
  const refEntity = (id: string) => entityIds.get(id) ?? id

  /**
   * Wo ein Punkt der Kopie liegt. Auf einer mitkopierten Karte bleibt er, wo er war - die
   * Karte selbst wandert ja als Ganzes. Alles andere landet auf der Zielkarte, um die
   * Strecke zwischen urspruenglicher Stelle und Einfuegepunkt verschoben.
   */
  const place = (layerId: string, x: number, y: number) => {
    const copied = layerIds.get(layerId)
    if (copied) return { layerId: copied, x, y }
    return { layerId: target.layerId, x: x + target.dx, y: y + target.dy }
  }

  const copyEffect = (fx: Effect): Effect => {
    const id = uid('eff-')
    if (fx.kind === 'relation') return { ...fx, id, fromId: refEntity(fx.fromId), toId: refEntity(fx.toId) }
    if (fx.kind === 'note') return { ...fx, id }
    return { ...fx, id, targetId: refEntity(fx.targetId) }
  }

  const layers: MapLayer[] = []
  for (const [i, l] of bundle.layers.entries()) {
    layers.push({
      ...l,
      id: layerIds.get(l.id)!,
      // Nur die kopierte Karte selbst wird als Kopie kenntlich gemacht; bei ihren
      // Unterkarten sagt schon die Karte darueber, woher sie stammen.
      name: i === 0 ? `${l.name} (Kopie)` : l.name,
      imageUrl: await copyAsset(l.imageUrl, assets),
      reveals: l.reveals.map((r) => ({ ...r })),
      embed:
        i === 0
          ? target.embed ?? null
          : l.embed
            ? { ...l.embed, parentLayerId: layerIds.get(l.embed.parentLayerId) ?? l.embed.parentLayerId }
            : null,
    })
  }

  const entities: Entity[] = []
  for (const e of bundle.entities) {
    const base = e.placement?.layerId ?? target.layerId
    const placement = e.placement ? place(e.placement.layerId, e.placement.x, e.placement.y) : null
    const event = e.event
    entities.push({
      ...e,
      id: entityIds.get(e.id)!,
      // Beim Kopieren einer Karte behaelt ihr Inhalt seine Namen - dass alles daran eine
      // Kopie ist, sagt bereits der Name der Karte.
      name: bundle.layers.length > 0 ? e.name : `${e.name} (Kopie)`,
      placement,
      subMapId: e.subMapId ? layerIds.get(e.subMapId) ?? e.subMapId : null,
      imageUrl: await copyAsset(e.imageUrl, assets),
      thumbUrl: await copyAsset(e.thumbUrl, assets),
      links: e.links.map((l) => ({ ...l, targetId: refEntity(l.targetId) })),
      schedule: e.schedule.map((s) => {
        const p = place(s.layerId ?? base, s.x, s.y)
        return { ...s, id: uid('key-'), layerId: p.layerId, x: p.x, y: p.y }
      }),
      // Die Wahl gilt der Kopie nicht: Ihre Folgen sind nie eingetreten, und die
      // Rueckgaengig-Daten der Vorlage zeigen auf deren Objekte, nicht auf diese.
      decision: e.decision
        ? {
            ...e.decision,
            situationId: e.decision.situationId ? refEntity(e.decision.situationId) : null,
            chosenOptionId: null,
            options: e.decision.options.map((o) => ({
              ...o,
              id: uid('opt-'),
              undo: null,
              nextDecisionId: o.nextDecisionId ? refEntity(o.nextDecisionId) : null,
              effects: o.effects.map(copyEffect),
            })),
          }
        : null,
      event: event
        ? {
            ...event,
            battleMapUrl: await copyAsset(event.battleMapUrl, assets),
            blocks: await Promise.all(
              event.blocks.map(async (b) =>
                b.kind === 'image'
                  ? { ...b, id: uid('b-'), url: (await copyAsset(b.url, assets)) ?? '' }
                  : { ...b, id: uid('b-') },
              ),
            ),
            creatures: await Promise.all(
              event.creatures.map(async (c) => ({
                ...c,
                id: uid('cr-'),
                imageUrl: await copyAsset(c.imageUrl, assets),
              })),
            ),
          }
        : null,
      createdAt: Date.now(),
    })
  }

  return { layers, entities }
}
