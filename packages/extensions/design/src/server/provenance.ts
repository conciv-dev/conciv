import {groupBy, uniqBy} from 'es-toolkit'
import type {z} from 'zod'
import type {Storage} from 'unstorage'
import {Visitor, type JSXChild, type JSXElement, type JSXExpression} from 'oxc-parser'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {DESIGN_TOOLS, type Delta, type LiveComponent} from '../shared/defs.js'
import {createCssMap} from './css-map.js'

export function createProvenance(input: {project: Storage; cwd: string; bundler: BundlerBridge | undefined}) {
  const css = createCssMap(input)
  return {
    attribute: (request: {
      entries: Attributed[]
      page: ServerToolPageAccess
      width: number
      height: number
    }): Promise<Delta[][]> => attributeAll({...request, css}),
    liveText: (source: SourceLoc | null): Promise<LiveText | null> => readLiveText({css, source}),
    dispose: css.dispose,
  }
}

type CssMap = ReturnType<typeof createCssMap>

type Attributed = {
  deltas: Delta[]
  live: LiveComponent
  selector: string
  host: Owner | null
}

type Owner = {selector: string; live: LiveComponent}

type SourceLoc = NonNullable<LiveComponent['source']>

type LiveRole = 'literal' | 'expression' | 'mixed'

type LiveText = {role: LiveRole; literals: string[]}

const [, , , , , , , winnerDef] = DESIGN_TOOLS

type WinnerResult = z.output<NonNullable<typeof winnerDef.outputSchema>>

async function attributeAll(input: {
  entries: Attributed[]
  page: ServerToolPageAccess
  width: number
  height: number
  css: CssMap
}): Promise<Delta[][]> {
  const {entries, css} = input
  const wanted = entries.flatMap((entry) => entry.deltas.flatMap((delta) => lookups({delta, entry})))
  const winners = wanted.length === 0 ? new Map<string, WinnerResult>() : await resolveWinners({...input, wanted})
  return Promise.all(
    entries.map((entry) => Promise.all(entry.deltas.map((delta) => attributeDelta({delta, entry, winners, css})))),
  )
}

async function attributeDelta(input: {
  delta: Delta
  entry: Attributed
  winners: Map<string, WinnerResult>
  css: CssMap
}): Promise<Delta> {
  const {delta, entry, winners} = input
  if (delta.kind === 'text') return sourcedText({delta, entry})
  const [found] = lookups({delta, entry}).flatMap(({property, owner}) => {
    const winner = winners.get(owner.selector)?.[property]
    return winner === null || winner === undefined || winner.inherited ? [] : [{property, winner, owner}]
  })
  if (found === undefined) return delta
  const provenance = await input.css.declaration({
    winner: found.winner,
    property: found.property,
    component: found.owner.live,
    target: delta.target,
  })
  return {...delta, ...provenance}
}

function sourcedText(input: {delta: Delta; entry: Attributed}): Delta {
  const {delta} = input
  const {source} = input.entry.live
  if (delta.kind !== 'text' || source === null) return delta
  return {...delta, via: 'source', file: source.file, line: source.line, column: source.column}
}

async function resolveWinners(input: {
  wanted: Lookup[]
  width: number
  height: number
  page: ServerToolPageAccess
}): Promise<Map<string, WinnerResult>> {
  const groups = groupBy(
    uniqBy(input.wanted, (lookup) => `${lookup.owner.selector} ${lookup.property}`),
    (lookup) => lookup.owner.selector,
  )
  const results = await Promise.all(
    Object.entries(groups).map(async ([selector, group]): Promise<[string, WinnerResult]> => {
      const reply = await input.page.call(winnerDef.name, {
        selector,
        properties: group.map((lookup) => lookup.property),
        width: input.width,
        height: input.height,
      })
      return [selector, winnerDef.outputSchema?.parse(reply) ?? {}]
    }),
  )
  return new Map(results)
}

function lookups(input: {delta: Delta; entry: Attributed}): Lookup[] {
  const {delta, entry} = input
  return DELTA_PROPERTIES[delta.kind]({delta, axis: entry.live.axis}).flatMap((property) => {
    const owner = PARENT_PROPERTIES.includes(property) ? entry.host : entry
    return owner === null ? [] : [{property, owner}]
  })
}

type Lookup = {property: string; owner: Owner}

type Candidates = (input: {delta: Delta; axis: LiveComponent['axis']}) => string[]

const ALIGNMENT = ['justify-content', 'align-items']

const PARENT_PROPERTIES: readonly string[] = ['gap']

function insetCandidates(side: 'left' | 'right' | 'top' | 'bottom'): Candidates {
  const size = side === 'top' || side === 'bottom' ? ['min-height', 'height'] : ['min-width', 'width']
  return () => [`padding-${side}`, ...size, ...ALIGNMENT]
}

function gap(before: boolean): Candidates {
  return ({axis}) => {
    const row = before ? 'margin-left' : 'margin-right'
    const column = before ? 'margin-top' : 'margin-bottom'
    return ['gap', axis === 'row' ? row : column]
  }
}

const DELTA_PROPERTIES = {
  'inset-left': insetCandidates('left'),
  'inset-right': insetCandidates('right'),
  'inset-top': insetCandidates('top'),
  'inset-bottom': insetCandidates('bottom'),
  'gap-before': gap(true),
  'gap-after': gap(false),
  align: () => [...ALIGNMENT, 'margin'],
  padding: ({delta}) => (delta.side === 'y' ? ['padding-top', 'padding-bottom'] : ['padding-left', 'padding-right']),
  fontSize: () => ['font-size'],
  lineHeight: () => ['line-height'],
  fontWeight: () => ['font-weight'],
  font: () => ['font-family'],
  background: () => ['background-color'],
  foreground: () => ['color'],
  radius: () => ['border-radius'],
  border: ({delta}) => [`border-${delta.side ?? 'top'}-color`, 'border-color', 'border'],
  axis: () => ['flex-direction', 'display'],
  columns: () => ['grid-template-columns'],
  sizing: () => ['width'],
  width: () => ['width', 'min-width', 'max-width', 'flex-basis'],
  height: () => ['height', 'min-height'],
  lines: () => ['width', 'max-width', 'min-width', 'flex-basis'],
  text: () => [],
  pixels: () => [],
} as const satisfies Record<Delta['kind'], Candidates>

type Parts = {literals: string[]; expressions: number}

const NONE: Parts = {literals: [], expressions: 0}

function merged(all: Parts[]): Parts {
  return {
    literals: all.flatMap((part) => part.literals),
    expressions: all.reduce((sum, part) => sum + part.expressions, 0),
  }
}

function expressionParts(expression: JSXExpression): Parts {
  if (expression.type === 'JSXEmptyExpression') return NONE
  if (expression.type === 'Literal' && typeof expression.value === 'string') {
    return {literals: [expression.value.trim()], expressions: 0}
  }
  return {literals: [], expressions: 1}
}

function childParts(child: JSXChild): Parts {
  switch (child.type) {
    case 'JSXText': {
      const text = child.value.trim()
      return text === '' ? NONE : {literals: [text], expressions: 0}
    }
    case 'JSXElement':
    case 'JSXFragment':
      return merged(child.children.map(childParts))
    case 'JSXSpreadChild':
      return {literals: [], expressions: 1}
    case 'JSXExpressionContainer':
      return expressionParts(child.expression)
  }
}

function partsRole(found: Parts): LiveRole | null {
  if (found.expressions > 0) return found.literals.length > 0 ? 'mixed' : 'expression'
  return found.literals.length > 0 ? 'literal' : null
}

async function readLiveText(input: {css: CssMap; source: SourceLoc | null}): Promise<LiveText | null> {
  const site = await input.css.site(input.source)
  if (site === null) return null
  const elements: JSXElement[] = []
  new Visitor({
    JSXElement(node) {
      if (node.openingElement.start === site.element.start) elements.push(node)
    },
  }).visit(site.program)
  const [element] = elements
  if (element === undefined) return null
  const found = merged(element.children.map(childParts))
  const kind = partsRole(found)
  return kind === null ? null : {role: kind, literals: found.literals}
}
