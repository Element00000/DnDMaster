// Serverseitige Bildgenerierung. Wird von der Vercel-Funktion und (im Dev) vom
// Vite-Middleware genutzt. Der Provider ergibt sich aus den Umgebungsvariablen —
// so bleibt der geheime API-Key ausschliesslich auf dem Server.
//
// Reihenfolge: GEMINI_API_KEY -> OPENAI_API_KEY -> Pollinations (kostenlos, ohne Key).

export interface ImageOptions {
  /** Vom Client gewaehlter Anbieter (optional). */
  provider?: string
  /** Vom Client uebergebener API-Key (optional; sonst Server-Env). */
  apiKey?: string
}

/** Erzeugt ein Bild zum Prompt und liefert eine data-URL (base64). */
export async function generateImageDataUrl(prompt: string, opts: ImageOptions = {}): Promise<string> {
  const clean = (prompt || '').trim()
  if (!clean) throw new Error('Kein Prompt angegeben.')

  const provider = (opts.provider || '').trim()
  const key = (opts.apiKey || '').trim()

  // Ausdruecklich gewaehlter Anbieter (Key aus Anfrage, sonst aus Env).
  if (provider === 'gemini') return geminiImage(clean, key || process.env.GEMINI_API_KEY || '')
  if (provider === 'openai') return openaiImage(clean, key || process.env.OPENAI_API_KEY || '')
  if (provider === 'pollinations') return pollinationsImage(clean)

  // Automatik: erst Server-Env, sonst kostenlos ueber Pollinations.
  const gemini = process.env.GEMINI_API_KEY
  const openai = process.env.OPENAI_API_KEY
  if (gemini) return geminiImage(clean, gemini)
  if (openai) return openaiImage(clean, openai)
  return pollinationsImage(clean)
}

// ---------- Google Gemini (kostenloses Kontingent) ----------
async function geminiImage(prompt: string, key: string): Promise<string> {
  if (!key) throw new Error('Kein Gemini-API-Key hinterlegt (im KI-Werkzeug eintragen).')
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  })
  if (!res.ok) {
    throw new Error(`Gemini-Fehler ${res.status}: ${await safeText(res)}`)
  }
  const data: any = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png'
      return `data:${mime};base64,${inline.data}`
    }
  }
  throw new Error('Gemini lieferte kein Bild zurueck.')
}

// ---------- OpenAI (gpt-image-1) ----------
async function openaiImage(prompt: string, key: string): Promise<string> {
  if (!key) throw new Error('Kein OpenAI-API-Key hinterlegt (im KI-Werkzeug eintragen).')
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, prompt, size: '1024x1024', n: 1 }),
  })
  if (!res.ok) {
    throw new Error(`OpenAI-Fehler ${res.status}: ${await safeText(res)}`)
  }
  const data: any = await res.json()
  const b64 = data?.data?.[0]?.b64_json
  if (b64) return `data:image/png;base64,${b64}`
  const link = data?.data?.[0]?.url
  if (link) return fetchToDataUrl(link)
  throw new Error('OpenAI lieferte kein Bild zurueck.')
}

// ---------- Pollinations.ai (kostenlos, ohne Key) ----------
async function pollinationsImage(prompt: string): Promise<string> {
  const model = process.env.POLLINATIONS_MODEL || 'flux'
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=1024&height=1024&nologo=true&model=${encodeURIComponent(model)}`
  return fetchToDataUrl(url)
}

// ---------- Helfer ----------
async function fetchToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Bild-Download fehlgeschlagen (${res.status}).`)
  const mime = res.headers.get('content-type') || 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:${mime};base64,${buf.toString('base64')}`
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300)
  } catch {
    return ''
  }
}
