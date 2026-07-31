import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AppData,
  Campaign,
  Combatant,
  Creature,
  DecisionData,
  DecisionOption,
  Effect,
  Entity,
  EntityType,
  EventBlock,
  EventData,
  MapLayer,
  Placement,
  RelationType,
  Session,
  UndoEntry,
} from '../types'
import { emptyDecision, emptyEvent } from '../types'
import { uid } from '../utils/id'

function makeLayer(name = 'Weltkarte'): MapLayer {
  return {
    id: uid('layer-'),
    name,
    imageUrl: null,
    width: 2000,
    height: 1400,
    fogEnabled: false,
    reveals: [],
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

/** Werkzeug-Modus der Karte. */
export type Tool = 'select' | 'add'

/** Reiter im DM-Werkzeug-Panel. */
export type ToolTab = 'wuerfel' | 'kampf' | 'notizen' | 'zufall' | 'ki' | 'musik'

interface StoreState extends AppData {
  // UI-Zustand (nicht persistiert)
  tool: Tool
  pendingEntityType: EntityType
  selectedEntityId: string | null
  /** Ein vorhandenes (unplatziertes) Objekt wartet auf einen Kartenklick. */
  placingEntityId: string | null
  /** Spieler-Ansicht: DM-Geheimnisse und unentdeckte Objekte ausblenden. */
  playerMode: boolean

  // Zeit (Phase 3)
  /** Tageszeit-Filter aktiv? */
  timeEnabled: boolean
  /** Aktuelle Tageszeit in Minuten (0..1439). */
  timeOfDay: number
  /** Tag/Nacht-Einfaerbung der Karte. */
  dayNight: boolean
  /** Zeitleiste (Kalendertag) eingeblendet? */
  timelineOpen: boolean
  /** Handlungsbaum-Ansicht eingeblendet? */
  storyTreeOpen: boolean
  /** Beziehungsgraph eingeblendet? */
  relationGraphOpen: boolean
  setTimeEnabled: (on: boolean) => void
  setTimeOfDay: (minutes: number) => void
  setDayNight: (on: boolean) => void
  setTimelineOpen: (open: boolean) => void
  setStoryTreeOpen: (open: boolean) => void
  setRelationGraphOpen: (open: boolean) => void

  // DM-Werkzeuge (Phase 5)
  toolsOpen: boolean
  toolsTab: ToolTab
  setToolsOpen: (open: boolean) => void
  setToolsTab: (tab: ToolTab) => void

  // Feinschliff (Phase 6)
  /** Spieltischmodus: aufgeraeumte Live-Ansicht. */
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

  // Kampf-Tracker (nur zur Laufzeit)
  combatants: Combatant[]
  combatRound: number
  combatTurn: number
  combatPlace: string | null
  addCombatant: (input: { name: string; initiative: number; hp: number; maxHp: number; isPC: boolean }) => void
  updateCombatant: (id: string, patch: Partial<Omit<Combatant, 'id'>>) => void
  removeCombatant: (id: string) => void
  sortCombat: () => void
  nextTurn: () => void
  prevTurn: () => void
  resetCombat: () => void
  setCombatPlace: (id: string | null) => void

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
  addMusicEntry: (label: string, url: string) => void
  removeMusicEntry: (id: string) => void

  // Ebenen (der aktiven Kampagne)
  activeLayer: () => MapLayer
  setActiveLayer: (id: string) => void
  setLayerImage: (id: string, imageUrl: string, width: number, height: number) => void
  resetLayerImage: (id: string) => void
  addLayer: (name: string) => void
  renameLayer: (id: string, name: string) => void
  deleteLayer: (id: string) => void
  // Nebel des Krieges (Phase 6)
  setLayerFog: (id: string, enabled: boolean) => void
  addReveal: (layerId: string, x: number, y: number, r: number) => void
  clearReveals: (layerId: string) => void

  // Entitaeten (der aktiven Kampagne)
  addEntity: (input: { type: EntityType; placement?: Placement; name?: string }) => string
  updateEntity: (id: string, patch: Partial<Omit<Entity, 'id' | 'createdAt'>>) => void
  setEntityField: (id: string, key: string, value: string) => void
  deleteEntity: (id: string) => void
  selectEntity: (id: string | null) => void
  addLink: (fromId: string, targetId: string, relation: RelationType) => void
  removeLink: (fromId: string, targetId: string, relation: RelationType) => void
  setPlacement: (id: string, placement: Placement | null) => void
  /** Platzierte Entitaet um ein Weltkoordinaten-Delta verschieben. */
  moveEntity: (id: string, dxWorld: number, dyWorld: number) => void

  // Entscheidungspunkte (Phase 4)
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
  setPlacingEntity: (id: string | null) => void
  setPlayerMode: (on: boolean) => void
}

function initialData(): AppData {
  const campaign = makeCampaign('Meine Kampagne')
  return { campaigns: [campaign], activeCampaignId: campaign.id }
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      /** Aktive Kampagne unveraenderlich patchen. */
      const patchActive = (fn: (c: Campaign) => Campaign) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) => (c.id === s.activeCampaignId ? fn(c) : c)),
        }))

      return {
        ...initialData(),
        tool: 'select',
        pendingEntityType: 'ort',
        selectedEntityId: null,
        placingEntityId: null,
        playerMode: false,
        timeEnabled: false,
        timeOfDay: 12 * 60,
        dayNight: false,
        timelineOpen: false,
        storyTreeOpen: false,
        relationGraphOpen: false,
        setTimeEnabled: (on) => set({ timeEnabled: on }),
        setTimeOfDay: (minutes) => set({ timeOfDay: Math.max(0, Math.min(1439, Math.round(minutes))) }),
        setDayNight: (on) => set({ dayNight: on }),
        setTimelineOpen: (open) => set({ timelineOpen: open }),
        setStoryTreeOpen: (open) => set({ storyTreeOpen: open }),
        setRelationGraphOpen: (open) => set({ relationGraphOpen: open }),

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
            toolsOpen: on ? false : get().toolsOpen,
            timelineOpen: on ? false : get().timelineOpen,
            storyTreeOpen: on ? false : get().storyTreeOpen,
            fogEditing: false,
            selectedEntityId: on ? null : get().selectedEntityId,
          }),
        setFogEditing: (on) => set({ fogEditing: on, tool: 'select' }),
        setFogBrush: (r) => set({ fogBrush: Math.max(30, Math.min(500, r)) }),

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

        // Kampf-Tracker
        combatants: [],
        combatRound: 1,
        combatTurn: 0,
        combatPlace: null,

        addCombatant: (input) =>
          set((s) => ({
            combatants: [...s.combatants, { id: uid('cb-'), ...input }],
          })),

        updateCombatant: (id, patch) =>
          set((s) => ({
            combatants: s.combatants.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          })),

        removeCombatant: (id) =>
          set((s) => {
            const combatants = s.combatants.filter((c) => c.id !== id)
            const combatTurn = Math.min(s.combatTurn, Math.max(0, combatants.length - 1))
            return { combatants, combatTurn }
          }),

        sortCombat: () =>
          set((s) => ({
            combatants: [...s.combatants].sort((a, b) => b.initiative - a.initiative),
            combatTurn: 0,
          })),

        nextTurn: () =>
          set((s) => {
            if (s.combatants.length === 0) return s
            const atEnd = s.combatTurn >= s.combatants.length - 1
            return {
              combatTurn: atEnd ? 0 : s.combatTurn + 1,
              combatRound: atEnd ? s.combatRound + 1 : s.combatRound,
            }
          }),

        prevTurn: () =>
          set((s) => {
            if (s.combatants.length === 0) return s
            const atStart = s.combatTurn <= 0
            return {
              combatTurn: atStart ? s.combatants.length - 1 : s.combatTurn - 1,
              combatRound: atStart ? Math.max(1, s.combatRound - 1) : s.combatRound,
            }
          }),

        resetCombat: () => set({ combatants: [], combatRound: 1, combatTurn: 0, combatPlace: null }),
        setCombatPlace: (id) => set({ combatPlace: id }),

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
            return { campaigns, activeCampaignId, selectedEntityId: null }
          }),

        setActiveCampaign: (id) =>
          set({ activeCampaignId: id, selectedEntityId: null, tool: 'select' }),

        addMusicEntry: (label, url) =>
          patchActive((c) => ({
            ...c,
            music: [{ id: uid('mus-'), label: label.trim() || 'Musik', url: url.trim() }, ...c.music],
          })),

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
              fightEventId: null,
            }
          }),

        replaceAllData: (data) =>
          set(() => {
            const campaigns = (data.campaigns ?? []).map(normalizeCampaign)
            if (campaigns.length === 0) return {}
            const activeCampaignId = campaigns.some((c) => c.id === data.activeCampaignId)
              ? data.activeCampaignId
              : campaigns[0].id
            return { campaigns, activeCampaignId, selectedEntityId: null, fightEventId: null }
          }),

        // ---------- Ebenen ----------
        activeLayer: () => {
          const c = get().activeCampaign()
          return c.layers.find((l) => l.id === c.activeLayerId) ?? c.layers[0]
        },

        setActiveLayer: (id) => patchActive((c) => ({ ...c, activeLayerId: id })),

        setLayerImage: (id, imageUrl, width, height) =>
          patchActive((c) => ({
            ...c,
            layers: c.layers.map((l) =>
              l.id === id ? { ...l, imageUrl, width, height } : l,
            ),
          })),

        resetLayerImage: (id) =>
          patchActive((c) => ({
            ...c,
            layers: c.layers.map((l) =>
              l.id === id ? { ...l, imageUrl: null, width: 2000, height: 1400 } : l,
            ),
          })),

        addLayer: (name) => {
          const layer = makeLayer(name.trim() || 'Neue Ebene')
          patchActive((c) => ({ ...c, layers: [...c.layers, layer], activeLayerId: layer.id }))
          set({ selectedEntityId: null })
        },

        renameLayer: (id, name) =>
          patchActive((c) => ({
            ...c,
            layers: c.layers.map((l) => (l.id === id ? { ...l, name } : l)),
          })),

        deleteLayer: (id) =>
          patchActive((c) => {
            if (c.layers.length <= 1) return c // letzte Ebene bleibt bestehen
            const layers = c.layers.filter((l) => l.id !== id)
            const activeLayerId = c.activeLayerId === id ? layers[0].id : c.activeLayerId
            // Platzierungen und Unterkarten-Verweise auf die geloeschte Ebene bereinigen.
            const entities = c.entities.map((e) => ({
              ...e,
              placement: e.placement?.layerId === id ? null : e.placement,
              subMapId: e.subMapId === id ? null : e.subMapId,
            }))
            return { ...c, layers, activeLayerId, entities }
          }),

        setLayerFog: (id, enabled) =>
          patchActive((c) => ({
            ...c,
            layers: c.layers.map((l) => (l.id === id ? { ...l, fogEnabled: enabled } : l)),
          })),

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
        addEntity: ({ type, placement, name }) => {
          const id = uid('e-')
          const entity: Entity = {
            id,
            type,
            name: name ?? standardName(type, get().activeCampaign().entities),
            description: '',
            secret: '',
            visibility: 'dm',
            placement: placement ?? null,
            subMapId: null,
            imageUrl: null,
            links: [],
            fields: {},
            decision: type === 'entscheidung' ? emptyDecision() : null,
            event: type === 'ereignis' ? emptyEvent() : null,
            day: null,
            timeStart: null,
            timeEnd: null,
            createdAt: Date.now(),
          }
          patchActive((c) => ({ ...c, entities: [...c.entities, entity] }))
          set({ selectedEntityId: id })
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
          set((s) => ({ selectedEntityId: s.selectedEntityId === id ? null : s.selectedEntityId }))
        },

        selectEntity: (id) => set({ selectedEntityId: id }),

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

        // ---------- Entscheidungspunkte ----------
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
        setPendingEntityType: (t) => set({ pendingEntityType: t }),
        setPlacingEntity: (id) => set({ placingEntityId: id, tool: 'select' }),
        setPlayerMode: (on) => set({ playerMode: on, tool: 'select', placingEntityId: null }),
      }
    },
    {
      name: 'dnd-weltkarte',
      version: 8,
      // Nur Daten persistieren, keinen fluechtigen UI-Zustand.
      partialize: (s): AppData => ({
        campaigns: s.campaigns,
        activeCampaignId: s.activeCampaignId,
      }),
      // Migration ueber alle Versionen und Normalisierung der Entitaeten.
      migrate: (persisted: unknown): AppData => {
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
        return { ...data, campaigns: data.campaigns.map(normalizeCampaign) }
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
    links: e.links ?? [],
    fields: e.fields ?? {},
    decision: e.decision ?? (e.type === 'entscheidung' ? emptyDecision() : null),
    event: e.event ?? (e.type === 'ereignis' ? emptyEvent() : null),
    day: e.day ?? null,
    timeStart: e.timeStart ?? null,
    timeEnd: e.timeEnd ?? null,
    createdAt: e.createdAt ?? Date.now(),
  }
}

/** Fuellt fehlende Felder einer Kampagne auf (Entitaeten, Ebenen, Sitzungen). */
function normalizeCampaign(c: Campaign): Campaign {
  const layers = (c.layers && c.layers.length > 0 ? c.layers : [makeLayer()]).map((l) => ({
    ...l,
    fogEnabled: l.fogEnabled ?? false,
    reveals: l.reveals ?? [],
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

function standardName(type: EntityType, existing: Entity[]): string {
  const count = existing.filter((e) => e.type === type).length + 1
  const labels: Record<EntityType, string> = {
    ort: 'Neuer Ort',
    nsc: 'Neuer Charakter',
    fraktion: 'Neue Fraktion',
    ereignis: 'Neues Ereignis',
    quest: 'Neue Quest',
    item: 'Neuer Gegenstand',
    entscheidung: 'Neuer Entscheidungspunkt',
    gefahr: 'Neue Gefahr',
    schatz: 'Neuer Schatz',
  }
  return `${labels[type]} ${count}`
}
