import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Auswaehlbare Claude-Modelle. */
export const AI_MODELS = [
  { id: 'claude-opus-5', label: 'Opus 5 (stark, empfohlen)' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 (schnell)' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 (guenstig)' },
] as const

export type AiModel = (typeof AI_MODELS)[number]['id']

interface AiState {
  /** Anthropic API-Key (nur lokal im Browser gespeichert). */
  apiKey: string
  model: AiModel
  setApiKey: (key: string) => void
  setModel: (m: AiModel) => void
}

/**
 * Separater Store fuer die KI-Einstellungen. Bewusst NICHT Teil des
 * Kampagnen-Zustands, damit der API-Key nie in Exporten/Backups landet.
 */
export const useAiStore = create<AiState>()(
  persist(
    (set) => ({
      apiKey: '',
      model: 'claude-opus-5',
      setApiKey: (key) => set({ apiKey: key.trim() }),
      setModel: (m) => set({ model: m }),
    }),
    { name: 'dnd-weltkarte-ai' },
  ),
)
