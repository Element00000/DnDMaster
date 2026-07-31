import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { toSpotifyEmbed } from '../../utils/spotify'

export function MusicTool() {
  const campaign = useStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId) ?? s.campaigns[0])
  const addMusicEntry = useStore((s) => s.addMusicEntry)
  const removeMusicEntry = useStore((s) => s.removeMusicEntry)

  const entries = campaign.music
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const active = entries.find((e) => e.id === activeId) ?? entries[0] ?? null
  const embed = active ? toSpotifyEmbed(active.url) : null

  function add() {
    setError(null)
    const e = toSpotifyEmbed(url)
    if (!e) {
      setError('Bitte einen gueltigen Spotify-Link einfuegen (Playlist, Track oder Album).')
      return
    }
    addMusicEntry(label, url)
    setActiveId(null) // neuer Eintrag steht vorne und wird aktiv
    setLabel('')
    setUrl('')
  }

  return (
    <div className="music">
      <div className="music__add">
        <input
          className="field__control field__control--sm"
          placeholder="Bezeichnung (z.B. Taverne, Kampf)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <div className="music__add-row">
          <input
            className="field__control field__control--sm"
            placeholder="Spotify-Link einfuegen …"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="btn btn--sm btn--primary" onClick={add}>
            +
          </button>
        </div>
        {error && <div className="music__error">{error}</div>}
      </div>

      {entries.length > 0 && (
        <div className="music__list">
          {entries.map((e) => (
            <div key={e.id} className={`music__entry${active?.id === e.id ? ' is-active' : ''}`}>
              <button className="music__pick" onClick={() => setActiveId(e.id)} title="Abspielen">
                🎵 {e.label}
              </button>
              <button className="music__remove" title="Entfernen" onClick={() => removeMusicEntry(e.id)}>
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {active && embed ? (
        <div className="music__player">
          <iframe
            title={active.label}
            src={embed.src}
            width="100%"
            height={embed.height}
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        </div>
      ) : (
        <p className="music__hint">
          Spotify-Playlist, -Track oder -Album verlinken und speichern — der Player erscheint hier.
          Fuer volle Songs im selben Browser bei Spotify eingeloggt sein (sonst 30-Sek-Vorschau).
        </p>
      )}
    </div>
  )
}
