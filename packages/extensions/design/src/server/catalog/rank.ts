import {orderBy} from 'es-toolkit'
import type {Component, Ranked} from '../../shared/catalog-defs.js'

export function rankComponents(input: {components: Counted[]; flags: Map<string, Flag>; live: string[]}): Ranked[] {
  const {components, flags, live} = input
  const shown = components
    .filter((component) => flags.get(component.id) !== DO_NOT_USE)
    .map((component): Ranked => ({
      ...component,
      rank: 0,
      onPage: live.filter((file) => file === component.file).length,
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

const PREFER = 'prefer' satisfies Flag
const DO_NOT_USE = 'do-not-use' satisfies Flag

const RANK = {
  kitMarks: ['ui-kit', 'ui/', 'design-system'],
  sharedFolder: 'components/',
  appFolder: 'src/',
  tiers: ['kit', 'app', 'other'],
} as const

function tierOf(component: Counted): Ranked['tier'] {
  const named = [component.pkg ?? '', component.file]
  if (named.some((text) => RANK.kitMarks.some((mark) => text.includes(mark)))) return 'kit'
  if (component.pkg !== null && component.file.includes(RANK.sharedFolder)) return 'kit'
  if (component.file.startsWith(RANK.appFolder)) return 'app'
  return 'other'
}
