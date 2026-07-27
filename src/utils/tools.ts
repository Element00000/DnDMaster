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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ---------- Zufallstabellen ----------

const NAME_PREFIX = [
  'Bal', 'Cor', 'Dra', 'El', 'Fen', 'Gor', 'Hal', 'Ing', 'Kel', 'Lor',
  'Mor', 'Nor', 'Ory', 'Per', 'Quen', 'Ru', 'Syl', 'Thal', 'Ul', 'Vor',
]
const NAME_MIDDLE = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'or', 'an', 'yr']
const NAME_SUFFIX = [
  'dor', 'wyn', 'ric', 'mir', 'thas', 'gar', 'ien', 'ok', 'ling', 'heim',
  'ara', 'eth', 'ius', 'ora', 'wen', 'dain', 'orn', 'iel', 'ash', 'und',
]

export function randomName(): string {
  return pick(NAME_PREFIX) + pick(NAME_MIDDLE) + pick(NAME_SUFFIX)
}

const WEATHER = [
  'Klarer Himmel, milde Brise',
  'Dichter Nebel, Sicht unter 30 Metern',
  'Leichter Nieselregen, kuehl',
  'Wolkenbruch mit Donner',
  'Schneetreiben, beissende Kaelte',
  'Drueckende Hitze, kein Wind',
  'Sturmboeen aus Nordwest',
  'Grauer Himmel, schwueler Dunst',
  'Erster Frost, glasklare Nacht',
  'Aufziehendes Gewitter am Horizont',
]

export function randomWeather(): string {
  return pick(WEATHER)
}

const ENCOUNTERS = [
  'Eine Gruppe erschoepfter Fluechtlinge bittet um Hilfe.',
  'Ein umgestuerzter Handelskarren blockiert den Weg.',
  'Woelfe umkreisen die Gruppe in der Daemmerung.',
  'Ein wandernder Barde will Neuigkeiten gegen ein Lied tauschen.',
  'Banditen fordern Wegzoll an einer Bruecke.',
  'Ein verletzter Bote stammelt eine Warnung.',
  'Seltsame Lichter tanzen zwischen den Baeumen.',
  'Ein Haendler bietet zwielichtige Ware feil.',
  'Eine Patrouille der oertlichen Wache haelt die Gruppe an.',
  'Aus einer Hoehle dringt tiefes Knurren.',
]

export function randomEncounter(): string {
  return pick(ENCOUNTERS)
}

const RUMORS = [
  'In der alten Muehle soll es nachts spuken.',
  'Der Buergermeister verschwindet regelmaessig ohne Erklaerung.',
  'Ein Drache wurde in den Bergen im Norden gesichtet.',
  'Die Diebesgilde sucht neue Mitglieder.',
  'Unter der Kapelle liegt angeblich ein vergessenes Verlies.',
  'Die Ernte verdirbt seit dem letzten Vollmond.',
  'Ein Fremder zahlt Gold fuer alte Landkarten.',
  'Im Sumpf wurde ein leuchtender Stein gefunden.',
  'Die Fuerstin plant heimlich ein Buendnis mit den Nachbarn.',
  'Ein Kind schwoert, einen sprechenden Raben getroffen zu haben.',
]

export function randomRumor(): string {
  return pick(RUMORS)
}
