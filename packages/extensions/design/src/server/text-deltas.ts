import type {Delta, LiveComponent, Match} from '../shared/defs.js'
import type {deltaKinds} from './kinds.js'
import type {createProvenance} from './provenance.js'
import {box as boxes} from '../shared/box.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'

export const textDeltas = {
  judge: (input: {elements: Element[]; provenance: Provenance}): Promise<Map<Element, TextJudgement>> =>
    textJudgements(input),
  rows: (input: {element: Element; judged: Map<Element, TextJudgement>}): Delta[] => textRows(input),
  warnings: async (input: {
    elements: Element[]
    judged: Map<Element, TextJudgement>
    components: LiveComponent[]
    root: Match
    provenance: Provenance
  }): Promise<Delta[]> => [...drawnWarnings(input), ...(await warningDeltas(input))],
}

type Element = Parameters<typeof deltaKinds.measure>[0]['element']

type Provenance = ReturnType<typeof createProvenance>

type TextNode = Element['texts'][number]

function sourced(input: {delta: Delta; element: Element}): Delta {
  const {source} = input.element.live
  if (source === null) return input.delta
  return {...input.delta, via: 'source', file: source.file, line: source.line, column: source.column}
}

function sameWords(text: string): string {
  const points = Array.from(text.trim()).flatMap((point) => Array.from(CONFUSABLES[point] ?? point))
  if (!points.some(casedLetter)) return folded(points.join(''))
  const start = loneGlyph(points[0]) ? 1 : 0
  const end = loneGlyph(points.at(-1)) ? points.length - 1 : points.length
  return folded(points.slice(start, end).join(''))
}

async function textJudgements(input: {
  elements: Element[]
  provenance: Provenance
}): Promise<Map<Element, TextJudgement>> {
  const judged = await Promise.all(
    input.elements
      .filter((element) => element.texts.length > 0)
      .map(async (element): Promise<[Element, TextJudgement]> => {
        const liveText = joinedText(element.live.glyphs.map((glyph) => glyph.text))
        const targetText = joinedText(
          element.texts.toSorted((a, b) => boxes.readingOrder({a: a.box, b: b.box})).map((node) => node.text),
        )
        const live = await input.provenance.liveText(element.live.source)
        const roles = new Set(element.texts.map((node) => node.role ?? 'unknown'))
        const [only] = roles
        const role: Role = roles.size === 1 && only !== undefined ? only : 'unknown'
        const equal =
          live === null ? sameWords(liveText) === sameWords(targetText) : literalsAgree({live, liveText, targetText})
        return [
          element,
          {
            verdict: textDelta({live: live?.role ?? 'literal', target: role, equal}),
            live: liveText,
            target: targetText,
          },
        ]
      }),
  )
  return new Map(judged)
}

function joinedText(texts: string[]): string {
  return texts
    .map((text) => text.trim())
    .filter((text) => text !== '')
    .join(' ')
}

function textRows(input: {element: Element; judged: Map<Element, TextJudgement>}): Delta[] {
  const found = input.judged.get(input.element)
  if (found === undefined || found.verdict !== 'text') return []
  return [{kind: 'text', live: found.live, target: found.target}]
}

async function warningDeltas(input: {
  elements: Element[]
  judged: Map<Element, TextJudgement>
  components: LiveComponent[]
  provenance: Provenance
}): Promise<Delta[]> {
  const {judged} = input
  const parents = new Map(
    flattened(input.components).flatMap((parent) =>
      parent.children.map((child): [string, LiveComponent] => [child.path, parent]),
    ),
  )
  const flagged = await Promise.all(
    input.elements.map(async (element): Promise<Delta[]> => {
      const found = judged.get(element)
      if (found === undefined || found.verdict !== 'sample-data') return []
      const marked = element.texts.some((node) => node.role === 'placeholder')
      if (
        !marked &&
        !(await rendersData({element, parent: parents.get(element.live.path), provenance: input.provenance}))
      )
        return []
      return [
        sourced({
          delta: {kind: 'text', live: found.live, target: found.target, warning: 'sample-data', box: element.liveBox},
          element,
        }),
      ]
    }),
  )
  return flagged.flat()
}

function drawnWarnings(input: {elements: Element[]; components: LiveComponent[]; root: Match}): Delta[] {
  const slots = [...walk(input.root)].flatMap(({node}) => (node.node.kind === 'image' ? [node.node] : []))
  const paired = new Map(input.elements.map((element) => [element.live.path, element.node]))
  return flattened(input.components).flatMap((component): Delta[] => {
    if (!component.drawn) return []
    const own = paired.get(component.path)
    const slot =
      own?.kind === 'image' ? own : slots.find((node) => boxes.encloses({inner: component.box, outer: node.box}))
    if (slot === undefined) return []
    const kind = designConfig.iconSized(slot.box) ? 'icon' : 'image'
    return [
      {
        kind: 'background',
        live: drawnLabel(component.tag),
        target: `<Placeholder kind="${kind}" />`,
        warning: 'svg-drawn',
        selector: component.tag,
        box: component.box,
        ...(component.source === null
          ? {}
          : {via: 'source', file: component.source.file, line: component.source.line, column: component.source.column}),
      },
    ]
  })
}

function drawnLabel(tag: string): string {
  if (tag === 'svg') return 'drawn svg'
  if (tag === 'img') return 'drawn data url'
  return 'drawn canvas'
}

async function rendersData(input: {
  element: Element
  parent: LiveComponent | undefined
  provenance: Provenance
}): Promise<boolean> {
  const {element, parent, provenance} = input
  if (parent === undefined) return false
  const siblings = parent.children.filter((child) => child.path !== element.live.path && child.text.trim() !== '')
  const texts = await Promise.all(siblings.map((sibling) => provenance.liveText(sibling.source)))
  return texts.some((text) => text !== null && text.role !== 'literal')
}

function flattened(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flattened(component.children)])
}

type TextVerdict = TextJudgement['verdict']

function textDelta(input: {live: LiveRole; target: Role; equal: boolean}): TextVerdict {
  const {live, target, equal} = input
  switch (live) {
    case 'expression':
      return null
    case 'mixed':
      return target === 'unknown' && !equal ? 'text' : null
    case 'literal':
      if (equal) return target === 'unknown' ? null : 'sample-data'
      return target === 'placeholder' ? null : 'text'
  }
}

function literalsAgree(input: {live: LiveText; liveText: string; targetText: string}): boolean {
  const {live, liveText, targetText} = input
  if (live.role !== 'mixed') return sameWords(liveText) === sameWords(targetText)
  const target = sameWords(targetText)
  return live.literals.every((literal) => target.includes(sameWords(literal)))
}

function casedLetter(point: string): boolean {
  return point.toLowerCase() !== point.toUpperCase()
}

function loneGlyph(point: string | undefined): boolean {
  if (point === undefined || casedLetter(point) || KEPT_GLYPHS.has(point)) return false
  return point < '0' || point > '9'
}

const KEPT_GLYPHS: ReadonlySet<string> = new Set(['%', '$', '€', '£', '¥', '¢', '₪', '₹', '₩', '₽', '₺'])

function folded(text: string): string {
  return [...text.toLowerCase()].filter((character) => character.trim() !== '').join('')
}

const CONFUSABLES: Record<string, string> = {
  '›': '>',
  '»': '>',
  '‹': '<',
  '«': '<',
  '—': '-',
  '–': '-',
  '“': '"',
  '”': '"',
  '„': '"',
  '‘': "'",
  '’': "'",
  '…': '...',
  '×': 'x',
  '•': '-',
  '·': '-',
}
type Role = NonNullable<TextNode['role']>

type LiveText = NonNullable<Awaited<ReturnType<Provenance['liveText']>>>

type LiveRole = LiveText['role']

type TextJudgement = {verdict: 'text' | 'sample-data' | null; live: string; target: string}
