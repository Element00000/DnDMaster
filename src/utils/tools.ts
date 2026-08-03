// Wuerfel- und Zufallslogik fuer die DM-Werkzeuge (Phase 5).

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

export interface RollResult {
  sides: number
  count: number
  modifier: number
  rolls: number[]
  total: number
  mode: 'normal' | 'vorteil' | 'nachteil'
}

export function roll(
  sides: number,
  count: number,
  modifier: number,
  mode: 'normal' | 'vorteil' | 'nachteil' = 'normal',
): RollResult {
  let rolls: number[]
  if (mode !== 'normal' && sides === 20 && count === 1) {
    const a = rollDie(20)
    const b = rollDie(20)
    rolls = [mode === 'vorteil' ? Math.max(a, b) : Math.min(a, b)]
  } else {
    rolls = Array.from({ length: Math.max(1, count) }, () => rollDie(sides))
  }
  const sum = rolls.reduce((s, r) => s + r, 0)
  return { sides, count, modifier, rolls, total: sum + modifier, mode }
}
