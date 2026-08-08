// Zugriff auf das, womit fast jede Ansicht arbeitet: die geoeffnete Kampagne und ihre
// Wurzelkarte. Stand frueher als dieselbe Zeile in jeder Komponente - eine Aenderung an der
// Regel haette dann 18 Stellen betroffen, und eine uebersehene faellt erst am Spieltisch auf.

import type { Campaign, MapLayer } from '../types'
import { useStore } from './useStore'

/**
 * Die geoeffnete Kampagne. Der Rueckfall auf die erste ist der Notnagel fuer einen
 * Datenstand, dessen activeCampaignId ins Leere zeigt - ohne ihn stuende die Anwendung.
 *
 * Liefert das Objekt aus dem Kampagnen-Array, nicht eine Kopie: Die Ansicht zeichnet also
 * nur neu, wenn sich diese Kampagne tatsaechlich geaendert hat.
 */
export function useActiveCampaign(): Campaign {
  return useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
}

/**
 * Die Wurzelkarte einer Kampagne. Ohne Hook, damit auch Stellen ausserhalb des Renderns
 * (Ereignisbehandlung, Hilfsfunktionen) dieselbe Regel benutzen koennen.
 */
export function activeLayerOf(campaign: Campaign): MapLayer {
  return campaign.layers.find((l) => l.id === campaign.activeLayerId) ?? campaign.layers[0]
}

/**
 * Die Wurzelkarte der geoeffneten Kampagne - die Karte, in deren Koordinaten gerechnet wird.
 * Welche Karte man gerade *betrachtet*, steht in viewLayerId und ist etwas anderes.
 */
export function useActiveLayer(): MapLayer {
  return activeLayerOf(useActiveCampaign())
}
