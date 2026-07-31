// Wandelt einen Spotify-Link (oder URI) in die Embed-Player-URL um.

export interface SpotifyEmbed {
  src: string
  height: number
}

const TYPES = 'playlist|track|album|episode|show|artist'

export function toSpotifyEmbed(input: string): SpotifyEmbed | null {
  const s = (input || '').trim()
  if (!s) return null

  // spotify:playlist:ID
  let m = new RegExp(`^spotify:(${TYPES}):([A-Za-z0-9]+)`).exec(s)
  if (!m) {
    // https://open.spotify.com/[intl-de/]playlist/ID?...
    m = new RegExp(`open\\.spotify\\.com/(?:intl-[a-z]+/)?(${TYPES})/([A-Za-z0-9]+)`).exec(s)
  }
  if (!m) return null

  const type = m[1]
  const id = m[2]
  const tall = type === 'playlist' || type === 'album' || type === 'show' || type === 'artist'
  return {
    src: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`,
    height: tall ? 352 : 152,
  }
}
