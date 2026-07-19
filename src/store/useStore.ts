import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AppData,
  Campaign,
  Entity,
  EntityType,
  MapLayer,
  Placement,
  RelationType,
} from '../types'
import { uid } from '../utils/id'

function makeLayer(): MapLayer {
  return {
    id: uid('layer-'),
    name: 'Weltkarte',
    imageUrl: null,
    width: 2000,
    height: 1400,
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
  }
}

/** Werkzeug-Modus der Karte. */
export type Tool = 'select' | 'add'

interface StoreState extends AppData {
  // UI-Zustand (nicht persistiert)
  tool: Tool
  pendingEntityType: EntityType
  selectedEntityId: string | null
  /** Ein vorhandenes (unplatziertes) Objekt wartet auf einen Kartenklick. */
  placingEntityId: string | null
  /** Spieler-Ansicht: DM-Geheimnisse und unentdeckte Objekte ausblenden. */
  playerMode: boolean

  // Kampagnen
  activeCampaign: () => Campaign
  addCampaign: (name: string) => void
  renameCampaign: (id: string, name: string) => void
  updateCampaignDescription: (id: string, description: string) => void
  deleteCampaign: (id: string) => void
  setActiveCampaign: (id: string) => void

  // Ebenen (der aktiven Kampagne)
  activeLayer: () => MapLayer
  setActiveLayer: (id: string) => void
  setLayerImage: (id: string, imageUrl: string, width: number, height: number) => void
  resetLayerImage: (id: string) => void

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
            links: [],
            fields: {},
            createdAt: Date.now(),
          }
          patchActive((c) => ({ ...c, entities: [...c.entities, entity] }))
          set({ selectedEntityId: id })
          return id
        },

        updateEntity: (id, patch) =>
          patchActive((c) => ({
            ...c,
            entities: c.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
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

        // ---------- UI ----------
        setTool: (t) => set({ tool: t }),
        setPendingEntityType: (t) => set({ pendingEntityType: t }),
        setPlacingEntity: (id) => set({ placingEntityId: id, tool: 'select' }),
        setPlayerMode: (on) => set({ playerMode: on, tool: 'select', placingEntityId: null }),
      }
    },
    {
      name: 'dnd-weltkarte',
      version: 2,
      // Nur Daten persistieren, keinen fluechtigen UI-Zustand.
      partialize: (s): AppData => ({
        campaigns: s.campaigns,
        activeCampaignId: s.activeCampaignId,
      }),
      // Migration von Phase 1 (flache Marker) zu Phase 2 (Kampagnen/Entitaeten).
      migrate: (persisted: unknown): AppData => {
        const state = persisted as Record<string, unknown> | undefined
        if (state && Array.isArray(state.campaigns)) {
          return state as unknown as AppData
        }
        const layers = (state?.layers as MapLayer[]) ?? [makeLayer()]
        const activeLayerId = (state?.activeLayerId as string) ?? layers[0].id
        const oldMarkers = (state?.markers as OldMarker[]) ?? []
        const entities: Entity[] = oldMarkers.map((m) => ({
          id: m.id,
          type: m.type,
          name: m.name,
          description: m.description ?? '',
          secret: '',
          visibility: m.visibility ?? 'dm',
          placement: { layerId: activeLayerId, x: m.x, y: m.y },
          links: [],
          fields: {},
          createdAt: m.createdAt ?? Date.now(),
        }))
        const campaign: Campaign = {
          id: uid('camp-'),
          name: 'Meine Kampagne',
          description: '',
          createdAt: Date.now(),
          layers,
          activeLayerId,
          entities,
        }
        return { campaigns: [campaign], activeCampaignId: campaign.id }
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
