// Hilfen fuer Export/Import von Kampagnendaten als JSON-Datei.

/** Loest einen Datei-Download eines JSON-Objekts aus. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Liest eine Datei als geparstes JSON. */
export function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result as string))
      } catch {
        reject(new Error('Ungueltige JSON-Datei.'))
      }
    }
    reader.readAsText(file)
  })
}

/** Dateinamensicheren Slug aus einem Namen bilden. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'kampagne'
  )
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}
