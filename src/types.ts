// Zentrales Datenmodell der DM-Weltkarte (Phase 2).
//
// Struktur: App -> mehrere Kampagnen (Welten) -> je Kampagne eigene Karten-
// ebenen und Entitaeten. Eine Entitaet ist ein echter Datensatz (Ort, Charakter,
// Fraktion, ...) mit typ-spezifischen Feldern, Geheimnissen (nur DM) und
// Verknuepfungen zu anderen Entitaeten. Hat eine Entitaet eine "placement",
// erscheint sie als Marker auf der Karte.

/** Objekttypen laut Konzeptdokument (Abschnitt 3 + 4). */
export type EntityType =
  | 'ort'
  | 'nsc'
  | 'fraktion'
  | 'ereignis'
  | 'quest'
  | 'item'
  | 'entscheidung'
  | 'gefahr'
  | 'schatz'

export interface EntityTypeMeta {
  type: EntityType
  label: string
  plural: string
  icon: string
  color: string
}

export const ENTITY_TYPES: EntityTypeMeta[] = [
  { type: 'ort', label: 'Ort', plural: 'Orte', icon: '\u{1F3F0}', color: '#c9a227' },
  { type: 'nsc', label: 'Charakter', plural: 'Charaktere', icon: '\u{1F464}', color: '#4f9d69' },
  { type: 'fraktion', label: 'Fraktion', plural: 'Fraktionen', icon: '\u{2694}', color: '#a3572b' },
  { type: 'ereignis', label: 'Ereignis', plural: 'Ereignisse', icon: '\u{1F4C5}', color: '#3b7dd8' },
  { type: 'quest', label: 'Quest', plural: 'Quests', icon: '\u{1F4DC}', color: '#c98a1f' },
  { type: 'item', label: 'Gegenstand', plural: 'Gegenstaende', icon: '\u{1F5DD}', color: '#8e7cc3' },
  { type: 'entscheidung', label: 'Entscheidung', plural: 'Entscheidungen', icon: '\u{1F500}', color: '#d98c1f' },
  { type: 'gefahr', label: 'Gefahr', plural: 'Gefahren', icon: '\u{2620}', color: '#c0392b' },
  { type: 'schatz', label: 'Schatz', plural: 'Schaetze', icon: '\u{1F48E}', color: '#8e44ad' },
]

export function entityMeta(type: EntityType): EntityTypeMeta {
  return ENTITY_TYPES.find((m) => m.type === type) ?? ENTITY_TYPES[0]
}

/** Berufs-/Rollenkategorien fuer freundliche Charaktere (nsc, Gesinnung 'freund'). */
export const FREUND_BERUFE: { value: string; label: string }[] = [
  { value: 'haendler', label: 'Haendler' },
  { value: 'wirt', label: 'Wirt' },
  { value: 'handwerker', label: 'Handwerker' },
  { value: 'waechter', label: 'Waechter' },
  { value: 'adliger', label: 'Adliger' },
  { value: 'gelehrter', label: 'Gelehrter' },
  { value: 'heiler', label: 'Heiler' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

/** Sichtbarkeit fuer Nebel des Krieges / Spielerzugang. */
export type Visibility = 'dm' | 'spieler'

/** Position einer Entitaet auf einer Kartenebene (Bildkoordinaten). */
export interface Placement {
  layerId: string
  x: number
  y: number
}

/** Verknuepfung von einer Entitaet zu einer anderen. */
export interface EntityLink {
  targetId: string
  relation: RelationType
}

export interface Entity {
  id: string
  type: EntityType
  name: string
  description: string
  /** Nur fuer den DM sichtbar (Geheimnisse). */
  secret: string
  visibility: Visibility
  /** Position auf der Karte; null = existiert nur in Listen. */
  placement: Placement | null
  /** Nur fuer Orte: verknuepfte Unterkarte (Ebene), die sich oeffnen laesst. */
  subMapId: string | null
  /** Portraet/Bild des Objekts (Asset-Referenz oder data-URL); z.B. KI-generiert. */
  imageUrl: string | null
  links: EntityLink[]
  /** Typ-spezifische Felder (Schluessel siehe FIELD_SCHEMA). */
  fields: Record<string, string>
  /** Verzweigter Handlungsstrang; nur bei type === 'entscheidung' gesetzt. */
  decision: DecisionData | null
  /** Reicher Ereignis-Inhalt; nur bei type === 'ereignis' gesetzt. */
  event: EventData | null
  /** Kampagnen-Kalendertag fuer die Zeitleiste; null = ohne Datum. */
  day: number | null
  /** Beginn des Tageszeit-Fensters in Minuten (0..1439); null = immer sichtbar. */
  timeStart: number | null
  /** Ende des Tageszeit-Fensters in Minuten (0..1439). start>end = ueber Mitternacht. */
  timeEnd: number | null
  createdAt: number
}

/**
 * Farbe fuer die Anzeige (Karte etc.), inkl. Ueberschreibung fuer Charaktere:
 * Freund gruen, Feind rot, neutral grau. Das Icon bleibt immer das Charakter-Icon.
 */
export function entityDisplayMeta(entity: Entity): EntityTypeMeta {
  const meta = entityMeta(entity.type)
  if (entity.type === 'nsc') {
    if (entity.fields.gesinnung === 'freund') return { ...meta, color: '#3fa34d' }
    if (entity.fields.gesinnung === 'feind') return { ...meta, color: '#c0392b' }
    if (entity.fields.gesinnung === 'neutral') return { ...meta, color: '#8a93a8' }
  }
  return meta
}

/** Aufgedeckter Kreis fuer den Nebel des Krieges (Weltkoordinaten). */
export interface RevealCircle {
  x: number
  y: number
  r: number
}

/**
 * Platzierung einer Ebene als eingebettete Karte auf einer anderen (Eltern-)Ebene.
 * x/y/width/height sind Weltkoordinaten der Eltern-Ebene.
 */
export interface EmbeddedPlacement {
  parentLayerId: string
  x: number
  y: number
  width: number
  height: number
}

/** Eine Kartenebene (Weltkarte, Regionalkarte, Stadtplan ...). */
export interface MapLayer {
  id: string
  name: string
  imageUrl: string | null
  width: number
  height: number
  /** Nebel des Krieges auf dieser Ebene aktiv? */
  fogEnabled: boolean
  /** Bereits aufgedeckte Bereiche. */
  reveals: RevealCircle[]
  /** Falls gesetzt: diese Ebene ist auf einer anderen Ebene eingebettet und dort erst ab genug Zoom sichtbar. */
  embed: EmbeddedPlacement | null
}

/** Sitzungsprotokoll-Eintrag (Phase 5). */
export interface Session {
  id: string
  title: string
  /** Frei eingebbares Datum in der Spielwelt, z.B. "Tag 12". */
  inGameDate: string
  body: string
  /** Verweise auf vorgekommene Objekte (Entity-IDs). */
  refs: string[]
  createdAt: number
}

/** Gespeicherte Musik (Spotify-Playlist/Track/Album) pro Kampagne. */
export interface MusicEntry {
  id: string
  label: string
  url: string
}

export interface Campaign {
  id: string
  name: string
  description: string
  createdAt: number
  layers: MapLayer[]
  activeLayerId: string
  entities: Entity[]
  sessions: Session[]
  music: MusicEntry[]
}

/** Teilnehmer im Kampf-Tracker (Phase 5, nur zur Laufzeit). */
export interface Combatant {
  id: string
  name: string
  initiative: number
  hp: number
  maxHp: number
  isPC: boolean
}

export interface AppData {
  campaigns: Campaign[]
  activeCampaignId: string
}

// ---------- Typ-spezifische Felder ----------

export interface FieldDef {
  key: string
  label: string
  kind: 'text' | 'textarea' | 'select'
  placeholder?: string
  options?: { value: string; label: string }[]
}

/** Gesinnung eines Charakters: bestimmt Farbe/Icon auf der Karte. */
export const GESINNUNG_OPTIONS: { value: string; label: string }[] = [
  { value: 'freund', label: 'Freund' },
  { value: 'feind', label: 'Feind' },
  { value: 'neutral', label: 'Neutral / unklar' },
]

/** Art eines Gegenstands (Auswahl beim Anlegen und im Objekt-Feld "Art"). */
export const ITEM_ART_OPTIONS: { value: string; label: string }[] = [
  { value: 'schatz', label: 'Schatz' },
  { value: 'waffe', label: 'Waffe' },
  { value: 'objekt', label: 'Objekt' },
  { value: 'ausruestung', label: 'Ausruestung' },
  { value: 'verbrauchsgut', label: 'Verbrauchsgut' },
  { value: 'artefakt', label: 'Artefakt' },
]

export const FIELD_SCHEMA: Record<EntityType, FieldDef[]> = {
  ort: [
    {
      key: 'status',
      label: 'Status',
      kind: 'select',
      options: [
        { value: 'unentdeckt', label: 'Unentdeckt' },
        { value: 'besucht', label: 'Besucht' },
        { value: 'kontrolliert', label: 'Kontrolliert von Fraktion' },
        { value: 'zerstoert', label: 'Zerstoert' },
      ],
    },
  ],
  nsc: [
    { key: 'rolle', label: 'Rolle', kind: 'text', placeholder: 'z.B. Wirtin, Hauptmann ...' },
    { key: 'motivation', label: 'Motivation', kind: 'textarea', placeholder: 'Was treibt die Figur an?' },
    { key: 'gesinnung', label: 'Gesinnung', kind: 'select', options: GESINNUNG_OPTIONS },
    { key: 'quests', label: 'Quests', kind: 'textarea', placeholder: 'Auftraege/Quests, die diese Figur betreffen ...' },
  ],
  fraktion: [
    { key: 'ziel', label: 'Ziel', kind: 'textarea', placeholder: 'Wonach strebt die Fraktion?' },
    { key: 'ressourcen', label: 'Ressourcen', kind: 'text' },
  ],
  ereignis: [
    { key: 'zeitpunkt', label: 'Zeitpunkt / Zeitraum', kind: 'text', placeholder: 'z.B. Tag 12, Mitternacht' },
  ],
  quest: [
    {
      key: 'status',
      label: 'Status',
      kind: 'select',
      options: [
        { value: 'offen', label: 'Offen' },
        { value: 'aktiv', label: 'Aktiv' },
        { value: 'abgeschlossen', label: 'Abgeschlossen' },
        { value: 'gescheitert', label: 'Gescheitert' },
      ],
    },
  ],
  item: [
    { key: 'art', label: 'Art', kind: 'select', options: ITEM_ART_OPTIONS },
    { key: 'besitzer', label: 'Besitzer / Fundort', kind: 'text' },
    { key: 'bedeutung', label: 'Bedeutung', kind: 'textarea' },
  ],
  entscheidung: [],
  gefahr: [
    { key: 'gefahrenstufe', label: 'Gefahrenstufe', kind: 'text' },
  ],
  schatz: [
    { key: 'wert', label: 'Wert / Inhalt', kind: 'text' },
  ],
}

// ---------- Verknuepfungsarten ----------

export type RelationType =
  | 'befindet_sich_in'
  | 'gehoert_zu'
  | 'verbuendet'
  | 'verfeindet'
  | 'neutral'
  | 'beteiligt'
  | 'besitzt'
  | 'verbunden'

export interface RelationMeta {
  relation: RelationType
  label: string
  /** Wie die Beziehung aus Sicht des Ziels heisst (eingehende Anzeige). */
  inverseLabel: string
}

export const RELATIONS: RelationMeta[] = [
  { relation: 'befindet_sich_in', label: 'befindet sich in', inverseLabel: 'Aufenthaltsort von' },
  { relation: 'gehoert_zu', label: 'gehoert zu', inverseLabel: 'umfasst' },
  { relation: 'verbuendet', label: 'verbuendet mit', inverseLabel: 'verbuendet mit' },
  { relation: 'verfeindet', label: 'verfeindet mit', inverseLabel: 'verfeindet mit' },
  { relation: 'neutral', label: 'neutral zu', inverseLabel: 'neutral zu' },
  { relation: 'beteiligt', label: 'beteiligt', inverseLabel: 'beteiligt an' },
  { relation: 'besitzt', label: 'besitzt', inverseLabel: 'im Besitz von' },
  { relation: 'verbunden', label: 'verbunden mit', inverseLabel: 'verbunden mit' },
]

export function relationMeta(relation: RelationType): RelationMeta {
  return RELATIONS.find((r) => r.relation === relation) ?? RELATIONS[RELATIONS.length - 1]
}

// ---------- Entscheidungen / verzweigte Handlungsstraenge (Phase 4) ----------

/**
 * Eine Folge, die eintritt, wenn eine Option gewaehlt wird. Alle Effekte
 * verweisen auf vorhandene Objekte der Kampagne und werden automatisch
 * angewendet (bzw. beim Zuruecknehmen rueckgaengig gemacht).
 */
export type Effect =
  | { id: string; kind: 'set_field'; targetId: string; key: string; value: string }
  | { id: string; kind: 'reveal'; targetId: string; value: Visibility }
  | { id: string; kind: 'relation'; op: 'add' | 'remove'; fromId: string; toId: string; relation: RelationType }
  | { id: string; kind: 'note'; text: string }

export const EFFECT_KINDS: { kind: Effect['kind']; label: string }[] = [
  { kind: 'set_field', label: 'Status/Feld aendern' },
  { kind: 'reveal', label: 'Objekt auf-/zudecken' },
  { kind: 'relation', label: 'Beziehung aendern' },
  { kind: 'note', label: 'Notiz' },
]

/** Rueckgaengig-Information, gespeichert beim Anwenden einer Option. */
export type UndoEntry =
  | { kind: 'field'; targetId: string; key: string; prev?: string }
  | { kind: 'visibility'; targetId: string; prev: Visibility }
  | { kind: 'relation_add'; fromId: string; toId: string; relation: RelationType }
  | { kind: 'relation_remove'; fromId: string; toId: string; relation: RelationType }

export interface DecisionOption {
  id: string
  label: string
  description: string
  effects: Effect[]
  /** Verkettung: fuehrt zu dieser naechsten Entscheidung. */
  nextDecisionId: string | null
  /** Beim Anwenden gefuellt, um die Folgen zuruecknehmen zu koennen. */
  undo: UndoEntry[] | null
}

export interface DecisionData {
  /** Situation, zu der der Punkt gehoert (Ereignis oder Quest). */
  situationId: string | null
  options: DecisionOption[]
  /** Aktuell eingetretene Option; null = noch offen. */
  chosenOptionId: string | null
}

export function emptyDecision(): DecisionData {
  return { situationId: null, options: [], chosenOptionId: null }
}

// ---------- Reiche Ereignisse (Encounter) ----------

/** Art eines Ereignisses. */
export type EventKind = 'info' | 'kampf' | 'begegnung' | 'loot' | 'raetsel' | 'sozial'

export const EVENT_KINDS: { kind: EventKind; label: string; icon: string }[] = [
  { kind: 'info', label: 'Info / Text', icon: '\u{1F4D6}' },
  { kind: 'kampf', label: 'Kampf', icon: '\u{2694}' },
  { kind: 'begegnung', label: 'Begegnung', icon: '\u{1F3AD}' },
  { kind: 'loot', label: 'Schatz / Loot', icon: '\u{1F4B0}' },
  { kind: 'raetsel', label: 'Raetsel', icon: '\u{1F9E9}' },
  { kind: 'sozial', label: 'Sozial', icon: '\u{1F4AC}' },
]

export function eventKindMeta(kind: EventKind) {
  return EVENT_KINDS.find((k) => k.kind === kind) ?? EVENT_KINDS[0]
}

/** Anhaengbarer Inhaltsblock eines Ereignisses. */
export type EventBlock =
  | { id: string; kind: 'text'; title: string; body: string }
  | { id: string; kind: 'loot'; title: string; body: string }
  | { id: string; kind: 'image'; title: string; url: string }

export const BLOCK_KINDS: { kind: EventBlock['kind']; label: string; icon: string }[] = [
  { kind: 'text', label: 'Text', icon: '\u{1F4DD}' },
  { kind: 'loot', label: 'Loot', icon: '\u{1F4B0}' },
  { kind: 'image', label: 'Bild', icon: '\u{1F5BC}' },
]

/** Eine Kreatur (Gegner oder SC) im Kampf. */
export interface Creature {
  id: string
  name: string
  /** Gewuerfelte Initiative; null = noch nicht eingetragen. */
  initiative: number | null
  hp: number
  maxHp: number
  /** Ruestungsklasse. */
  ac: number
  speed: string
  /** Faehigkeiten/Notizen auf einen Blick. */
  abilities: string
  imageUrl: string | null
  isPC: boolean
}

export interface EventData {
  kind: EventKind
  blocks: EventBlock[]
  /** Detailkarte fuer den Kampf (Bild als data-URL). */
  battleMapUrl: string | null
  creatures: Creature[]
}

export function emptyEvent(): EventData {
  return { kind: 'info', blocks: [], battleMapUrl: null, creatures: [] }
}
