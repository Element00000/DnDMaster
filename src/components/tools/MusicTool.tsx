import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { useActiveCampaign } from '../../store/useActive'
import { toSpotifyEmbed } from '../../utils/spotify'

/**
 * Verkleinerung des Spotify-Players. Er ist fuer breitere Spalten ausgelegt und schneidet
 * in der schmalen Werkzeugleiste sonst Bedienelemente ab; die Spaltenbreite selbst soll
 * dafuer nicht wachsen.
 */
const PLAYER_SCALE = 0.8

/** Fuer Screenreader; die Blase am Infopunkt zeigt denselben Inhalt gegliedert. */
const FULL_TRACKS_HELP =
  'Volle Songs statt 30-Sekunden-Vorschau: Spotify Premium noetig, und im selben Browser ' +
  'bei Spotify angemeldet sein. Blockiert der Browser Drittanbieter-Cookies, braucht es zwei ' +
  'Ausnahmen - in Chrome unter Einstellungen, Datenschutz und Sicherheit, ' +
  'Drittanbieter-Cookies: erstens die Adresse dieser Seite, zweitens [*.]spotify.com. ' +
  'Werbeblocker wie AdGuard fuer diese Seite abschalten.'

export function MusicTool() {
  const campaign = useActiveCampaign()
  const addMusicEntry = useStore((s) => s.addMusicEntry)
  const removeMusicEntry = useStore((s) => s.removeMusicEntry)

  const entries = campaign.music
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const active = entries.find((e) => e.id === activeId) ?? null
  const embed = active ? toSpotifyEmbed(active.url) : null

  /**
   * Klick auf einen Eintrag: einen anderen aufschlagen oder den offenen einklappen. Der
   * Player bleibt beim Einklappen geladen - er wird nur auf Hoehe null gefahren, damit die
   * Musik weiterlaeuft, waehrend die Liste wieder Platz hat.
   */
  function pick(id: string) {
    if (activeId === id) {
      setCollapsed((c) => !c)
      return
    }
    setActiveId(id)
    setCollapsed(false)
  }

  function add() {
    setError(null)
    const e = toSpotifyEmbed(url)
    if (!e) {
      setError('Bitte einen gueltigen Spotify-Link einfuegen (Playlist, Track oder Album).')
      return
    }
    setActiveId(addMusicEntry(label, url))
    setCollapsed(false)
    setLabel('')
    setUrl('')
  }

  return (
    <div className="music">
      <div className="music__head">
        <span className="music__title">Spotify</span>
        <span className="infodot" tabIndex={0} role="note" aria-label={FULL_TRACKS_HELP}>
          i
          <span className="infodot__bubble">
            <strong>Volle Songs statt 30-Sekunden-Vorschau</strong>
            <br />
            Spotify Premium noetig, und im selben Browser bei Spotify angemeldet sein.
            <br />
            <br />
            Blockiert der Browser Drittanbieter-Cookies, braucht es <em>zwei</em> Ausnahmen —
            in Chrome unter Einstellungen › Datenschutz und Sicherheit › Drittanbieter-Cookies:
            <br />
            1. die Adresse dieser Seite (dort laeuft der Player)
            <br />
            2. <code>[*.]spotify.com</code> (dort liegt die Anmeldung)
            <br />
            <br />
            Werbeblocker wie AdGuard fuer diese Seite abschalten - sie stoeren die
            Anmeldepruefung des Players.
          </span>
        </span>
      </div>

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

      {entries.length > 0 ? (
        <div className="music__list">
          {entries.map((e) => {
            const open = active?.id === e.id
            return (
              <div key={e.id} className="music__item">
                <div className={`music__entry${open ? ' is-active' : ''}`}>
                  <button
                    className="music__pick"
                    onClick={() => pick(e.id)}
                    title={open && !collapsed ? 'Player einklappen' : 'Abspielen'}
                    aria-expanded={open && !collapsed}
                  >
                    🎵 {e.label}
                  </button>
                  <button className="music__remove" title="Entfernen" onClick={() => removeMusicEntry(e.id)}>
                    &times;
                  </button>
                </div>

                {open && embed && (
                  // Der Player wird verkleinert dargestellt, damit sein Inhalt in die schmale
                  // Spalte passt, und sitzt direkt unter seinem Eintrag. Eingeklappt faehrt nur
                  // die Hoehe auf null - das iframe bleibt geladen, damit die Musik weiterlaeuft.
                  <div
                    className={`music__player${collapsed ? ' is-collapsed' : ''}`}
                    style={{
                      height: collapsed ? 0 : Math.round(embed.height * PLAYER_SCALE),
                      ['--player-scale' as string]: PLAYER_SCALE,
                    }}
                  >
                    <iframe
                      title={e.label}
                      src={embed.src}
                      frameBorder="0"
                      // storage-access: Blockiert der Browser Drittanbieter-Cookies, muss der
                      // Player den Zugriff auf seine Sitzung eigens anfordern - ohne diese
                      // Erlaubnis erkennt er das Spotify-Konto nicht und spielt nur Vorschauen.
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; storage-access"
                      loading="lazy"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="music__hint">
          Spotify-Playlist, -Track oder -Album verlinken und speichern — der Player erscheint hier.
          Spielt er nur Ausschnitte, hilft der Infopunkt oben.
        </p>
      )}
    </div>
  )
}
