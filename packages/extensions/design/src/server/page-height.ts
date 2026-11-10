import type {DesignNode, GateRow, LiveComponent} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import type {readIds} from '../shared/id-tree.js'

export function pageHeightRows(input: {
  root: DesignNode
  live: LiveComponent
  reads: ReturnType<typeof readIds>
  width: number
  scrollHeight: number
}): GateRow[] {
  const {root, live, reads, width, scrollHeight} = input
  const frame = Math.round(root.figma?.box.h ?? root.box.h)
  const elements = [...walk(live)].filter(({node}) => node !== live).map(({node}) => node)
  const drawn = Math.round(Math.max(frame, ...elements.map(bottomOf)))
  const page = drawn - frame > frame ? drawn : Math.round(Math.max(drawn, scrollHeight))
  if (Math.abs(page - frame) <= frame) return []
  const tall = elements.filter((element) => element.bounds.h > frame)
  const [tallest] = tall
    .filter((element) => !tall.some((other) => other.path.startsWith(`${element.path}/`)))
    .toSorted((a, b) => bottomOf(b) - bottomOf(a))
  const named =
    tallest === undefined
      ? ''
      : `; the tallest element past the frame is ${labelOf(tallest)} at ${sourceOf(tallest)}, ${Math.round(tallest.bounds.h)} px`
  return [
    {
      node: root.id,
      ...reads.named(root.id),
      kind: designConfig.rowKinds.page,
      name: root.figma?.name ?? '',
      text: `the page is ${page} px tall, the frame is ${frame}${named}`,
      magnitude: 'reflow',
      width,
    },
  ]
}

function bottomOf(element: LiveComponent): number {
  return element.bounds.y + element.bounds.h
}

function labelOf(element: LiveComponent): string {
  return `${element.tag}.${element.hints[0] ?? ''}`
}

function sourceOf(element: LiveComponent): string {
  const {source} = element
  return source === null ? 'no source line' : `${source.file}:${source.line}`
}
