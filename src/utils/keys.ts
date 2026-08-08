// Hilfen fuer die Tastaturbedienung.

/**
 * Schreibt der Nutzer gerade Text? Dann gehoert die Taste dem Eingabefeld, nicht der Karte:
 * Entf loescht dort ein Zeichen und kein Objekt, Strg+C kopiert die Textauswahl.
 *
 * Jedes globale Tastenkuerzel muss das zuerst fragen - sonst greift es einem Feld ins Wort.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  const tag = el?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable
}
