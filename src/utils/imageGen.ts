// Client-seitiger Aufruf des Server-Bild-Proxys. Kein API-Key im Browser —
// der Schluessel liegt serverseitig (Vercel-Funktion / Vite-Dev-Middleware).

export async function generateImage(
  prompt: string,
  opts: { provider?: string; apiKey?: string } = {},
): Promise<string> {
  const res = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, provider: opts.provider, apiKey: opts.apiKey }),
  })
  if (!res.ok) {
    let msg = `Bildgenerierung fehlgeschlagen (${res.status}).`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch {
      /* ignore */
    }
    if (res.status === 404) {
      msg = 'Bild-Endpunkt nicht erreichbar. Lokal via „vercel dev“ starten oder auf Vercel deployen.'
    }
    throw new Error(msg)
  }
  const data = (await res.json()) as { dataUrl?: string }
  if (!data.dataUrl) throw new Error('Keine Bilddaten erhalten.')
  return data.dataUrl
}
