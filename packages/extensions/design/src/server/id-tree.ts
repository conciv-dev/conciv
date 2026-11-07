import {createHash} from 'node:crypto'
import type {Box, IdNode, IdTree, LiveComponent, Mapping} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'

export function idTreeOf(input: {
  live: LiveComponent
  sheets: string
  mapping: Mapping
  previous: IdTree | null
  revote?: boolean
}): {
  root: IdNode
  changed: Set<string>
  hash: string
} {
  const drafts = new Map<string, Draft>()
  const tops: string[] = []
  input.live.children.forEach((element) => visit({element, above: null, drafts, tops}))
  const before = new Map(input.previous === null ? [] : [...walk(input.previous.root)].map(({node}) => [node.id, node]))
  const moved = [...drafts.values()].filter((draft) => {
    const old = before.get(draft.id)
    return old !== undefined && changedSince({draft, old})
  })
  const changed =
    input.revote === true ? new Set(drafts.keys()) : new Set(moved.flatMap((draft) => under({id: draft.id, drafts})))
  const built = (id: string): IdNode => {
    const draft = drafts.get(id)
    const kids = draft?.kids ?? []
    return {
      id,
      dom: draft?.dom ?? [],
      cssom: draft?.cssom ?? [],
      src: draft?.src ?? ROOT_SRC,
      fom: draft === undefined || changed.has(id) ? [] : (input.mapping[id]?.nodes ?? []),
      children: kids.map(built),
    }
  }
  const root = {...built(ROOT_ID), children: tops.map(built)}
  const sites = [...drafts.values()].map((draft) => [draft.id, draft.dom, draft.cssom, draft.src])
  const hash = createHash('sha256')
    .update(JSON.stringify({sheets: input.sheets, sites}))
    .digest('hex')
  return {root, changed, hash}
}

type Draft = Omit<IdNode, 'fom' | 'children'> & {kids: string[]}

const ROOT_ID = ''

const ROOT_SRC: IdNode['src'] = {at: null, element: 'body', classes: [], parent: null}

const INLINE = 'inline'

const SHIFT_PX = designConfig.tolerances.slightShiftPx

function visit(input: {
  element: LiveComponent
  above: LiveComponent | null
  drafts: Map<string, Draft>
  tops: string[]
}): void {
  const {element, above, drafts, tops} = input
  const {key} = element
  if (key !== null) record({element, key, above, drafts, tops})
  element.children.forEach((child) => visit({...input, element: child, above: key === null ? above : element}))
}

function record(input: {
  element: LiveComponent
  key: string
  above: LiveComponent | null
  drafts: Map<string, Draft>
  tops: string[]
}): void {
  const {element, key, above, drafts} = input
  const parent = above?.key ?? null
  const draft = drafts.get(key) ?? created({key, element, parent, drafts, tops: input.tops})
  const box = rounded(element.bounds)
  const origin = above === null ? {x: 0, y: 0} : rounded(above.bounds)
  draft.dom.push({
    path: element.path,
    instance: element.repeat,
    box,
    at: {...box, x: box.x - origin.x, y: box.y - origin.y},
    text: ownText(element),
    drawn: element.drawn || element.styles.gradient !== null,
    kids: element.children.length,
  })
  draft.cssom.push({...element.styles, path: element.path, columns: element.columns})
}

function created(input: {
  key: string
  element: LiveComponent
  parent: string | null
  drafts: Map<string, Draft>
  tops: string[]
}): Draft {
  const {key, element, parent, drafts} = input
  const draft: Draft = {
    id: key,
    dom: [],
    cssom: [],
    src: {at: element.source, element: element.tag.toLowerCase(), classes: element.hints, parent},
    kids: [],
  }
  drafts.set(key, draft)
  const holder = parent === null ? undefined : drafts.get(parent)
  if (holder === undefined) input.tops.push(key)
  holder?.kids.push(key)
  return draft
}

function changedSince(input: {draft: Draft; old: IdNode}): boolean {
  const {draft, old} = input
  if (draft.src.element !== old.src.element || draft.src.classes.join(' ') !== old.src.classes.join(' ')) return true
  return draft.dom.some((dom, index) => {
    const was = old.dom.find((entry) => entry.instance !== null && entry.instance === dom.instance) ?? old.dom[index]
    if (was === undefined) return false
    const style = draft.cssom[index]
    const wasStyle = old.cssom[old.dom.indexOf(was)]
    const restyled =
      style !== undefined &&
      wasStyle !== undefined &&
      (style.display !== wasStyle.display || style.flexDirection !== wasStyle.flexDirection)
    return restyled || Math.abs(dom.at.x - was.at.x) > SHIFT_PX || Math.abs(dom.at.y - was.at.y) > SHIFT_PX
  })
}

function under(input: {id: string; drafts: Map<string, Draft>}): string[] {
  const kids = input.drafts.get(input.id)?.kids ?? []
  return [input.id, ...kids.flatMap((id) => under({...input, id}))]
}

function ownText(live: LiveComponent): string {
  if (live.text !== '' || live.children.length === 0) return live.text
  return live.children.every((child) => child.styles.display === INLINE) ? allText(live) : ''
}

function allText(live: LiveComponent): string {
  return [live.text, ...live.children.map(allText)].filter(Boolean).join(' ')
}

function rounded(box: Box): Box {
  return {x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h)}
}
