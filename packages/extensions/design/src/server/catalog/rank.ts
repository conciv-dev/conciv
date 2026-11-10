import {orderBy} from 'es-toolkit'
import type {Component, Ranked} from '../../shared/catalog-defs.js'

export function rankComponents(input: {
  components: Counted[]
  flags: Map<string, Flag>
  onPage: Record<string, number>
  hidden?: boolean
}): Ranked[] {
  const {components, flags, onPage} = input
  const shown = components
    .filter((component) => input.hidden === true || flags.get(component.id) !== DO_NOT_USE)
    .map((component): Ranked => ({
      ...component,
      rank: 0,
      onPage: onPage[component.id] ?? 0,
      tier: tierOf(component),
      flag: flags.get(component.id) ?? null,
    }))
  return orderBy(
    shown,
    [
      (component) => FLAG_ORDER.indexOf(component.flag),
      (component) => component.onPage,
      (component) => component.imports,
      (component) => RANK.tiers.indexOf(component.tier),
      (component) => (component.story === null ? 0 : 1),
      (component) => (component.sentence === null ? 0 : 1),
    ],
    ['desc', 'desc', 'desc', 'asc', 'desc', 'desc'],
  ).map((component, index) => ({...component, rank: index + 1}))
}

type Counted = Component & {imports: number; previewError: string | null}

type Flag = 'prefer' | 'do-not-use'

const DO_NOT_USE = 'do-not-use' satisfies Flag

const FLAG_ORDER: Ranked['flag'][] = [DO_NOT_USE, null, 'prefer']

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
