import { useAsset } from '../useAsset'

/** Bild, das eine Asset-Referenz (IndexedDB) oder data-URL aufloest. */
export function AssetImg({
  refUrl,
  alt,
  className,
}: {
  refUrl: string | null | undefined
  alt?: string
  className?: string
}) {
  const url = useAsset(refUrl)
  if (!url) return null
  return <img className={className} src={url} alt={alt ?? ''} />
}
