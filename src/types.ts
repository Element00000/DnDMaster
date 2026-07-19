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
  { type: 'entscheidung', label: 'Entscheidungspunkt', plural: 'Entscheidungspunkte', icon: '\u{1F500}', color: '#d98c1f' },
  { type: 'gefahr', label: 'Gefahr', plural: 'Gefahren', icon: '\u{2620}', color: '#c0392b' },
  { type: 'schatz', label: 'Schatz', plural: 'Schaetze', icon: '\u{1F48E}', color: '#8e44ad' },
]

export function entityMeta(type: EntityType): EntityTypeMeta {
  return ENTITY_TYPES.find((m) => m.type === type) ?? ENTITY_TYPES[0]
}

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
  links: EntityLink[]
  /** Typ-spezifische Felder (Schluessel siehe FIELD_SCHEMA). */
  fields: Record<string, string>
  createdAt: number
}

/** Eine Kartenebene (Weltkarte, Regionalkarte, Stadtplan ...). */
export interface MapLayer {
  id: string
  name: string
  imageUrl: string | null
  width: number
  height: number
}

export interface Campaign {
  id: string
  name: string
  description: string
  createdAt: number
  layers: MapLayer[]
  activeLayerId: string
  entities: Entity[]
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
