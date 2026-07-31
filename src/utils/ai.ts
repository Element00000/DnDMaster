// Anbindung an die Claude API (Anthropic). Der Aufruf erfolgt direkt aus dem
// Browser mit einem lokal gespeicherten API-Key.
//
// SICHERHEIT: `dangerouslyAllowBrowser` legt den Key offen im Browser ab. Das
// ist fuer ein persoenliches Ein-Nutzer-Werkzeug vertretbar; fuer eine oeffentlich
// geteilte Instanz gehoert der Key hinter einen serverseitigen Proxy.

import Anthropic from '@anthropic-ai/sdk'
import type { AiModel } from '../store/useAiStore'

function makeClient(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

/** Freien Text von Claude erzeugen. */
export async function generateText(
  apiKey: string,
  model: AiModel,
  system: string,
  prompt: string,
): Promise<string> {
  if (!apiKey) throw new Error('Kein API-Key hinterlegt.')
  const client = makeClient(apiKey)
  const res = await client.messages.create({
    model,
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  if (res.stop_reason === 'refusal') {
    throw new Error('Die Anfrage wurde vom Modell abgelehnt.')
  }
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
  if (!text) throw new Error('Leere Antwort erhalten.')
  return text
}

/** SVG-Grafik von Claude erzeugen; liefert eine data-URL zum Anzeigen/Speichern. */
export async function generateSvgDataUrl(
  apiKey: string,
  model: AiModel,
  brief: string,
): Promise<string> {
  const system =
    'Du bist ein Illustrator, der ausschliesslich gueltigen, in sich geschlossenen SVG-Code ausgibt. ' +
    'Antworte NUR mit dem SVG (beginnend mit <svg und endend mit </svg>), ohne Erklaerungen, ' +
    'ohne Markdown-Codebloecke, ohne externe Referenzen (keine externen Bilder/Fonts). ' +
    'Nutze ein viewBox-Attribut und kraeftige, klar lesbare Formen und Farben.'
  const raw = await generateText(apiKey, model, system, brief)
  const match = /<svg[\s\S]*<\/svg>/i.exec(raw)
  if (!match) throw new Error('Keine SVG-Grafik in der Antwort gefunden.')
  const svg = match[0]
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
