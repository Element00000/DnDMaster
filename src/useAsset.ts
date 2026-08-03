import { useEffect, useState } from 'react'
import { getAsset, getCachedAsset } from './utils/assets'

/**
 * Loest eine Asset-Referenz (oder data-URL) reaktiv zu einer URL auf.
 * undefined = wird noch geladen, null = keine Referenz bzw. Laden fehlgeschlagen (Asset
 * nicht (mehr) vorhanden), string = geladene URL. Aufrufer, die "kein Bild" von "Laden
 * fehlgeschlagen" unterscheiden wollen, pruefen zusaetzlich die urspruengliche Referenz.
 */
export function useAsset(ref: string | null | undefined): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(() => getCachedAsset(ref))

  useEffect(() => {
    let alive = true
    const c = getCachedAsset(ref)
    if (c !== undefined) {
      setUrl(c)
      return
    }
    setUrl(undefined)
    getAsset(ref).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [ref])

  return url
}
