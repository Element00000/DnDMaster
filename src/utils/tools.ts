// Wuerfel- und Zufallslogik fuer die DM-Werkzeuge (Phase 5).

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

