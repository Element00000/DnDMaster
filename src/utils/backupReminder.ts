// Merkt sich den Zeitpunkt des letzten Backups (lokal, nicht im Export enthalten),
// um dezent ans Sichern zu erinnern.

const KEY = 'dnd-weltkarte-last-backup'

export function markBackup(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

export function lastBackupAt(): number | null {
  const v = localStorage.getItem(KEY)
  return v ? Number(v) : null
}

/** Menschlich lesbarer Hinweis + ob eine Erinnerung faellig ist. */
export function backupHint(): { text: string; stale: boolean } {
  const t = lastBackupAt()
  if (!t) return { text: 'Noch kein Backup exportiert.', stale: true }
  const days = (Date.now() - t) / 86_400_000
  const date = new Date(t).toLocaleDateString()
  return { text: `Letztes Backup: ${date}`, stale: days > 7 }
}
