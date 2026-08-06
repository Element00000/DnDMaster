import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AppData,
  Campaign,
  Creature,
  DecisionData,
  DecisionOption,
  Effect,
  Entity,
  EntityType,
  EventBlock,
  EventData,
  EmbeddedPlacement,
  MapLayer,
  Placement,
  RelationType,
  Timestone,
  Session,
  UndoEntry,
} from '../types'
import { emptyDecision, emptyEvent } from '../types'
import { uid } from '../utils/id'
import { MINUTES_PER_DAY, activeTimestone, placementAt } from '../utils/time'

function makeLayer(name = 'Weltkarte'): MapLayer {
  return {
    id: uid('layer-'),
    name,
    imageUrl: null,
    width: 2000,
    height: 1400,
    fogEnabled: false,
    reveals: [],
    embed: null,
  }
}

function makeCampaign(name: string): Campaign {
  const layer = makeLayer()
  return {
    id: uid('camp-'),
    name,
    description: '',
    createdAt: Date.now(),
    layers: [layer],
    activeLayerId: layer.id,
    entities: [],
    sessions: [],
    music: [],
  }
}

/**
 * Skaliert saemtlichen Inhalt einer Kartenebene proportional mit, wenn sich deren eigene
 * Breite/Hoehe aendert (Eck-Ziehpunkt-Resize oder Bildaustausch): Nebel-Aufdeckungen, auf
 * ihr platzierte Objekte (inkl. Zeitplan-Positionen) sowie - damit die Hierarchie nicht
 * "kaputt geht" - die Platzierung aller direkt in sie eingebetteten Karten. Ohne das wuerden
 * eingebettete Karten und Objekte bei einem kleineren neuen Bild ausserhalb des sichtbaren
 * Bereichs "herunterfallen".
 */
function rescaleLayerContent(c: Campaign, layerId: string, sx: number, sy: number): Campaign {
  const sr = (sx + sy) / 2
  return {
    ...c,
    layers: c.layers.map((l) => {
      if (l.id === layerId) {
        return { ...l, reveals: l.reveals.map((r) => ({ x: r.x * sx, y: r.y * sy, r: r.r * sr })) }
      }
      if (l.embed?.parentLayerId === layerId) {
        return {
          ...l,
          embed: {
            ...l.embed,
            x: l.embed.x * sx,
            y: l.embed.y * sy,
            width: l.embed.width * sx,
            height: l.embed.height * sy,
          },
        }
      }
      return l
    }),
    // Platzierung und Timestones werden einzeln geprueft: Beide koennen inzwischen auf
    // verschiedenen Karten liegen, und mitskaliert werden darf nur, was auf der
    // veraenderten liegt.
    entities: c.entities.map((e) => {
      if (!e.placement) return e
      const onLayer = (id: string | undefined) => (id ?? e.placement!.layerId) === layerId
      return {
        ...e,
        placement:
          e.placement.layerId === layerId
            ? { ...e.placement, x: e.placement.x * sx, y: e.placement.y * sy }
            : e.placement,
        schedule: e.schedule.map((s) =>
          onLayer(s.layerId) ? { ...s, x: s.x * sx, y: s.y * sy } : s,
        ),
      }
    }),
  }
}

/** Maximale Anzahl an Undo-Schritten. */
const UNDO_LIMIT = 50
/** Aenderungen innerhalb dieses Fensters zaehlen als ein Undo-Schritt (Tippen, Ziehen). */
const UNDO_COALESCE_MS = 700

/** Werkzeug-Modus der Karte. */
export type Tool = 'select' | 'add'

/** Reiter im DM-Werkzeug-Panel. */
export type ToolTab = 'wuerfel' | 'notizen' | 'ki' | 'musik'

/** Ansicht in der unteren, hochfahrenden Leiste. */
export type BottomPanel = 'zeitleiste' | 'handlungsbaum' | 'beziehungen'

/** Standardhoehe der unteren Leiste in Prozent der Fensterhoehe. */
export const BOTTOM_PANEL_DEFAULT = 45
export const BOTTOM_PANEL_MIN = 18
export const BOTTOM_PANEL_MAX = 92

interface StoreState extends AppData {
  // UI-Zustand (nicht persistiert)
  tool: Tool
  pendingEntityType: EntityType
  /** Voreingestellte Felder (z.B. Gesinnung) fuer das naechste anzulegende Objekt. */
  pendingEntityFields: Record<string, string>
  selectedEntityId: string | null
  /** Mehrfachauswahl auf der Karte (Rechteck-Markierung / Strg+Klick). */
  selectedIds: string[]
  /** Ein vorhandenes (unplatziertes) Objekt wartet auf einen Kartenklick. */
  placingEntityId: string | null
  /** Eine vorhandene Ebene wartet darauf, per Kartenklick als eingebettete Karte platziert zu werden. */
  placingLayerId: string | null
  /**
   * Welche (verschachtelte) Karte innerhalb der aktiven Wurzelkarte man gerade "betrachtet"
   * - null = die Wurzelkarte selbst. Bestimmt sowohl, wohin neu angelegte Karten eingebettet
   * werden, als auch (als einmaliger Navigations-Befehl) wohin die Kartenansicht per Zoom/
   * Schwenk als naechstes gefuehrt werden soll, wenn ein Eintrag in "Meine Karten" angeklickt
   * wird. Es wird NICHT die aktive Ebene gewechselt - man bleibt immer in der Wurzelkarten-
   * Instanz, nur der sichtbare Ausschnitt aendert sich.
   */
  viewLayerId: string | null
  /**
   * @param zoom false = nur den Panel-Kontext umsetzen, ohne die Kartenansicht zu bewegen
   * (z.B. Klick auf freie Kartenflaeche: der soll nicht die ganze Karte einpassen).
   */
  setViewLayerId: (id: string | null, zoom?: boolean) => void
  /**
   * Wird bei jedem setViewLayerId-Aufruf erhoeht, auch wenn sich die Id nicht aendert (z.B.
   * erneuter Klick auf dieselbe eingeklappte Kartenpinnadel, nachdem man zwischenzeitlich
   * manuell wieder herausgezoomt hat). Ohne das wuerde React den Zoom-Effekt in MapCanvas
   * nicht erneut ausloesen, weil sich viewLayerId nicht veraendert hat - der Klick auf den
   * Pin haette dann sichtbar keine Wirkung mehr.
   */
  viewLayerNonce: number
  /**
   * Zur Karte eines Objekts navigieren (Suche, Zeitleiste, Beziehungsgraph, Sitzungsnotizen).
   * Wechselt die aktive Wurzelkarte NUR, wenn die Zielebene zu einer anderen Wurzel gehoert,
   * und zoomt sonst (auch dann) per viewLayerId zur Zielebene, statt die aktive Ebene direkt
   * auf eine verschachtelte Karte zu setzen - sonst waere beim Herauszoomen nur noch diese
   * eine Karte isoliert zu sehen, statt wieder die gesamte Hierarchie.
   */
  goToLayer: (layerId: string) => void
  /**
   * Zu der Karte springen, auf der ein Objekt gerade steht. Das muss nicht die Karte seiner
   * Basis-Platzierung sein: Ein Timestone kann es zur eingestellten Uhrzeit auf eine andere
   * geschickt haben.
   */
  goToEntity: (entityId: string) => void
  /**
   * Zaehler als einmaliger Befehl an MapCanvas, die aktive Karte komplett einzupassen
   * (herauszuzoomen, bis sie vollstaendig sichtbar ist). Wird bei jedem Aufruf erhoeht,
   * damit ein Effekt in MapCanvas auch mehrfach hintereinander darauf reagieren kann.
   */
  fitToViewRequest: number
  requestFitToView: () => void
  /** Rueckgaengig-Verlauf der aktiven Kampagne (nicht persistiert). */
  undoStack: Campaign[]
  /** Zeitpunkt des letzten Undo-Snapshots, zum Zusammenfassen schneller Aenderungen. */
  lastUndoPushAt: number
  /** Letzte Aenderung an der aktiven Kampagne rueckgaengig machen (Strg+Z). */
  undo: () => void

  // Zeit (Phase 3). Tageszeit und Tag/Nacht-Einfaerbung sind immer aktiv - die frueheren
  // Schalter dafuer gibt es nicht mehr.
  /** Aktuelle Tageszeit in Minuten (0..1439). */
  timeOfDay: number
  /**
   * Aktueller Kampagnentag. Bestimmt, welche Tagesplan-Ausnahmen greifen und auf welchen
   * Tag sich neu angelegte Ausnahmen beziehen.
   */
  currentDay: number
  setTimeOfDay: (minutes: number) => void
  setCurrentDay: (day: number) => void

  // Untere, hochfahrende Leiste (Zeitleiste / Handlungsbaum / Beziehungen)
  /** Geoeffnete Ansicht; null = Leiste zu. */
  bottomPanel: BottomPanel | null
  /** Hoehe der Leiste in Prozent der Fensterhoehe - gilt erst, wenn man selbst gezogen hat. */
  bottomPanelHeight: number
  /**
   * Hoehe folgt dem Inhalt, statt fest zu sein: Die Leiste ist nur so hoch wie noetig und
   * waechst mit, wenn Spuren dazukommen. Sobald man selbst am Griff zieht, gilt die
   * eingestellte Hoehe; beim naechsten Oeffnen passt sie sich wieder an.
   */
  bottomPanelAuto: boolean
  /**
   * Tatsaechliche Hoehe der Leiste in Pixeln, vom Panel gemeldet. Im mitwachsenden Zustand
   * ist die Prozentangabe nicht aussagekraeftig - die schwebenden Leisten darueber
   * (Panel-Knoepfe, Zoom) richten sich daher an diesem Wert aus.
   */
  bottomPanelPx: number
  setBottomPanelPx: (px: number) => void
  /** Ansicht oeffnen; derselbe Wert erneut schliesst sie wieder. */
  toggleBottomPanel: (panel: BottomPanel) => void
  setBottomPanel: (panel: BottomPanel | null) => void
  setBottomPanelHeight: (percent: number) => void

  // DM-Werkzeuge (Phase 5)
  toolsOpen: boolean
  toolsTab: ToolTab
  setToolsOpen: (open: boolean) => void
  setToolsTab: (tab: ToolTab) => void

  // Feinschliff (Phase 6)
  /** Spieltischmodus: aufgeraeumte Live-Ansicht fuer die Spielrunde (blendet DM-Geheimnisse und unentdeckte Objekte aus, keine Bearbeitung). */
  tableMode: boolean
  /** Nebel-Pinsel aktiv (DM deckt Bereiche auf)? */
  fogEditing: boolean
  /** Radius des Nebel-Pinsels in Weltkoordinaten. */
  fogBrush: number
  setTableMode: (on: boolean) => void
  setFogEditing: (on: boolean) => void
  setFogBrush: (r: number) => void

  // Sitzungsnotizen (persistiert, aktive Kampagne)
  addSession: () => string
  updateSession: (id: string, patch: Partial<Omit<Session, 'id' | 'createdAt'>>) => void
  deleteSession: (id: string) => void

  // Kampagnen
  activeCampaign: () => Campaign
  addCampaign: (name: string) => void
  renameCampaign: (id: string, name: string) => void
  updateCampaignDescription: (id: string, description: string) => void
  deleteCampaign: (id: string) => void
  setActiveCampaign: (id: string) => void
  /** Eine importierte Kampagne hinzufuegen (neue ID bei Kollision) und aktiv setzen. */
  importCampaign: (campaign: Campaign) => void
  /** Alle Daten aus einem Backup ersetzen. */
  replaceAllData: (data: AppData) => void
  /** Musik (Spotify) der aktiven Kampagne. */
  /** Liefert die Id des neuen Eintrags, damit die Ansicht ihn gleich aufklappen kann. */
  addMusicEntry: (label: string, url: string) => string
  removeMusicEntry: (id: string) => void

  // Ebenen (der aktiven Kampagne)
  activeLayer: () => MapLayer
  setActiveLayer: (id: string) => void
  setLayerImage: (id: string, imageUrl: string, width: number, height: number) => void
  resetLayerImage: (id: string) => void
  resizeLayer: (id: string, width: number, height: number) => void
  addLayer: (name: string) => string
  renameLayer: (id: string, name: string) => void
  deleteLayer: (id: string) => void
  /** Ebene als eingebettete Karte auf einer anderen Ebene platzieren. */
  embedLayer: (id: string, placement: EmbeddedPlacement) => void
  /** Position/Groesse einer eingebetteten Karte aendern (Verschieben/Skalieren per Eckgriff). */
  setEmbedRect: (id: string, x: number, y: number, width: number, height: number) => void
  setPlacingLayer: (id: string | null) => void
  // Nebel des Krieges (Phase 6)
  setLayerFog: (id: string, enabled: boolean) => void
  addReveal: (layerId: string, x: number, y: number, r: number) => void
  clearReveals: (layerId: string) => void

  // Entitaeten (der aktiven Kampagne)
  addEntity: (input: { type: EntityType; placement?: Placement; name?: string; fields?: Record<string, string> }) => string
  updateEntity: (id: string, patch: Partial<Omit<Entity, 'id' | 'createdAt'>>) => void
  setEntityField: (id: string, key: string, value: string) => void
  deleteEntity: (id: string) => void
  selectEntity: (id: string | null) => void
  /** Mehrfachauswahl komplett ersetzen (z.B. Ergebnis einer Rechteck-Markierung). */
  setSelectedIds: (ids: string[]) => void
  /** Einzelnes Objekt in der Mehrfachauswahl an-/abwaehlen (Strg+Klick). */
  toggleSelectedId: (id: string) => void
  addLink: (fromId: string, targetId: string, relation: RelationType) => void
  removeLink: (fromId: string, targetId: string, relation: RelationType) => void
  setPlacement: (id: string, placement: Placement | null) => void
  /** Platzierte Entitaet um ein Weltkoordinaten-Delta verschieben. */
  moveEntity: (id: string, dxWorld: number, dyWorld: number) => void

  // Tagesablauf als Timestones
  /**
   * Timestone setzen: Ab dieser Uhrzeit steht das Objekt an der Position, an der es
   * gerade steht. Ohne Angaben zur aktuellen Uhrzeit im Standard-Tagesablauf. Liegt dort
   * schon einer, wird dessen Position aktualisiert statt ein zweiter angelegt.
   * Liefert die Id (oder null, wenn das Objekt nicht platziert ist).
   */
  addTimestone: (
    entityId: string,
    init?: { time?: number; day?: number | null; label?: string; x?: number; y?: number; layerId?: string },
  ) => string | null
  updateTimestone: (entityId: string, keyId: string, patch: Partial<Omit<Timestone, 'id'>>) => void
  removeTimestone: (entityId: string, keyId: string) => void
  moveTimestone: (entityId: string, keyId: string, dxWorld: number, dyWorld: number) => void
  /**
   * Vorgemerkte Positionen beim Planen eines Tagesablaufs, je Objekt-Id: Waehrend die
   * Zeitleiste offen ist, schiebt man die Objekte auf der Karte erst einmal nur probeweise -
   * festgehalten werden sie durch "Timestone setzen". Ohne das wuerde das Ziehen den zuletzt
   * gueltigen Punkt (oder die Basis-Platzierung) veraendern, statt einen neuen Zeitpunkt
   * vorzubereiten. Fluechtig; wird bei Zeit- oder Tagwechsel verworfen.
   */
  draftPos: Record<string, DraftPos>
  setDraftPos: (entityId: string, x: number, y: number, layerId: string) => void
  /** Uhrzeit der Vormerkung setzen (die Wahl direkt neben der Figur auf der Karte). */
  setDraftTime: (entityId: string, minutes: number) => void
  /** Vormerkung als Timestone festhalten. Liefert dessen Id, oder null ohne Vormerkung. */
  commitDraft: (entityId: string, day?: number | null) => string | null
  /** Ohne Id alle Vormerkungen verwerfen, mit Id nur die des Objekts. */
  clearDraftPos: (entityId?: string) => void

  // Entscheidungen (Phase 4)
  updateDecision: (entityId: string, patch: Partial<DecisionData>) => void
  addOption: (entityId: string) => void
  updateOption: (
    entityId: string,
    optionId: string,
    patch: Partial<Pick<DecisionOption, 'label' | 'description' | 'nextDecisionId'>>,
  ) => void
  removeOption: (entityId: string, optionId: string) => void
  addEffect: (entityId: string, optionId: string, effect: Effect) => void
  updateEffect: (entityId: string, optionId: string, effect: Effect) => void
  removeEffect: (entityId: string, optionId: string, effectId: string) => void
  /** Option als eingetreten markieren (Folgen anwenden). Erneut = zuruecknehmen. */
  chooseOption: (entityId: string, optionId: string) => void
  clearChoice: (entityId: string) => void

  // Reiche Ereignisse / Encounter
  updateEvent: (entityId: string, patch: Partial<EventData>) => void
  addBlock: (entityId: string, block: EventBlock) => void
  updateBlock: (entityId: string, block: EventBlock) => void
  removeBlock: (entityId: string, blockId: string) => void
  setBattleMap: (entityId: string, url: string | null) => void
  addCreature: (entityId: string, creature?: Partial<Creature>) => void
  updateCreature: (entityId: string, creatureId: string, patch: Partial<Omit<Creature, 'id'>>) => void
  removeCreature: (entityId: string, creatureId: string) => void
  duplicateCreature: (entityId: string, creatureId: string) => void
  /** Aktiver Kampf (Fight-Modus) fuer dieses Ereignis; null = geschlossen. */
  fightEventId: string | null
  setFightEvent: (id: string | null) => void

  // UI
  setTool: (t: Tool) => void
  setPendingEntityType: (t: EntityType) => void
  setPendingEntityFields: (fields: Record<string, string>) => void
  setPlacingEntity: (id: string | null) => void
}

/**
 * Die Zeitleiste zeigt den Tagesablauf des ausgewaehlten Objekts - faellt die Auswahl weg,
 * schliesst sie sich mit, und mit ihr verschwindet die ganze Planungsansicht auf der Karte:
 * Route, Stationen und noch nicht gespeicherte Vormerkungen. Nur dann: Ohne vorherige
 * Auswahl war sie fuer die Kampagnentage geoeffnet und bleibt stehen.
 */
function deselectPatch(s: StoreState, stillSelected: boolean): Pick<StoreState, 'bottomPanel' | 'draftPos'> {
  const closes = !stillSelected && s.selectedEntityId !== null && s.bottomPanel === 'zeitleiste'
  if (!closes) return { bottomPanel: s.bottomPanel, draftPos: s.draftPos }
  return { bottomPanel: null, draftPos: {} }
}

/**
 * Eine vorgemerkte Station: der Ort steht schon fest (man hat die Figur hingeschoben), die
 * Uhrzeit waehlt man unmittelbar daneben auf der Karte. Erst mit dem Bestaetigen wird
 * daraus ein Timestone - bis dahin laesst sich alles noch verwerfen.
 */
export interface DraftPos {
  x: number
  y: number
  /** Karte, auf der die vorgemerkte Stelle liegt - x und y gelten in deren Koordinaten. */
  layerId: string
  /** Ab wann das Objekt hier stehen soll (Minuten seit Mitternacht). */
  time: number
}

/** Was ueber ein Neuladen hinweg erhalten bleibt. */
interface PersistedState extends AppData {
  timeOfDay: number
  currentDay: number
}

function initialData(): AppData {
  const campaign = makeCampaign('Meine Kampagne')
  return { campaigns: [campaign], activeCampaignId: campaign.id }
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      /**
       * Aktive Kampagne unveraenderlich patchen. Legt dabei einen Undo-Snapshot
       * an, fasst aber schnell aufeinanderfolgende Aenderungen (Tippen, Ziehen
       * eines Pins) zu einem einzigen Rueckgaengig-Schritt zusammen.
       */
      const patchActive = (fn: (c: Campaign) => Campaign) =>
        set((s) => {
          const current = s.campaigns.find((c) => c.id === s.activeCampaignId)
          const now = Date.now()
          const coalesce = now - s.lastUndoPushAt < UNDO_COALESCE_MS
          const undoStack = current && !coalesce ? [...s.undoStack, current].slice(-UNDO_LIMIT) : s.undoStack
          return {
            campaigns: s.campaigns.map((c) => (c.id === s.activeCampaignId ? fn(c) : c)),
            undoStack,
            lastUndoPushAt: now,
          }
        })

      return {
        ...initialData(),
        tool: 'select',
        pendingEntityType: 'ort',
        pendingEntityFields: {},
        selectedEntityId: null,
        selectedIds: [],
        placingEntityId: null,
        placingLayerId: null,
        viewLayerId: null,
        viewLayerNonce: 0,
        fitToViewRequest: 0,
        undoStack: [],
        lastUndoPushAt: 0,
        timeOfDay: 12 * 60,
        currentDay: 1,
        // Vormerkungen haben ihre eigene Uhrzeit und bleiben davon unberuehrt.
        setTimeOfDay: (minutes) =>
          set({ timeOfDay: Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(minutes))) }),
        // Der Kalendertag wechselt den ganzen Ablauf - Vormerkungen sind dann hinfaellig.
        setCurrentDay: (day) => set({ currentDay: Math.max(0, Math.round(day)), draftPos: {} }),

        // ---------- Untere Leiste ----------
        bottomPanel: null,
        bottomPanelHeight: BOTTOM_PANEL_DEFAULT,
        bottomPanelAuto: true,
        bottomPanelPx: 0,
        setBottomPanelPx: (px) => set({ bottomPanelPx: px }),
        // Frisch geoeffnet passt sich die Hoehe wieder dem Inhalt an.
        toggleBottomPanel: (panel) =>
          set((s) => ({ bottomPanel: s.bottomPanel === panel ? null : panel, bottomPanelAuto: true })),
        setBottomPanel: (panel) => set({ bottomPanel: panel, bottomPanelAuto: true }),
        // Am Griff gezogen: ab jetzt gilt die eingestellte Hoehe.
        setBottomPanelHeight: (percent) =>
          set({
            bottomPanelHeight: Math.max(BOTTOM_PANEL_MIN, Math.min(BOTTOM_PANEL_MAX, percent)),
            bottomPanelAuto: false,
          }),

        // ---------- DM-Werkzeuge ----------
        toolsOpen: false,
        toolsTab: 'wuerfel',
        setToolsOpen: (open) => set({ toolsOpen: open }),
        setToolsTab: (tab) => set({ toolsTab: tab }),

        // ---------- Feinschliff (Phase 6) ----------
        tableMode: false,
        fogEditing: false,
        fogBrush: 160,
        setTableMode: (on) =>
          set({
            tableMode: on,
            // Im Tischmodus die Bearbeitungs-Overlays schliessen.
            tool: 'select',
            placingEntityId: null,
            toolsOpen: on ? false : get().toolsOpen,
            bottomPanel: on ? null : get().bottomPanel,
            fogEditing: false,
            selectedEntityId: on ? null : get().selectedEntityId,
            selectedIds: on ? [] : get().selectedIds,
          }),
        setFogEditing: (on) => set({ fogEditing: on, tool: 'select' }),
        // Untergrenze bewusst klein: Auf einer eingebetteten Kampfkarte muessen auch
        // einzelne Raeume aufdeckbar sein, nicht nur grobe Flaechen.
        setFogBrush: (r) => set({ fogBrush: Math.max(4, Math.min(500, r)) }),

        // Sitzungsnotizen
        addSession: () => {
          const id = uid('s-')
          const session: Session = {
            id,
            title: `Sitzung ${get().activeCampaign().sessions.length + 1}`,
            inGameDate: '',
            body: '',
            refs: [],
            createdAt: Date.now(),
          }
          patchActive((c) => ({ ...c, sessions: [session, ...c.sessions] }))
          return id
        },

        updateSession: (id, patch) =>
          patchActive((c) => ({
            ...c,
            sessions: c.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
          })),

        deleteSession: (id) =>
          patchActive((c) => ({ ...c, sessions: c.sessions.filter((s) => s.id !== id) })),

        // ---------- Kampagnen ----------
        activeCampaign: () => {
          const s = get()
          return s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0]
        },

        addCampaign: (name) => {
          const c = makeCampaign(name.trim() || 'Neue Kampagne')
          set((s) => ({
            campaigns: [...s.campaigns, c],
            activeCampaignId: c.id,
            selectedEntityId: null,
            selectedIds: [],
            undoStack: [],
            viewLayerId: null,
          }))
        },

        renameCampaign: (id, name) =>
          set((s) => ({
            campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, name } : c)),
          })),

        updateCampaignDescription: (id, description) =>
          set((s) => ({
            campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, description } : c)),
          })),

        deleteCampaign: (id) =>
          set((s) => {
            if (s.campaigns.length <= 1) return s // letzte Kampagne bleibt bestehen
            const campaigns = s.campaigns.filter((c) => c.id !== id)
            const activeCampaignId =
              s.activeCampaignId === id ? campaigns[0].id : s.activeCampaignId
            return { campaigns, activeCampaignId, selectedEntityId: null, selectedIds: [], undoStack: [], viewLayerId: null }
          }),

        setActiveCampaign: (id) =>
          set({ activeCampaignId: id, selectedEntityId: null, selectedIds: [], undoStack: [], tool: 'select', viewLayerId: null }),

        addMusicEntry: (label, url) => {
          const id = uid('mus-')
          patchActive((c) => ({
            ...c,
            music: [{ id, label: label.trim() || 'Musik', url: url.trim() }, ...c.music],
          }))
          return id
        },

        removeMusicEntry: (id) =>
          patchActive((c) => ({ ...c, music: c.music.filter((m) => m.id !== id) })),

        importCampaign: (campaign) =>
          set((s) => {
            let camp = normalizeCampaign(campaign)
            if (s.campaigns.some((c) => c.id === camp.id)) camp = { ...camp, id: uid('camp-') }
            return {
              campaigns: [...s.campaigns, camp],
              activeCampaignId: camp.id,
              selectedEntityId: null,
              selectedIds: [],
              undoStack: [],
              fightEventId: null,
              viewLayerId: null,
            }
          }),

        replaceAllData: (data) =>
          set(() => {
            const campaigns = (data.campaigns ?? []).map(normalizeCampaign)
            if (campaigns.length === 0) return {}
            const activeCampaignId = campaigns.some((c) => c.id === data.activeCampaignId)
              ? data.activeCampaignId
              : campaigns[0].id
            return {
              campaigns,
              activeCampaignId,
              selectedEntityId: null,
              selectedIds: [],
              undoStack: [],
              fightEventId: null,
              viewLayerId: null,
            }
          }),

        // ---------- Ebenen ----------
        activeLayer: () => {
          const c = get().activeCampaign()
          return c.layers.find((l) => l.id === c.activeLayerId) ?? c.layers[0]
        },

        setActiveLayer: (id) => {
          patchActive((c) => ({ ...c, activeLayerId: id }))
          // Der Pinsel gehoert zur Ebene, auf der er aufgedeckt hat - beim Wechsel endet er,
          // sonst malte man auf einer neuen Karte weiter, ohne es gewollt zu haben.
          set({ viewLayerId: null, fogEditing: false })
        },

        goToLayer: (layerId) => {
          const c = get().activeCampaign()
          let root = layerId
          let current = c.layers.find((l) => l.id === root)
          while (current?.embed) {
            root = current.embed.parentLayerId
            current = c.layers.find((l) => l.id === root)
          }
          if (root !== c.activeLayerId) get().setActiveLayer(root)
          set((s) => ({ viewLayerId: layerId === root ? null : layerId, viewLayerNonce: s.viewLayerNonce + 1 }))
        },

        goToEntity: (entityId) => {
          const s = get()
          const entity = s.activeCampaign().entities.find((e) => e.id === entityId)
          if (!entity) return
          const at = placementAt(entity, s.timeOfDay, s.currentDay)
          if (at) s.goToLayer(at.layerId)
        },

        /**
         * Kartenbild (aus)tauschen. Hat das neue Bild andere Abmessungen als das alte, werden
         * Nebel, Objekte darauf und darin eingebettete Karten proportional mitskaliert, damit
         * nichts ausserhalb der neuen Karte landet und die Hierarchie erhalten bleibt.
         */
        setLayerImage: (id, imageUrl, width, height) =>
          patchActive((c) => {
            const layer = c.layers.find((l) => l.id === id)
            if (!layer) return c
            const sx = width / layer.width
            const sy = height / layer.height
            const rescaled = rescaleLayerContent(c, id, sx, sy)
            return {
              ...rescaled,
              layers: rescaled.layers.map((l) => (l.id === id ? { ...l, imageUrl, width, height } : l)),
            }
          }),

        resetLayerImage: (id) =>
          patchActive((c) => ({
            ...c,
            layers: c.layers.map((l) =>
              l.id === id ? { ...l, imageUrl: null, width: 2000, height: 1400 } : l,
            ),
          })),

        /**
         * Kartengroesse per Eck-Ziehpunkt aendern; Markierungen, Nebel und darin eingebettete
         * Karten werden proportional mitskaliert.
         */
        resizeLayer: (id, width, height) =>
          patchActive((c) => {
            const layer = c.layers.find((l) => l.id === id)
            if (!layer) return c
            const sx = width / layer.width
            const sy = height / layer.height
            const rescaled = rescaleLayerContent(c, id, sx, sy)
            return {
              ...rescaled,
              layers: rescaled.layers.map((l) => (l.id === id ? { ...l, width, height } : l)),
            }
          }),

        addLayer: (name) => {
          const layer = makeLayer(name.trim() || 'Neue Ebene')
          // Wechselt bewusst NICHT die aktive Ebene: neue Karten werden (vom Aufrufer) direkt
          // in die gerade betrachtete Karte eingebettet, man bleibt in der Wurzelkarten-Instanz.
          patchActive((c) => ({ ...c, layers: [...c.layers, layer] }))
          set({ selectedEntityId: null, selectedIds: [] })
          return layer.id
        },

        renameLayer: (id, name) =>
          patchActive((c) => ({
            ...c,
            layers: c.layers.map((l) => (l.id === id ? { ...l, name } : l)),
          })),

        deleteLayer: (id) =>
          patchActive((c) => {
            if (c.layers.length <= 1) return c // letzte Ebene bleibt bestehen
            const layers = c.layers
              .filter((l) => l.id !== id)
              // Eingebettete Karten, deren Eltern-Ebene geloescht wird, werden zu eigenstaendigen Ebenen.
              .map((l) => (l.embed?.parentLayerId === id ? { ...l, embed: null } : l))
            const activeLayerId = c.activeLayerId === id ? layers[0].id : c.activeLayerId
            // Platzierungen und Unterkarten-Verweise auf die geloeschte Ebene bereinigen -
            // auch Timestones, die auf diese Karte zeigten. Sie blieben sonst als Punkte
            // ohne Ort im Tagesablauf stehen.
            const entities = c.entities.map((e) => ({
              ...e,
              placement: e.placement?.layerId === id ? null : e.placement,
              subMapId: e.subMapId === id ? null : e.subMapId,
              schedule: e.schedule.filter((s) => (s.layerId ?? e.placement?.layerId) !== id),
            }))
            return { ...c, layers, activeLayerId, entities }
          }),

        embedLayer: (id, placement) =>
          patchActive((c) => ({
            ...c,
            layers: c.layers.map((l) => (l.id === id ? { ...l, embed: placement } : l)),
          })),

        setEmbedRect: (id, x, y, width, height) =>
          patchActive((c) => ({
            ...c,
            layers: c.layers.map((l) =>
              l.id === id && l.embed ? { ...l, embed: { ...l.embed, x, y, width, height } } : l,
            ),
          })),

        setLayerFog: (id, enabled) => {
          patchActive((c) => ({
            ...c,
            layers: c.layers.map((l) => (l.id === id ? { ...l, fogEnabled: enabled } : l)),
          }))
          // Ohne Nebel gibt es auch keinen Pinsel: Der Knopf dazu verschwindet mit dem
          // Haken, ein noch aktiver Pinsel liesse sich danach nirgends mehr abschalten.
          if (!enabled) set({ fogEditing: false })
        },

        addReveal: (layerId, x, y, r) =>
          patchActive((c) => ({
            ...c,
            layers: c.layers.map((l) =>
              l.id === layerId ? { ...l, reveals: [...l.reveals, { x, y, r }] } : l,
            ),
          })),

        clearReveals: (layerId) =>
          patchActive((c) => ({
            ...c,
            layers: c.layers.map((l) => (l.id === layerId ? { ...l, reveals: [] } : l)),
          })),

        // ---------- Entitaeten ----------
        addEntity: ({ type, placement, name, fields }) => {
          const id = uid('e-')
          const entity: Entity = {
            id,
            type,
            name: name ?? standardName(type, get().activeCampaign().entities, fields),
            description: '',
            secret: '',
            visibility: 'dm',
            placement: placement ?? null,
            subMapId: null,
            imageUrl: null,
            thumbUrl: null,
            thumbCrop: null,
            links: [],
            fields: fields ?? {},
            decision: type === 'entscheidung' ? emptyDecision() : null,
            event: type === 'ereignis' ? emptyEvent() : null,
            day: null,
            schedule: [],
            createdAt: Date.now(),
          }
          patchActive((c) => ({ ...c, entities: [...c.entities, entity] }))
          set({ selectedEntityId: id, selectedIds: [id] })
          return id
        },

        updateEntity: (id, patch) =>
          patchActive((c) => ({
            ...c,
            entities: c.entities.map((e) => {
              if (e.id !== id) return e
              const next = { ...e, ...patch }
              // Beim Wechsel des Typs die passende Struktur anlegen.
              if (next.type === 'entscheidung' && !next.decision) next.decision = emptyDecision()
              if (next.type === 'ereignis' && !next.event) next.event = emptyEvent()
              return next
            }),
          })),

        setEntityField: (id, key, value) =>
          patchActive((c) => ({
            ...c,
            entities: c.entities.map((e) =>
              e.id === id ? { ...e, fields: { ...e.fields, [key]: value } } : e,
            ),
          })),

        deleteEntity: (id) => {
          patchActive((c) => ({
            ...c,
            entities: c.entities
              // Entitaet entfernen ...
              .filter((e) => e.id !== id)
              // ... und alle Verknuepfungen auf sie loeschen.
              .map((e) => ({ ...e, links: e.links.filter((l) => l.targetId !== id) })),
          }))
          set((s) => ({
            selectedEntityId: s.selectedEntityId === id ? null : s.selectedEntityId,
            selectedIds: s.selectedIds.filter((x) => x !== id),
          }))
        },

        selectEntity: (id) =>
          set((s) => ({
            selectedEntityId: id,
            selectedIds: id ? [id] : [],
            ...deselectPatch(s, id !== null),
          })),
        setSelectedIds: (ids) =>
          set((s) => ({
            selectedIds: ids,
            selectedEntityId: ids.length ? ids[ids.length - 1] : null,
            ...deselectPatch(s, ids.length > 0),
          })),
        toggleSelectedId: (id) =>
          set((s) => {
            const has = s.selectedIds.includes(id)
            const next = has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id]
            return { selectedIds: next, selectedEntityId: next.length ? next[next.length - 1] : null }
          }),

        addLink: (fromId, targetId, relation) => {
          if (fromId === targetId) return
          patchActive((c) => ({
            ...c,
            entities: c.entities.map((e) => {
              if (e.id !== fromId) return e
              const exists = e.links.some(
                (l) => l.targetId === targetId && l.relation === relation,
              )
              return exists ? e : { ...e, links: [...e.links, { targetId, relation }] }
            }),
          }))
        },

        removeLink: (fromId, targetId, relation) =>
          patchActive((c) => ({
            ...c,
            entities: c.entities.map((e) =>
              e.id === fromId
                ? {
                    ...e,
                    links: e.links.filter(
                      (l) => !(l.targetId === targetId && l.relation === relation),
                    ),
                  }
                : e,
            ),
          })),

        setPlacement: (id, placement) =>
          patchActive((c) => ({
            ...c,
            entities: c.entities.map((e) => (e.id === id ? { ...e, placement } : e)),
          })),

        moveEntity: (id, dxWorld, dyWorld) =>
          patchActive((c) => ({
            ...c,
            entities: c.entities.map((e) =>
              e.id === id && e.placement
                ? {
                    ...e,
                    placement: {
                      ...e.placement,
                      x: e.placement.x + dxWorld,
                      y: e.placement.y + dyWorld,
                    },
                  }
                : e,
            ),
          })),

        // ---------- Tagesablauf als Timestones ----------
        addTimestone: (entityId, init) => {
          const s = get()
          const entity = s.activeCampaign().entities.find((e) => e.id === entityId)
          if (!entity?.placement) return null
          const time = init?.time ?? s.timeOfDay
          const day = init?.day ?? null
          // Zur selben Uhrzeit auf derselben Ebene gibt es nur einen Punkt - ein zweiter
          // waere nie erreichbar. Ein erneutes Setzen aktualisiert also den vorhandenen.
          const existing = entity.schedule.find((k) => k.time === time && k.day === day)
          // Ohne Angabe haelt der Punkt fest, wo das Objekt zu dieser Zeit ohnehin steht.
          // Karte und Koordinaten stammen immer aus derselben Quelle - sonst laege der Punkt
          // bei den Koordinaten der einen auf der anderen Karte.
          const current = activeTimestone(entity.schedule, time, s.currentDay)
          const from =
            init?.x != null && init?.y != null
              ? { layerId: init.layerId ?? entity.placement.layerId, x: init.x, y: init.y }
              : current
                ? { layerId: current.layerId ?? entity.placement.layerId, x: current.x, y: current.y }
                : entity.placement
          const key: Timestone = {
            id: existing?.id ?? uid('key-'),
            time,
            layerId: from.layerId,
            x: from.x,
            y: from.y,
            label: init?.label ?? existing?.label ?? '',
            day,
          }
          patchActive((c) => ({
            ...c,
            entities: c.entities.map((e) =>
              e.id !== entityId
                ? e
                : {
                    ...e,
                    schedule: existing
                      ? e.schedule.map((k) => (k.id === existing.id ? key : k))
                      : [...e.schedule, key],
                  },
            ),
          }))
          // Die Vormerkung dieses Objekts ist nun festgehalten.
          set((st) => {
            const rest = { ...st.draftPos }
            delete rest[entityId]
            return { draftPos: rest }
          })
          return key.id
        },

        draftPos: {},
        setDraftPos: (entityId, x, y, layerId) =>
          set((s) => {
            // Die Uhrzeit einer laufenden Vormerkung bleibt beim Weiterschieben stehen.
            const running = s.draftPos[entityId]
            if (running) {
              return { draftPos: { ...s.draftPos, [entityId]: { ...running, x, y, layerId } } }
            }
            // Vorschlag fuer eine neue: die eingestellte Uhrzeit - aber nicht eine, auf der
            // schon ein Punkt liegt. Sonst uebernaehme das Bestaetigen ungewollt den
            // vorhandenen, und aus drei Stationen hintereinander wuerde immer wieder dieselbe.
            // Wer einen Punkt bewusst ersetzen will, traegt seine Uhrzeit von Hand ein.
            const entity = s.activeCampaign().entities.find((e) => e.id === entityId)
            const taken = new Set((entity?.schedule ?? []).filter((k) => k.day == null).map((k) => k.time))
            let time = s.timeOfDay
            while (taken.has(time) && time < MINUTES_PER_DAY - 1) {
              time = Math.min(MINUTES_PER_DAY - 1, time + 15)
            }
            return { draftPos: { ...s.draftPos, [entityId]: { x, y, layerId, time } } }
          }),
        setDraftTime: (entityId, minutes) =>
          set((s) => {
            const draft = s.draftPos[entityId]
            if (!draft) return {}
            const time = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(minutes)))
            return { draftPos: { ...s.draftPos, [entityId]: { ...draft, time } } }
          }),
        commitDraft: (entityId, day = null) => {
          const draft = get().draftPos[entityId]
          if (!draft) return null
          return get().addTimestone(entityId, {
            time: draft.time,
            day,
            layerId: draft.layerId,
            x: draft.x,
            y: draft.y,
          })
        },
        clearDraftPos: (entityId) =>
          set((s) => {
            if (!entityId) return { draftPos: {} }
            const rest = { ...s.draftPos }
            delete rest[entityId]
            return { draftPos: rest }
          }),

        updateTimestone: (entityId, scheduleId, patch) =>
          patchActive((c) => ({
            ...c,
            entities: c.entities.map((e) =>
              e.id === entityId
                ? { ...e, schedule: e.schedule.map((s) => (s.id === scheduleId ? { ...s, ...patch } : s)) }
                : e,
            ),
          })),

        removeTimestone: (entityId, scheduleId) =>
          patchActive((c) => ({
            ...c,
            entities: c.entities.map((e) =>
              e.id === entityId ? { ...e, schedule: e.schedule.filter((s) => s.id !== scheduleId) } : e,
            ),
          })),

        moveTimestone: (entityId, scheduleId, dxWorld, dyWorld) =>
          patchActive((c) => ({
            ...c,
            entities: c.entities.map((e) =>
              e.id === entityId
                ? {
                    ...e,
                    schedule: e.schedule.map((s) =>
                      s.id === scheduleId ? { ...s, x: s.x + dxWorld, y: s.y + dyWorld } : s,
                    ),
                  }
                : e,
            ),
          })),

        // ---------- Entscheidungen ----------
        updateDecision: (entityId, patch) =>
          patchDecision(patchActive, entityId, (d) => ({ ...d, ...patch })),

        addOption: (entityId) =>
          patchDecision(patchActive, entityId, (d) =>
            d.options.length >= 5
              ? d
              : {
                  ...d,
                  options: [
                    ...d.options,
                    {
                      id: uid('opt-'),
                      label: `Option ${d.options.length + 1}`,
                      description: '',
                      effects: [],
                      nextDecisionId: null,
                      undo: null,
                    },
                  ],
                },
          ),

        updateOption: (entityId, optionId, patch) =>
          patchDecision(patchActive, entityId, (d) => ({
            ...d,
            options: d.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)),
          })),

        removeOption: (entityId, optionId) =>
          patchActive((c) => {
            const dec = c.entities.find((e) => e.id === entityId)?.decision
            if (!dec) return c
            const opt = dec.options.find((o) => o.id === optionId)
            let entities = c.entities
            if (opt?.undo) entities = revertEffects(entities, opt.undo)
            return {
              ...c,
              entities: entities.map((e) =>
                e.id === entityId && e.decision
                  ? {
                      ...e,
                      decision: {
                        ...e.decision,
                        chosenOptionId:
                          e.decision.chosenOptionId === optionId ? null : e.decision.chosenOptionId,
                        options: e.decision.options.filter((o) => o.id !== optionId),
                      },
                    }
                  : e,
              ),
            }
          }),

        addEffect: (entityId, optionId, effect) =>
          patchDecision(patchActive, entityId, (d) => ({
            ...d,
            options: d.options.map((o) =>
              o.id === optionId ? { ...o, effects: [...o.effects, effect] } : o,
            ),
          })),

        updateEffect: (entityId, optionId, effect) =>
          patchDecision(patchActive, entityId, (d) => ({
            ...d,
            options: d.options.map((o) =>
              o.id === optionId
                ? { ...o, effects: o.effects.map((ef) => (ef.id === effect.id ? effect : ef)) }
                : o,
            ),
          })),

        removeEffect: (entityId, optionId, effectId) =>
          patchDecision(patchActive, entityId, (d) => ({
            ...d,
            options: d.options.map((o) =>
              o.id === optionId ? { ...o, effects: o.effects.filter((ef) => ef.id !== effectId) } : o,
            ),
          })),

        chooseOption: (entityId, optionId) =>
          patchActive((c) => {
            const dec = c.entities.find((e) => e.id === entityId)?.decision
            if (!dec) return c
            let entities = c.entities
            const undoUpdates: Record<string, UndoEntry[] | null> = {}
            let chosen: string | null = dec.chosenOptionId

            // Bisher gewaehlte Option zuruecknehmen.
            if (dec.chosenOptionId) {
              const prev = dec.options.find((o) => o.id === dec.chosenOptionId)
              if (prev?.undo) entities = revertEffects(entities, prev.undo)
              undoUpdates[dec.chosenOptionId] = null
              chosen = null
            }
            // Neue Option anwenden (ausser man tippt dieselbe erneut an = abwaehlen).
            if (optionId !== dec.chosenOptionId) {
              const opt = dec.options.find((o) => o.id === optionId)
              if (opt) {
                const res = applyEffects(entities, opt.effects)
                entities = res.entities
                undoUpdates[optionId] = res.undo
                chosen = optionId
              }
            }
            return {
              ...c,
              entities: entities.map((e) =>
                e.id === entityId && e.decision
                  ? {
                      ...e,
                      decision: {
                        ...e.decision,
                        chosenOptionId: chosen,
                        options: e.decision.options.map((o) =>
                          o.id in undoUpdates ? { ...o, undo: undoUpdates[o.id] } : o,
                        ),
                      },
                    }
                  : e,
              ),
            }
          }),

        clearChoice: (entityId) =>
          patchActive((c) => {
            const dec = c.entities.find((e) => e.id === entityId)?.decision
            if (!dec || !dec.chosenOptionId) return c
            const prev = dec.options.find((o) => o.id === dec.chosenOptionId)
            let entities = c.entities
            if (prev?.undo) entities = revertEffects(entities, prev.undo)
            return {
              ...c,
              entities: entities.map((e) =>
                e.id === entityId && e.decision
                  ? {
                      ...e,
                      decision: {
                        ...e.decision,
                        chosenOptionId: null,
                        options: e.decision.options.map((o) =>
                          o.id === prev?.id ? { ...o, undo: null } : o,
                        ),
                      },
                    }
                  : e,
              ),
            }
          }),

        // ---------- Reiche Ereignisse / Encounter ----------
        updateEvent: (entityId, patch) =>
          patchEvent(patchActive, entityId, (ev) => ({ ...ev, ...patch })),

        addBlock: (entityId, block) =>
          patchEvent(patchActive, entityId, (ev) => ({ ...ev, blocks: [...ev.blocks, block] })),

        updateBlock: (entityId, block) =>
          patchEvent(patchActive, entityId, (ev) => ({
            ...ev,
            blocks: ev.blocks.map((b) => (b.id === block.id ? block : b)),
          })),

        removeBlock: (entityId, blockId) =>
          patchEvent(patchActive, entityId, (ev) => ({
            ...ev,
            blocks: ev.blocks.filter((b) => b.id !== blockId),
          })),

        setBattleMap: (entityId, url) =>
          patchEvent(patchActive, entityId, (ev) => ({ ...ev, battleMapUrl: url })),

        addCreature: (entityId, creature) =>
          patchEvent(patchActive, entityId, (ev) => ({
            ...ev,
            creatures: [
              ...ev.creatures,
              {
                id: uid('cr-'),
                name: creature?.name ?? `Kreatur ${ev.creatures.length + 1}`,
                initiative: creature?.initiative ?? null,
                hp: creature?.hp ?? 10,
                maxHp: creature?.maxHp ?? creature?.hp ?? 10,
                ac: creature?.ac ?? 12,
                speed: creature?.speed ?? '',
                abilities: creature?.abilities ?? '',
                imageUrl: creature?.imageUrl ?? null,
                isPC: creature?.isPC ?? false,
              },
            ],
          })),

        updateCreature: (entityId, creatureId, patch) =>
          patchEvent(patchActive, entityId, (ev) => ({
            ...ev,
            creatures: ev.creatures.map((cr) => (cr.id === creatureId ? { ...cr, ...patch } : cr)),
          })),

        removeCreature: (entityId, creatureId) =>
          patchEvent(patchActive, entityId, (ev) => ({
            ...ev,
            creatures: ev.creatures.filter((cr) => cr.id !== creatureId),
          })),

        duplicateCreature: (entityId, creatureId) =>
          patchEvent(patchActive, entityId, (ev) => {
            const src = ev.creatures.find((cr) => cr.id === creatureId)
            if (!src) return ev
            const copy: Creature = { ...src, id: uid('cr-'), initiative: null }
            const idx = ev.creatures.findIndex((cr) => cr.id === creatureId)
            const creatures = [...ev.creatures]
            creatures.splice(idx + 1, 0, copy)
            return { ...ev, creatures }
          }),

        fightEventId: null,
        setFightEvent: (id) => set({ fightEventId: id }),

        // ---------- UI ----------
        setTool: (t) => set({ tool: t }),
        setPendingEntityType: (t) => set({ pendingEntityType: t, pendingEntityFields: {} }),
        setPendingEntityFields: (fields) => set({ pendingEntityFields: fields }),
        setPlacingEntity: (id) => set({ placingEntityId: id, tool: 'select' }),
        setPlacingLayer: (id) => set({ placingLayerId: id, tool: 'select' }),
        setViewLayerId: (id, zoom = true) =>
          set((s) => ({
            viewLayerId: id,
            // Nur der erhoehte Nonce loest in MapCanvas eine Kartenfahrt aus.
            viewLayerNonce: zoom ? s.viewLayerNonce + 1 : s.viewLayerNonce,
          })),
        requestFitToView: () => set((s) => ({ fitToViewRequest: s.fitToViewRequest + 1 })),

        undo: () =>
          set((s) => {
            if (s.undoStack.length === 0) return {}
            const prev = s.undoStack[s.undoStack.length - 1]
            return {
              campaigns: s.campaigns.map((c) => (c.id === s.activeCampaignId ? prev : c)),
              undoStack: s.undoStack.slice(0, -1),
              // Naechste Aenderung soll sofort einen neuen Schritt anlegen, nicht mit
              // dem Undo selbst zusammengefasst werden.
              lastUndoPushAt: 0,
            }
          }),
      }
    },
    {
      name: 'dnd-weltkarte',
      version: 10,
      // Nur Daten persistieren, keinen fluechtigen UI-Zustand. Uhrzeit und Kampagnentag
      // gehoeren dazu: Sie sind der Spielstand der laufenden Sitzung, kein Fensterzustand -
      // nach einem Neuladen soll die Runde dort weitergehen, wo sie stand.
      partialize: (s): PersistedState => ({
        campaigns: s.campaigns,
        activeCampaignId: s.activeCampaignId,
        timeOfDay: s.timeOfDay,
        currentDay: s.currentDay,
      }),
      // Migration ueber alle Versionen und Normalisierung der Entitaeten.
      migrate: (persisted: unknown): PersistedState => {
        const state = persisted as Record<string, unknown> | undefined
        let data: AppData
        if (state && Array.isArray(state.campaigns)) {
          // Bereits v2/v3
          data = state as unknown as AppData
        } else {
          // Phase 1 (flache Marker) -> Kampagne mit Entitaeten
          const layers = (state?.layers as MapLayer[]) ?? [makeLayer()]
          const activeLayerId = (state?.activeLayerId as string) ?? layers[0].id
          const oldMarkers = (state?.markers as OldMarker[]) ?? []
          const entities = oldMarkers.map((m) =>
            normalizeEntity({
              ...m,
              description: m.description ?? '',
              placement: { layerId: activeLayerId, x: m.x, y: m.y },
            }),
          )
          const campaign: Campaign = {
            id: uid('camp-'),
            name: 'Meine Kampagne',
            description: '',
            createdAt: Date.now(),
            layers,
            activeLayerId,
            entities,
            sessions: [],
            music: [],
          }
          data = { campaigns: [campaign], activeCampaignId: campaign.id }
        }
        // Entitaeten (v3), Sitzungen (v4), Ebenen-Nebel (v5), Events (v6) sicherstellen.
        // Aeltere Staende kannten Uhrzeit und Tag noch nicht - dann gelten die Startwerte.
        return {
          ...data,
          campaigns: data.campaigns.map(normalizeCampaign),
          timeOfDay: typeof state?.timeOfDay === 'number' ? state.timeOfDay : 12 * 60,
          currentDay: typeof state?.currentDay === 'number' ? state.currentDay : 1,
        }
      },
    },
  ),
)

interface OldMarker {
  id: string
  type: EntityType
  name: string
  description?: string
  x: number
  y: number
  visibility?: 'dm' | 'spieler'
  createdAt?: number
}

/**
 * Timestone eines Tagesablaufs auffuellen. Frueher waren das Zeitfenster mit
 * timeStart/timeEnd; deren Beginn wird zum Zeitpunkt des Punktes, das Ende ergibt sich
 * nun aus dem jeweils naechsten Punkt.
 */
function normalizeTimestone(s: Partial<Timestone> & { timeStart?: number }): Timestone {
  return {
    id: s.id ?? uid('key-'),
    time: s.time ?? s.timeStart ?? 0,
    // Aeltere Punkte lagen immer auf der Karte der Basis-Platzierung und haben darum keine
    // eigene Angabe; sie bleibt offen und wird bei der Anzeige von dort ergaenzt.
    layerId: s.layerId,
    x: s.x ?? 0,
    y: s.y ?? 0,
    // "Start" wurde eine Zeit lang mitgespeichert und blieb dadurch auch stehen, wenn der
    // Punkt laengst woanders lag. Heute wird es aus der Position abgeleitet (isAtBase).
    label: s.label === 'Start' ? '' : s.label ?? '',
    day: s.day ?? null,
  }
}

/** Fuellt fehlende Felder einer (evtl. aelteren) Entitaet mit Standardwerten. */
function normalizeEntity(e: Partial<Entity> & { id: string; type: EntityType; name: string }): Entity {
  return {
    id: e.id,
    type: e.type,
    name: e.name,
    description: e.description ?? '',
    secret: e.secret ?? '',
    visibility: e.visibility ?? 'dm',
    placement: e.placement ?? null,
    subMapId: e.subMapId ?? null,
    imageUrl: e.imageUrl ?? null,
    // Aeltere Objekte kannten noch kein Miniaturbild; Pins/Listen fallen dann auf das
    // volle Portraet zurueck, bis das Bild einmal neu gesetzt wird.
    thumbUrl: e.thumbUrl ?? null,
    thumbCrop: e.thumbCrop ?? null,
    links: e.links ?? [],
    fields: e.fields ?? {},
    decision: e.decision ?? (e.type === 'entscheidung' ? emptyDecision() : null),
    event: e.event ?? (e.type === 'ereignis' ? emptyEvent() : null),
    day: e.day ?? null,
    schedule: (e.schedule ?? []).map(normalizeTimestone),
    createdAt: e.createdAt ?? Date.now(),
  }
}

/** Fuellt fehlende Felder einer Kampagne auf (Entitaeten, Ebenen, Sitzungen). */
function normalizeCampaign(c: Campaign): Campaign {
  const validIds = new Set((c.layers ?? []).map((l) => l.id))
  const layers = (c.layers && c.layers.length > 0 ? c.layers : [makeLayer()]).map((l) => ({
    ...l,
    fogEnabled: l.fogEnabled ?? false,
    reveals: l.reveals ?? [],
    // Eingebettete Karte nur behalten, wenn die referenzierte Eltern-Ebene noch existiert.
    embed: l.embed && validIds.has(l.embed.parentLayerId) ? l.embed : null,
  }))
  return {
    ...c,
    layers,
    activeLayerId: layers.some((l) => l.id === c.activeLayerId) ? c.activeLayerId : layers[0].id,
    entities: (c.entities ?? []).map(normalizeEntity),
    sessions: c.sessions ?? [],
    music: c.music ?? [],
  }
}

/** Die decision-Struktur einer Entitaet in der aktiven Kampagne patchen. */
function patchDecision(
  patchActive: (fn: (c: Campaign) => Campaign) => void,
  entityId: string,
  fn: (d: DecisionData) => DecisionData,
) {
  patchActive((c) => ({
    ...c,
    entities: c.entities.map((e) =>
      e.id === entityId && e.decision ? { ...e, decision: fn(e.decision) } : e,
    ),
  }))
}

/** Die event-Struktur einer Entitaet in der aktiven Kampagne patchen. */
function patchEvent(
  patchActive: (fn: (c: Campaign) => Campaign) => void,
  entityId: string,
  fn: (ev: EventData) => EventData,
) {
  patchActive((c) => ({
    ...c,
    entities: c.entities.map((e) =>
      e.id === entityId && e.event ? { ...e, event: fn(e.event) } : e,
    ),
  }))
}

function mapEntity(entities: Entity[], id: string, fn: (e: Entity) => Entity): Entity[] {
  return entities.map((e) => (e.id === id ? fn(e) : e))
}

function hasLink(e: Entity, toId: string, relation: RelationType): boolean {
  return e.links.some((l) => l.targetId === toId && l.relation === relation)
}

/** Folgen einer Option anwenden; liefert neue Entitaeten + Rueckgaengig-Info. */
function applyEffects(entities: Entity[], effects: Effect[]): { entities: Entity[]; undo: UndoEntry[] } {
  let out = entities
  const undo: UndoEntry[] = []
  for (const eff of effects) {
    if (eff.kind === 'set_field') {
      const target = out.find((e) => e.id === eff.targetId)
      if (!target) continue
      undo.push({ kind: 'field', targetId: eff.targetId, key: eff.key, prev: target.fields[eff.key] })
      out = mapEntity(out, eff.targetId, (e) => ({ ...e, fields: { ...e.fields, [eff.key]: eff.value } }))
    } else if (eff.kind === 'reveal') {
      const target = out.find((e) => e.id === eff.targetId)
      if (!target) continue
      undo.push({ kind: 'visibility', targetId: eff.targetId, prev: target.visibility })
      out = mapEntity(out, eff.targetId, (e) => ({ ...e, visibility: eff.value }))
    } else if (eff.kind === 'relation') {
      const from = out.find((e) => e.id === eff.fromId)
      if (!from) continue
      const exists = hasLink(from, eff.toId, eff.relation)
      if (eff.op === 'add' && !exists) {
        undo.push({ kind: 'relation_add', fromId: eff.fromId, toId: eff.toId, relation: eff.relation })
        out = mapEntity(out, eff.fromId, (e) => ({
          ...e,
          links: [...e.links, { targetId: eff.toId, relation: eff.relation }],
        }))
      } else if (eff.op === 'remove' && exists) {
        undo.push({ kind: 'relation_remove', fromId: eff.fromId, toId: eff.toId, relation: eff.relation })
        out = mapEntity(out, eff.fromId, (e) => ({
          ...e,
          links: e.links.filter((l) => !(l.targetId === eff.toId && l.relation === eff.relation)),
        }))
      }
    }
    // 'note': keine Zustandsaenderung
  }
  return { entities: out, undo }
}

/** Angewendete Folgen anhand der Rueckgaengig-Info umkehren. */
function revertEffects(entities: Entity[], undo: UndoEntry[]): Entity[] {
  let out = entities
  for (let i = undo.length - 1; i >= 0; i--) {
    const u = undo[i]
    if (u.kind === 'field') {
      out = mapEntity(out, u.targetId, (e) => {
        const fields = { ...e.fields }
        if (u.prev === undefined) delete fields[u.key]
        else fields[u.key] = u.prev
        return { ...e, fields }
      })
    } else if (u.kind === 'visibility') {
      out = mapEntity(out, u.targetId, (e) => ({ ...e, visibility: u.prev }))
    } else if (u.kind === 'relation_add') {
      out = mapEntity(out, u.fromId, (e) => ({
        ...e,
        links: e.links.filter((l) => !(l.targetId === u.toId && l.relation === u.relation)),
      }))
    } else if (u.kind === 'relation_remove') {
      out = mapEntity(out, u.fromId, (e) =>
        hasLink(e, u.toId, u.relation)
          ? e
          : { ...e, links: [...e.links, { targetId: u.toId, relation: u.relation }] },
      )
    }
  }
  return out
}

const NSC_GESINNUNG_LABELS: Record<string, string> = {
  freund: 'Freund',
  feind: 'Feind',
  neutral: 'Neutrale Kreatur',
  spieler: 'Spieler',
}

function standardName(type: EntityType, existing: Entity[], fields?: Record<string, string>): string {
  if (type === 'nsc') {
    const gesinnung = fields?.gesinnung
    const label = gesinnung ? NSC_GESINNUNG_LABELS[gesinnung] : undefined
    if (label) {
      const count = existing.filter((e) => e.type === 'nsc' && e.fields.gesinnung === gesinnung).length + 1
      return `${label} ${count}`
    }
  }
  const count = existing.filter((e) => e.type === type).length + 1
  const labels: Record<EntityType, string> = {
    ort: 'Neue Umgebung',
    nsc: 'Neuer Charakter',
    fraktion: 'Neue Fraktion',
    ereignis: 'Neues Ereignis',
    quest: 'Neue Quest',
    item: 'Neuer Gegenstand',
    entscheidung: 'Neue Entscheidung',
    gefahr: 'Neue Gefahr',
    schatz: 'Neuer Schatz',
  }
  return `${labels[type]} ${count}`
}
