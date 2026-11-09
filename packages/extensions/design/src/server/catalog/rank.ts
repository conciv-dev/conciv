import {orderBy} from 'es-toolkit'
import type {Component, Ranked} from '../../shared/catalog-defs.js'

export function rankComponents(input: {components: Counted[]; flags: Map<string, Flag>; live: Line[]}): Ranked[] {
  const {components, flags, live} = input
  const shown = components
    .filter((component) => flags.get(component.id) !== DO_NOT_USE)
    .map((component): Ranked => ({
      ...component,
      rank: 0,
      onPage: live.filter((source) =>
        component.sites.some((site) => site.file === source.file && site.line === source.line),
      ).length,
      tier: tierOf(component),
      flag: flags.get(component.id) === PREFER ? PREFER : null,
    }))
  return orderBy(
    shown,
    [
      (component) => (component.flag === PREFER ? 1 : 0),
      (component) => component.onPage,
      (component) => component.imports,
      (component) => RANK.tiers.indexOf(component.tier),
      (component) => (component.story === null ? 0 : 1),
      (component) => (component.sentence === null ? 0 : 1),
    ],
    ['desc', 'desc', 'desc', 'asc', 'desc', 'desc'],
  ).map((component, index) => ({...component, rank: index + 1}))
}

type Counted = Component & {imports: number}

type Flag = 'prefer' | 'do-not-use'

type Line = {file: string; line: number}

const PREFER = 'prefer' satisfies Flag
const DO_NOT_USE = 'do-not-use' satisfies Flag

const RANK = {
  kitWords: ['ui', 'kit'],
  kitPair: ['design', 'system'],
  sharedWord: 'components',
  separators: ['/', '-', '@', '.'],
  appFolder: 'src/',
  tiers: ['kit', 'app', 'other'],
} as const

function tierOf(component: Counted): Ranked['tier'] {
  const named = [component.pkg ?? '', component.file].map(words)
  if (named.some(kitNamed)) return 'kit'
  if (component.pkg !== null && named.some((each) => each.includes(RANK.sharedWord))) return 'kit'
  if (component.file.startsWith(RANK.appFolder)) return 'app'
  return 'other'
}

function words(text: string): string[] {
  return RANK.separators.reduce<string[]>(
    (pieces, separator) => pieces.flatMap((piece) => piece.split(separator)),
    [text.toLowerCase()],
  )
}

function kitNamed(named: string[]): boolean {
  if (named.some((word) => RANK.kitWords.some((mark) => mark === word))) return true
  const [first, second] = RANK.kitPair
  return named.some((word, index) => word === first && named[index + 1] === second)
}
