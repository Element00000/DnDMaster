// Wohin die Karte gerade schaut - abfragbar von ausserhalb der Kartenansicht.
//
// Bewusst kein Store-Feld: Zoom und Schwenk aendern den Ausschnitt viele Male pro Sekunde,
// und jede dieser Aenderungen wuerde sonst alle Ansichten neu zeichnen lassen, die am Store
// haengen. Hier meldet die Karte nur eine Abfragefunktion an; wer den Ausschnitt braucht,
// holt ihn sich im Moment der Benutzung.

export interface ViewCenter {
  /** Karte, die unter der Bildmitte liegt - auch eine tief eingebettete. */
  layerId: string
  /** Bildmitte in Koordinaten dieser Karte. */
  x: number
  y: number
  /** Wie viel von dieser Karte gerade ins Bild passt, in ihren Koordinaten. */
  width: number
  height: number
  /** Bildschirmpunkte je Welteinheit dieser Karte - fuer Groessen, die sichtbar sein muessen. */
  scale: number
}

let read: (() => ViewCenter | null) | null = null

/** Die Kartenansicht meldet sich an (und beim Abbau wieder ab). */
export function setViewCenterReader(fn: (() => ViewCenter | null) | null): void {
  read = fn
}

/** Der aktuelle Ausschnitt, oder null, wenn keine Karte gezeichnet ist. */
export function viewCenter(): ViewCenter | null {
  return read?.() ?? null
}
