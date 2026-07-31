import { useEffect, useState } from 'react'
import { getAsset, getCachedAsset } from './utils/assets'

/** Loest eine Asset-Referenz (oder data-URL) reaktiv zu einer URL auf. */
export function useAsset(ref: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    const c = getCachedAsset(ref)
    return c === undefined ? null : c
  })

  useEffect(() => {
    let alive = true
    const c = getCachedAsset(ref)
    if (c !== undefined) {
      setUrl(c)
      return
    }
    getAsset(ref).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [ref])

  return url
}
