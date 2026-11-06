import type {Box, DesignNode, GateRow, LiveComponent, Reflow} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import type {renderersOf} from './renderers.js'

export function reflowAt(input: {
  root: DesignNode
  renderers: ReturnType<typeof renderersOf>
  live: LiveComponent
  width: number
  overflowX: boolean
}): Reflow {
  const {root, renderers, width, overflowX} = input
  const tagged = [...walk(root)].flatMap(({node}) => (node.reflow === undefined ? [] : [{tag: node.reflow, node}]))
  const tags = tagged.map(({tag, node}) => ({...tag, node: node.id}))
  const page = renderers.of(root.id)[0]
  if (page === undefined) {
    return {
      width,
      rootHeight: 0,
      sticksOut: [],
      overflowX,
      overlaps: [],
      tags: tags.map((tag) => ({...tag, ok: null, why: 'no element'})),
      rows: [],
    }
  }
  const inside = [...walkWithin(page)].filter(({element}) => renderers.nodeOf(element) !== null)
  return {
    width,
    rootHeight: Math.round(page.bounds.h),
    sticksOut: inside.flatMap(({element, clipped}) => {
      const node = renderers.nodeOf(element)
      return node !== null && !clipped && runsOut({box: element.bounds, page: page.bounds}) ? [node] : []
    }),
    overflowX,
    overlaps: inside.flatMap(({element}) => overlapsUnder({element, renderers})),
    tags: tags.map((tag) => verdictOf({tag, element: renderers.of(tag.node)[0]})),
    rows: tagged.flatMap(({tag, node}) => twoWay({tag, node, width, element: renderers.of(node.id)[0]})),
  }
}

type Tag = Omit<Reflow['tags'][number], 'ok' | 'why'>

type Placed = {element: LiveComponent; clipped: boolean}

const EDGE_PX = 2
const COVER_PX = 8
const LINE_PX = 4
const ABSOLUTE = 'absolute'
const VISIBLE = 'visible'

function* walkWithin(page: LiveComponent): Generator<Placed> {
  for (const child of page.children) yield* placed({element: child, clipped: false})
}

function* placed(step: Placed): Generator<Placed> {
  yield step
  const clips = step.clipped || step.element.styles.overflowX !== VISIBLE
  for (const child of step.element.children) yield* placed({element: child, clipped: clips})
}

function runsOut(input: {box: Box; page: Box}): boolean {
  const {box, page} = input
  return box.w > 0 && (box.x + box.w > page.x + page.w + EDGE_PX || box.x < page.x - EDGE_PX)
}

function overlapsUnder(input: {element: LiveComponent; renderers: ReturnType<typeof renderersOf>}): [string, string][] {
  const kids = input.element.children.flatMap((kid) => {
    const node = input.renderers.nodeOf(kid)
    return node === null || kid.styles.position === ABSOLUTE ? [] : [{node, box: kid.bounds}]
  })
  return kids.flatMap((a, index) =>
    kids.slice(index + 1).flatMap((c): [string, string][] => {
      const x = Math.min(a.box.x + a.box.w, c.box.x + c.box.w) - Math.max(a.box.x, c.box.x)
      const y = Math.min(a.box.y + a.box.h, c.box.y + c.box.h) - Math.max(a.box.y, c.box.y)
      return x > COVER_PX && y > COVER_PX && a.box.w > 0 && c.box.w > 0 ? [[a.node, c.node]] : []
    }),
  )
}

function verdictOf(input: {tag: Tag; element: LiveComponent | undefined}): Reflow['tags'][number] {
  const {tag, element} = input
  if (element === undefined) return {...tag, ok: null, why: 'no element'}
  if (tag.kind === 'scroll') {
    const ok = !element.scrolls || element.styles.overflowX !== VISIBLE
    return {...tag, ok, why: ok ? '' : 'content runs out of the node and it does not scroll'}
  }
  const rs = element.children
    .filter((kid) => kid.styles.position !== ABSOLUTE && kid.bounds.w > 0)
    .map((kid) => kid.bounds)
  const box = element.bounds
  const outside = rs.filter((r) => r.x + r.w > box.x + box.w + EDGE_PX || r.x < box.x - EDGE_PX).length
  const stacked = rs.every((r, index) => {
    const before = rs[index - 1]
    return before === undefined || r.y >= before.y + before.h - EDGE_PX
  })
  const lines = new Set(rs.map((r) => Math.round(r.y / LINE_PX))).size
  const least = tag.minChildWidth
  const tooNarrow = least === undefined ? 0 : rs.filter((r) => r.w < least - 1).length
  const flowed = tag.kind === 'stack' ? stacked : lines > 1
  const ok = outside === 0 && (tooNarrow === 0 || flowed)
  if (ok) return {...tag, ok, why: ''}
  const how = tag.kind === 'stack' ? 'stacked' : 'wrapped'
  const why =
    outside > 0 ? `${outside} children outside the node` : `${tooNarrow} children narrower than ${least} and not ${how}`
  return {...tag, ok, why}
}

function twoWay(input: {
  tag: NonNullable<DesignNode['reflow']>
  node: DesignNode
  width: number
  element: LiveComponent | undefined
}): GateRow[] {
  const {tag, node, width, element} = input
  const {breakpoint} = tag
  if (element === undefined || breakpoint === undefined || tag.kind === 'scroll') return []
  const rs = element.children
    .filter((kid) => kid.styles.position !== ABSOLUTE && kid.bounds.w > 0)
    .map((kid) => kid.bounds)
  const [first] = rs
  if (first === undefined || rs.length < 2) return []
  const oneLine = rs.every((r) => r.y < first.y + first.h - EDGE_PX && r.y + r.h > first.y + EDGE_PX)
  const stacked = rs.every((r, index) => {
    const before = rs[index - 1]
    return before === undefined || r.y >= before.y + before.h - EDGE_PX
  })
  const wide = Math.round(element.bounds.w)
  const kind = node.gate?.kind ?? node.kind
  const name = node.figma?.name ?? ''
  const head = `${kind} ${name} [${node.id}] at ${width} wide`
  const row = (text: string): GateRow[] => [{node: node.id, key: element.key, kind, name, text, magnitude: 'much'}]
  if (wide >= breakpoint)
    return oneLine
      ? []
      : row(
          `${head}: stacked too early; it is ${wide}px wide, at or above its breakpoint ${breakpoint}px, so its children stay on one line`,
        )
  const flowed = tag.kind === 'stack' ? stacked : !oneLine
  if (flowed) return []
  const how = tag.kind === 'stack' ? 'are not one under another' : 'stay on one line'
  return row(
    `${head}: did not ${tag.kind}; it is ${wide}px wide, under its breakpoint ${breakpoint}px, and its children ${how}`,
  )
}
