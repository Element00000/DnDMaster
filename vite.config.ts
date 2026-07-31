import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { generateImageDataUrl } from './api/_lib/imagegen'

/**
 * Bedient /api/generate-image lokal im Dev-Server, damit die Bildgenerierung
 * ohne `vercel dev` getestet werden kann. In Produktion uebernimmt das die
 * Vercel-Funktion in api/generate-image.ts.
 */
function imageApiPlugin(): Plugin {
  return {
    name: 'dev-image-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-image', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Nur POST erlaubt.' }))
          return
        }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body || '{}')
            const dataUrl = await generateImageDataUrl(String(parsed.prompt || ''), {
              provider: parsed.provider ? String(parsed.provider) : undefined,
              apiKey: parsed.apiKey ? String(parsed.apiKey) : undefined,
            })
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ dataUrl }))
          } catch (e) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Fehler.' }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // .env-Werte fuer das Dev-Middleware in process.env spiegeln (Server-Seite).
  const env = loadEnv(mode, process.cwd(), '')
  for (const k of ['GEMINI_API_KEY', 'GEMINI_IMAGE_MODEL', 'OPENAI_API_KEY', 'OPENAI_IMAGE_MODEL', 'POLLINATIONS_MODEL']) {
    if (!process.env[k] && env[k]) process.env[k] = env[k]
  }
  return {
    plugins: [react(), imageApiPlugin()],
    server: { port: 5173, open: true },
  }
})
