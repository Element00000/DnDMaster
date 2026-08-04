// Bild-Upload mit Herunterskalierung, damit die data-URLs den Browser-Speicher
// (LocalStorage) nicht sprengen.

interface Options {
  /** Maximale Kantenlaenge in Pixeln. */
  maxDim: number
  /** JPEG-Qualitaet 0..1. */
  quality: number
}

/**
 * Liest eine Bilddatei, skaliert sie auf maxDim herunter und liefert eine
 * data-URL (JPEG). Transparente PNGs werden auf dunklem Grund gerendert.
 */
export function fileToScaledDataUrl(
  file: File,
  { maxDim, quality }: Options = { maxDim: 1600, quality: 0.82 },
): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'))
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas nicht verfuegbar.'))
          return
        }
        ctx.fillStyle = '#12151d'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve({ url: canvas.toDataURL('image/jpeg', quality), width: w, height: h })
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Kantenlaenge der Miniaturbilder, die auf Kartenpinnadeln und in Listen stecken.
 * Bewusst winzig: Auf einer Karte haengen schnell dutzende Pins, die sonst alle das
 * volle Portrait laden und skalieren muessten. 64 px reichen, um ein Gesicht zu erkennen.
 */
export const THUMB_SIZE = 64

/**
 * Erzeugt aus einer Bild-data-URL ein quadratisches Miniaturbild (mittiger Ausschnitt,
 * damit Portraits nicht verzerrt werden).
 */
export function dataUrlToThumb(dataUrl: string, size = THUMB_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'))
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas nicht verfuegbar.'))
        return
      }
      // Quadratischer Ausschnitt aus der Mitte, auf die volle Flaeche gezogen.
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      const sx = (img.naturalWidth - side) / 2
      const sy = (img.naturalHeight - side) / 2
      ctx.fillStyle = '#12151d'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
      resolve(canvas.toDataURL('image/jpeg', 0.78))
    }
    img.src = dataUrl
  })
}
