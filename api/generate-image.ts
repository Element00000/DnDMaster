// Vercel Serverless Function: POST /api/generate-image  { prompt }
// Haelt den geheimen Bild-API-Key serverseitig (Umgebungsvariable) und liefert
// eine data-URL zurueck. So ist der Key nie im Browser sichtbar.

import { generateImageDataUrl } from './_lib/imagegen'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Nur POST erlaubt.' })
    return
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const prompt = String(body.prompt || '')
    const dataUrl = await generateImageDataUrl(prompt)
    res.status(200).json({ dataUrl })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Bildgenerierung fehlgeschlagen.' })
  }
}
