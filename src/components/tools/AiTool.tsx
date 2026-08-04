import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { AI_MODELS, IMAGE_PROVIDERS, useAiStore } from '../../store/useAiStore'
import type { AiModel, ImageProvider } from '../../store/useAiStore'
import { generateSvgDataUrl, generateText } from '../../utils/ai'
import { generateImage } from '../../utils/imageGen'
import { buildCampaignContext, portraitPrompt } from '../../utils/aiContext'
import { putAsset, deleteAsset } from '../../utils/assets'
import { discardEntityImage, storeEntityImage } from '../../utils/entityImage'
import { entityMeta } from '../../types'

export function AiTool() {
  const apiKey = useAiStore((s) => s.apiKey)
  const model = useAiStore((s) => s.model)
  const setApiKey = useAiStore((s) => s.setApiKey)
  const setModel = useAiStore((s) => s.setModel)
  const imageProvider = useAiStore((s) => s.imageProvider)
  const imageKey = useAiStore((s) => s.imageKey)
  const setImageProvider = useAiStore((s) => s.setImageProvider)
  const setImageKey = useAiStore((s) => s.setImageKey)

  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const layer = campaign.layers.find((l) => l.id === campaign.activeLayerId) ?? campaign.layers[0]
  const selected = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId)?.entities.find((e) => e.id === s.selectedEntityId) ?? null)
  const updateEntity = useStore((s) => s.updateEntity)
  const setLayerImage = useStore((s) => s.setLayerImage)

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [keyDraft, setKeyDraft] = useState(apiKey)
  const [showSettings, setShowSettings] = useState(!apiKey)

  const hasKey = !!apiKey
  const ctx = () => buildCampaignContext(campaign, selected)

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    setError(null)
    setStatus(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler bei der Generierung.')
    } finally {
      setBusy(null)
    }
  }

  // ---------- Text (Claude, Key im Browser) ----------
  async function genNarrative() {
    if (!selected) return
    await run('narrative', async () => {
      const meta = entityMeta(selected.type)
      const text = await generateText(
        apiKey,
        model,
        'Du bist ein kreativer Dungeon-Master-Assistent. Schreibe atmosphaerische deutsche Beschreibungen, die zum vorhandenen Weltkontext passen. Keine Ueberschriften, kein Markdown.',
        `${ctx()}\n\nAUFGABE: Schreibe eine lebendige Beschreibung (4-8 Saetze) fuer den ${meta.label} "${selected.name}". Baue auf dem bestehenden Kontext auf und bleibe konsistent.`,
      )
      setResult(text)
    })
  }

  async function genDialogue() {
    if (!selected) return
    await run('dialogue', async () => {
      const text = await generateText(
        apiKey,
        model,
        'Du bist ein Dungeon-Master-Assistent und schreibst Charakter-Dialoge auf Deutsch. Gib 4-6 Repliken im Format "Name: ..." aus, passend zu Rolle, Motivation und Beziehungen.',
        `${ctx()}\n\nAUFGABE: Schreibe typische Dialogzeilen fuer "${selected.name}", die der DM im Spiel nutzen kann.`,
      )
      setResult(text)
    })
  }

  async function genFree() {
    if (!prompt.trim()) return
    await run('free', async () => {
      const text = await generateText(
        apiKey,
        model,
        'Du bist ein Dungeon-Master-Assistent. Antworte auf Deutsch, konsistent mit dem gegebenen Weltkontext.',
        `${ctx()}\n\nANFRAGE: ${prompt.trim()}`,
      )
      setResult(text)
    })
  }

  /** Neues Objektbild setzen: legt Portraet und Miniatur an und raeumt das alte weg. */
  async function setEntityImage(dataUrl: string) {
    const prev = { imageUrl: selected!.imageUrl, thumbUrl: selected!.thumbUrl }
    updateEntity(selected!.id, await storeEntityImage(dataUrl))
    discardEntityImage(prev)
  }

  async function genSvgPortrait() {
    if (!selected) return
    await run('svgportrait', async () => {
      const meta = entityMeta(selected.type)
      const url = await generateSvgDataUrl(
        apiKey,
        model,
        `Stilisiertes SVG-Portrait (viewBox 0 0 400 400) fuer diesen ${meta.label}: "${selected.name}". ${selected.description ?? ''}`,
      )
      await setEntityImage(url)
      setStatus(`SVG-Portrait fuer "${selected.name}" gespeichert.`)
    })
  }

  // ---------- Bild (Server-Proxy, Key bleibt geheim) ----------
  const imgOpts = { provider: imageProvider, apiKey: imageKey }

  async function genPhotoPortrait() {
    if (!selected) return
    await run('imgportrait', async () => {
      await setEntityImage(await generateImage(portraitPrompt(selected), imgOpts))
      setStatus(`Bild fuer "${selected.name}" erzeugt und gespeichert.`)
    })
  }

  async function genPhotoMap() {
    await run('imgmap', async () => {
      const placeNames = campaign.entities
        .filter((e) => e.type === 'ort')
        .slice(0, 8)
        .map((e) => e.name)
        .join(', ')
      const url = await generateImage(
        `Top-down fantasy world map, hand-drawn parchment cartography style, coastline, mountains, forests, rivers, labeled regions. World "${campaign.name}", layer "${layer.name}".${placeNames ? ' Places: ' + placeNames + '.' : ''}`,
        imgOpts,
      )
      const ref = await putAsset(url)
      const prev = layer.imageUrl
      setLayerImage(layer.id, ref, 1024, 1024)
      void deleteAsset(prev)
      setStatus(`Karte fuer Ebene "${layer.name}" erzeugt und gesetzt.`)
    })
  }

  return (
    <div className="ai">
      {/* Bilder ueber die Serverfunktion */}
      <div className="ai__group">
        <div className="ai__group-title">Bildgenerierung</div>

        <label className="field">
          <span className="field__label">Anbieter</span>
          <select
            className="field__control field__control--sm"
            value={imageProvider}
            onChange={(e) => setImageProvider(e.target.value as ImageProvider)}
          >
            {IMAGE_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {(imageProvider === 'gemini' || imageProvider === 'openai') && (
          <label className="field">
            <span className="field__label">
              {imageProvider === 'gemini' ? 'Gemini API-Key' : 'OpenAI API-Key'}
            </span>
            <input
              className="field__control field__control--sm"
              type="password"
              value={imageKey}
              placeholder={imageProvider === 'gemini' ? 'AIza…' : 'sk-…'}
              onChange={(e) => setImageKey(e.target.value)}
            />
          </label>
        )}

        <div className="ai__actions">
          <button className="ai__act" disabled={!selected || !!busy} onClick={genPhotoPortrait}>
            {busy === 'imgportrait' ? '…' : '🖼'} Portrait
          </button>
          <button className="ai__act" disabled={!!busy} onClick={genPhotoMap}>
            {busy === 'imgmap' ? '…' : '🗺'} Karte
          </button>
        </div>
        <p className="ai__hint">
          {imageProvider === 'auto'
            ? 'Nutzt die serverseitig hinterlegte Einstellung (Vercel-Umgebungsvariable), sonst kostenlos Pollinations.'
            : imageProvider === 'pollinations'
              ? 'Kostenlos und ohne Key. Bildqualitaet variabel.'
              : 'Dein Key wird nur an die eigene Serverfunktion gesendet (loest CORS) und lokal im Browser gespeichert. Fuer geteilte Nutzung besser die Server-Umgebungsvariable verwenden.'}
        </p>
      </div>

      {/* Claude: Text + SVG (Key liegt im Browser) */}
      <div className="ai__group">
        <div className="ai__settings-head">
          <span className={`ai__status-dot${hasKey ? ' is-on' : ''}`} />
          <span className="ai__status-text">Claude: {hasKey ? 'bereit' : 'API-Key noetig'}</span>
          <button className="linklike" onClick={() => setShowSettings((s) => !s)}>
            {showSettings ? 'ausblenden' : 'Einstellungen'}
          </button>
        </div>

        {showSettings && (
          <div className="ai__settings">
            <label className="field">
              <span className="field__label">Anthropic API-Key (nur Text/SVG, lokal im Browser)</span>
              <input
                className="field__control field__control--sm"
                type="password"
                value={keyDraft}
                placeholder="sk-ant-..."
                onChange={(e) => setKeyDraft(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Modell</span>
              <select className="field__control field__control--sm" value={model} onChange={(e) => setModel(e.target.value as AiModel)}>
                {AI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn btn--primary btn--sm btn--full"
              onClick={() => {
                setApiKey(keyDraft)
                setShowSettings(false)
              }}
            >
              Speichern
            </button>
            <p className="ai__note">
              Nur fuer Text/SVG. Der Key liegt offen im Browser — auf geteilten Geraeten nicht nutzen.
              Bildgenerierung laeuft ueber den Server und braucht diesen Key nicht.
            </p>
          </div>
        )}

        {hasKey && (
          <div className="ai__actions">
            <button className="ai__act" disabled={!selected || !!busy} onClick={genNarrative}>
              {busy === 'narrative' ? '…' : '✎'} Erzaehltext
            </button>
            <button className="ai__act" disabled={!selected || !!busy} onClick={genDialogue}>
              {busy === 'dialogue' ? '…' : '💬'} Dialog
            </button>
            <button className="ai__act" disabled={!selected || !!busy} onClick={genSvgPortrait}>
              {busy === 'svgportrait' ? '…' : '✦'} Portrait (SVG)
            </button>
          </div>
        )}
      </div>

      <div className="ai__context">
        Kontext: <strong>{campaign.name}</strong>
        {selected ? (
          <> · Auswahl: <strong>{selected.name}</strong></>
        ) : (
          <> · kein Objekt ausgewaehlt</>
        )}
      </div>

      {hasKey && (
        <div className="ai__free">
          <textarea
            className="field__control field__textarea field__control--sm"
            rows={2}
            placeholder="Freier Auftrag an Claude, z.B. „Erfinde 3 Geruechte fuer die Stadt“ …"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button className="btn btn--sm btn--full" disabled={!prompt.trim() || !!busy} onClick={genFree}>
            {busy === 'free' ? 'Generiere …' : 'Frei generieren'}
          </button>
        </div>
      )}

      {error && <div className="ai__error">{error}</div>}
      {status && <div className="ai__ok">{status}</div>}

      {result && (
        <div className="ai__result">
          <textarea
            className="field__control field__textarea"
            rows={7}
            value={result}
            onChange={(e) => setResult(e.target.value)}
          />
          <div className="ai__result-actions">
            {selected && (
              <>
                <button className="btn btn--sm" onClick={() => updateEntity(selected.id, { description: result! })}>
                  Als Beschreibung
                </button>
                <button
                  className="btn btn--sm btn--ghost"
                  onClick={() =>
                    updateEntity(selected.id, {
                      description: (selected.description ? selected.description + '\n\n' : '') + result!,
                    })
                  }
                >
                  Anhaengen
                </button>
              </>
            )}
            <button className="btn btn--sm btn--ghost" onClick={() => navigator.clipboard?.writeText(result!)}>
              Kopieren
            </button>
            <button className="btn btn--sm btn--ghost" onClick={() => setResult(null)}>
              Verwerfen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
