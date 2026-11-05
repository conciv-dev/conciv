import {maxBy, uniq} from 'es-toolkit'
import {DESIGN_TOOLS, type Box, type Delta, type DiffReport, type Match, type Run, type Words} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import {box} from '../shared/box.js'
import {buildReport} from './report.js'
import {createBrief} from './brief.js'
import {createProjections} from './projections.js'

export function createWords(input: {config: DesignConfig; cwd: string}): Words {
  const blind = input.config.blind
  const projections = createProjections(input)
  return {
    outline: BRIEF.outline,
    placeholder: BRIEF.placeholder,
    guide: (request) => (request.blind || blind ? `${DESIGN_GUIDE} ${BLIND_GUIDE}` : DESIGN_GUIDE),
    report: (request) => buildReport({...request, phrases: PHRASES, cwd: input.cwd}),
    status: (request) => projections.status({...request, phrases: SAYINGS}),
    watch: (request) => projections.watch({...request, phrases: SAYINGS}),
    hint: hintOf,
  }
}

type DesignConfig = ReturnType<typeof designConfig.parse>
type Item = Run['items'][number]
type Stage = NonNullable<Run['stage']>
type Changes = DiffReport['changes']
type Node = Match['node']
type TextNode = Extract<Node, {kind: 'text'}>
type Layout = NonNullable<Node['layout']>
type LayoutRun = NonNullable<Layout['runs']>[number]

const TOLERANCES = designConfig.tolerances
const STAGES = ['structure', 'content', 'geometry', 'paint'] as const satisfies readonly Stage[]

function hintOf(input: Parameters<Words['hint']>[0]): string {
  const {route = '', expected = '', error} = input
  switch (input.kind) {
    case 'refused-route':
      return `the tab shows ${route} but the design target is the design of ${expected}; navigate the tab to ${expected}, then diff again`
    case 'page-error':
      return `${PAGE_ERROR_BRIEF}: ${error ?? ''}`
    case 'hidden-tab':
      return error === undefined ? UNANSWERED_HINT : `${UNANSWERED_HINT}; ${error}`
    case 'next':
      return DESIGN_GUIDE
    case 'no-target':
      return NO_TARGET_MESSAGE
    case 'unchanged':
      return UNCHANGED_HINT
    case 'unknown-section':
      return `the design has no section ${input.section ?? ''}; the sections are ${expected}`
    case 'no-run':
      return NO_RUN_MESSAGE
    case 'image-unreadable':
      return error === undefined ? IMAGE_UNREADABLE : `${IMAGE_UNREADABLE}: ${error}`
  }
}

function itemSentence(input: {item: Item; root: Match}): string {
  const {item, root} = input
  const found = [...walk(root)].find(({node}) => node.node.id === item.node)
  if (item.kind === 'extra') return extraSentence({source: item.source, live: item.box})
  if (item.kind === 'offset') return offsetSentence({item, match: found?.node ?? root})
  if (found === undefined) return 'build the element the design shows'
  const match = found.node
  const owner = found.parent ?? root
  if (item.kind === 'unbuilt') {
    const run = (owner.node.layout?.runs ?? []).find((entry) => item.key === `unbuilt:${entry.children.join('+')}`)
    if (run !== undefined && item.key !== `unbuilt:${match.node.id}`) return runSentence({run, owner, root})
    return unbuiltSentence({match, parent: owner, root})
  }
  const delta = match.deltas.find((entry) => item.key === deltaKey({match, delta: entry}))
  if (delta === undefined || match.live === null) return `${item.kind} differs from the design`
  const component = componentLabel({tag: match.live.tag, source: match.live.source})
  return `${component}: ${pairSentence({delta, match, live: match.live})}`
}

function deltaKey(input: {match: Match; delta: Delta}): string {
  const {match, delta} = input
  return `${match.node.id}:${delta.kind}${delta.side === undefined ? '' : `:${delta.side}`}`
}

function pairSentence(input: {delta: Delta; match: Match; live: NonNullable<Match['live']>}): string {
  const {delta, match, live} = input
  if (delta.kind === 'fontSize') {
    const [text] = [...walk(match)].flatMap(({node}) =>
      node.node.kind === 'text' && node.node.typography !== undefined ? [node.node] : [],
    )
    const lines =
      text?.typography === undefined || text.lines.length < 2
        ? ''
        : ` (${text.lines.length} lines of ${Math.round(text.typography.lineHeight)} px)`
    return designConfig.deltaSentence({...delta, target: `${delta.target}${lines}`})
  }
  if (delta.kind === 'lines') {
    const width = Math.round(match.node.box.w)
    const count = delta.live === 1 ? '1 line' : `${delta.live} lines`
    return `wraps to ${count} where the design has ${delta.target}; the design's text box is ${width} px wide${designConfig.setVia(delta)}`
  }
  if (delta.kind !== 'sizing') return designConfig.deltaSentence(delta)
  const width = Math.round(live.box.w)
  const declared =
    designConfig.traced(delta) && delta.declaration !== undefined ? `, declared as \`${delta.declaration}\`` : ''
  const rule = delta.target === 'fill' ? 'fill the row (flex: 1)' : 'fit its content'
  return `let the ${live.tag} ${rule}; it is sized ${width} px${declared}${designConfig.at(delta)}`
}

function componentLabel(input: {tag: string; source: {file: string; line: number} | null | undefined}): string {
  const {tag, source} = input
  if (source === null || source === undefined) return tag
  return `${tag} (${source.file}:${source.line})`
}

function extraSentence(input: {source: Item['source']; live: Box}): string {
  const {live} = input
  const place = ` at ${Math.round(live.x)},${Math.round(live.y)} (${Math.round(live.w)}×${Math.round(live.h)})`
  return `${componentLabel({tag: 'the element', source: input.source})} renders${place} where the design shows nothing; remove it or match the design`
}

function offsetSentence(input: {item: Item; match: Match}): string {
  const {item, match} = input
  const dx = Math.round(match.shift?.x ?? 0)
  const dy = Math.round(match.shift?.y ?? 0)
  if (item.node === undefined) return `move the page content by ${dx},${dy} px to where the design places it`
  const x = Math.round(item.box.x)
  const y = Math.round(item.box.y)
  const what = componentLabel({tag: 'the element', source: item.source})
  return `move ${what} to ${x + dx},${y + dy} (now at ${x},${y})`
}

function unbuiltSentence(input: {match: Match; parent: Match; root: Match}): string {
  const {match} = input
  const children = ordered(match)
  if (children.length === 0) return leafSentence(input)
  const props = properties({layout: match.node.layout, children})
  if (children.every((child) => child.live === null) && loneText(children) === null) {
    const listed = children.slice(0, LISTED).map(childPhrase)
    const more = children.length > LISTED ? [`and ${children.length - LISTED} more`] : []
    const tail = props.length === 0 ? '' : `; ${props.join(', ')}`
    return `build ${containerName({match, withCount: false})}${placePhrase(input)}: ${[...listed, ...more].join(', ')}${tail}`
  }
  const tail = props.length === 0 ? '' : `: ${props.join(', ')}`
  return `build ${containerName({match, withCount: true})}${placePhrase(input)}${tail}`
}

function leafSentence(input: {match: Match; parent: Match; root: Match}): string {
  const {match, parent, root} = input
  const {node} = match
  const seat = childPosition({node, parent: parent.node})
  const size = leafSize(node)
  const subject = named(match) ? label(match) : article(node)
  if (seat === null) return `build ${subject}${size}`
  if (seat.index > TOLERANCES.ordinalLimit) {
    return `build ${subject}${size}${anchorPhrase({area: node.box, root, word: 'near'})}`
  }
  const where =
    parent !== root && named(parent) ? ` inside ${label(parent)}` : anchorPhrase({area: node.box, root, word: 'under'})
  return `build ${subject}${size} as the ${ordinal(seat.index)} item in the ${seat.direction}${where}`
}

function leafSize(node: Node): string {
  if (node.kind === 'box') {
    const paint = node.paint === undefined ? '' : ` ${node.paint.background}`
    return ` ${Math.round(node.box.w)}x${Math.round(node.box.h)}${paint}`
  }
  return node.layout?.size === undefined ? '' : ` (${node.layout.size})`
}

function runSentence(input: {run: LayoutRun; owner: Match; root: Match}): string {
  const {run, owner, root} = input
  const members = run.children.flatMap((id) => owner.children.filter((child) => child.node.id === id))
  const [first] = members
  const area = members.length === 0 ? undefined : box.union(members.map((member) => member.node.box))
  const where = first === undefined ? '' : placePhrase({match: first, parent: owner, root, area})
  const props = properties({layout: {gap: run.gap, align: run.align}, children: members})
  const holds = members.slice(0, TOLERANCES.ordinalLimit).flatMap((member, index) => {
    const texts = textsIn(member).slice(0, LISTED)
    return texts.length === 0 ? [] : [`${ordinal(index + 1)}: ${texts.map(quoted).join(', ')}`]
  })
  const contents = holds.length === 0 ? '' : `; ${holds.join('; ')}`
  return `build a row of ${countPhrase(members)}${where}: ${props.join(', ')}${contents}`
}

function childPosition(input: {
  node: Node
  parent: Node
}): {direction: NonNullable<Layout['direction']>; index: number} | null {
  const {node, parent} = input
  const direction = parent.layout?.direction
  const index = node.layout?.index
  if (direction === undefined || index === undefined) return null
  const run = (parent.layout?.runs ?? []).find((entry) => entry.children.includes(node.id))
  if (run === undefined) return {direction, index}
  return {direction: run.direction, index: run.children.indexOf(node.id) + 1}
}

function properties(input: {layout: Partial<Layout> | undefined; children: Match[]}): string[] {
  const {layout, children} = input
  if (layout === undefined) return []
  const equal = children.length > 1 && children.every((child) => child.node.layout?.size === 'fill')
  const gap = layout.gap === undefined || children.length < 2 ? null : layout.gap
  return [
    ...(equal ? ['equal width'] : []),
    ...(gap === null ? [] : [gap.uniform ? `gap ${gap.px}` : `gaps around ${gap.px}`]),
    ...(layout.align === undefined ? [] : [`align ${layout.align}`]),
    ...(layout.wrap === true ? ['wrapping'] : []),
    ...BRIEF.padding(layout.padding),
  ]
}

function containerName(input: {match: Match; withCount: boolean}): string {
  const {match} = input
  const children = ordered(match)
  const only = loneText(children)
  if (only !== null) return `a box with ${quoted(only.text)}`
  const direction = match.node.layout?.direction ?? 'stack'
  return input.withCount ? `a ${direction} of ${countPhrase(children)}` : `a ${direction}`
}

function childPhrase(match: Match): string {
  const {node} = match
  const size = node.layout?.size === undefined ? '' : ` (${node.layout.size})`
  if (node.kind === 'text') return `${quoted(node.text)}${size}`
  if (node.kind === 'image') return `an image${size}`
  if (match.children.length === 0) return `a box${size}`
  const name = containerName({match, withCount: true})
  const gap = node.layout?.gap
  if (match.children.length === 1 || gap === undefined) return `${name}${size}`
  return `${name} (gap ${gap.px})`
}

function placePhrase(input: {match: Match; parent: Match; root: Match; area?: Box | undefined}): string {
  const {match, parent, root} = input
  const {node} = match
  if (childPosition({node, parent: parent.node}) === null) return ''
  const index = node.layout?.index ?? 0
  const previous = parent.children.find((sibling) => sibling.node.layout?.index === index - 1)
  if (previous !== undefined && named(previous)) {
    const direction = parent.node.layout?.direction
    return ` ${direction === 'row' || direction === 'grid' ? 'after' : 'under'} ${label(previous)}`
  }
  if (previous === undefined && parent === root) return ' at the top of the page'
  if (previous === undefined && named(parent)) return ` inside ${label(parent)}`
  return anchorPhrase({area: input.area ?? node.box, root, word: 'under'})
}

function anchorPhrase(input: {area: Box; root: Match; word: 'under' | 'near'}): string {
  const {area, root, word} = input
  const [nearest] = [...walk(root)]
    .flatMap(({node: {node}}) => (node.kind === 'text' && above({text: node, area}) ? [node] : []))
    .toSorted((a, b) => area.y - a.box.y - (area.y - b.box.y))
  if (nearest === undefined) return ' at the top of the page'
  return ` ${word} ${quoted(clipped(nearest.text))}`
}

function above(input: {text: TextNode; area: Box}): boolean {
  const {text, area} = input
  const overlaps = text.box.x < area.x + area.w && text.box.x + text.box.w > area.x
  return overlaps && text.box.y < area.y && !glyphRun(text) && text.text.trim() !== ''
}

function structural(input: {match: Match; parent: Match; root: Match}): boolean {
  const {match, parent, root} = input
  return match.node.kind !== 'image' && !glyphRun(match.node) && (parent === root || parent.live !== null)
}

function glyphRun(node: Node): boolean {
  return node.kind === 'text' && designConfig.folded(node.text).length === 1 && node.box.h < GLYPH_RUN_HEIGHT
}

function clipped(text: string): string {
  const trimmed = text.trim()
  return trimmed.length <= ANCHOR_LENGTH ? trimmed : `${trimmed.slice(0, ANCHOR_LENGTH).trimEnd()}…`
}

function named(match: Match): boolean {
  if (match.node.kind === 'text') return true
  if (match.node.kind === 'image') return false
  return textsIn(match).length > 0
}

function article(node: Node): string {
  return node.kind === 'image' ? 'an image' : 'a box'
}

function label(match: Match): string {
  const {node} = match
  if (node.kind === 'text') return `the text ${quoted(node.text)}`
  if (node.kind === 'image') return 'the image'
  const [text] = textsIn(match)
  return text === undefined ? 'the box' : `the box with ${quoted(text)}`
}

function countPhrase(matches: Match[]): string {
  const nouns = uniq(matches.map(noun))
  const [only] = nouns
  if (nouns.length !== 1 || only === undefined) return `${matches.length} items`
  return matches.length === 1 ? `1 ${only[0]}` : `${matches.length} ${only[1]}`
}

function noun(match: Match): readonly [string, string] {
  if (match.node.kind === 'text') return NOUNS.text
  if (match.node.kind === 'image') return NOUNS.image
  return match.children.length === 0 || loneText(match.children) !== null ? NOUNS.box : NOUNS.card
}

function loneText(children: Match[]): TextNode | null {
  const [only] = children
  const node = only?.node
  return children.length === 1 && node?.kind === 'text' ? node : null
}

function textsIn(match: Match): string[] {
  return ordered(match).flatMap((child) => [
    ...(child.node.kind === 'text' ? [child.node.text] : []),
    ...textsIn(child),
  ])
}

function ordered(match: Match): Match[] {
  return match.children.toSorted((a, b) => (a.node.layout?.index ?? 0) - (b.node.layout?.index ?? 0))
}

function quoted(text: string): string {
  return `"${text}"`
}

function ordinal(index: number): string {
  const teen = index % 100 >= 11 && index % 100 <= 13
  return `${index}${teen ? 'th' : (ORDINAL_SUFFIXES[index % 10] ?? 'th')}`
}

function changesOf(input: {previous: Run | null; root: Match; items: Item[]; crop: (node: string) => string}): Changes {
  const {previous, root, items, crop} = input
  if (previous === null) return {done: [], regressed: [], paired: [], lost: [], moved: []}
  const before = new Map(
    [...walk(previous.root)].flatMap(({node, depth}) => (depth === 0 ? [] : [[node.node.id, node] as const])),
  )
  const listed = [...walk(root)].flatMap(({node, depth}) =>
    depth === 0 || node.status === 'accepted' ? [] : [{now: node, was: before.get(node.node.id) ?? null}],
  )
  const entry = (change: {match: Match; says: (subject: string) => string}): Changes['done'][number] => ({
    node: change.match.node.id,
    sentence: change.says(changeSubject({match: change.match, root})),
    crop: crop(change.match.node.id),
  })
  const newly = (status: Match['status']): Match[] =>
    listed.filter(({now, was}) => now.status === status && (was?.status ?? 'unbuilt') !== status).map(({now}) => now)
  const worst = (match: Match): string | null => {
    const item = maxBy(
      items.filter((candidate) => candidate.node === match.node.id && candidate.stage !== null),
      (candidate) => candidate.size,
    )
    return item === undefined ? null : itemSentence({item, root})
  }
  return {
    done: newly('done').map((match) => entry({match, says: (subject) => `${subject} matches the design`})),
    regressed: newly('regressed').map((match) =>
      entry({match, says: (subject) => worst(match) ?? `${subject} lost its element`}),
    ),
    paired: listed
      .filter(
        ({now, was}) => (was?.status ?? 'unbuilt') === 'unbuilt' && (now.status === 'paired' || now.status === 'done'),
      )
      .map(({now}) => entry({match: now, says: (subject) => `${subject} is built`})),
    lost: listed
      .filter(({now, was}) => now.live === null && was !== null && was.live !== null)
      .map(({now}) => entry({match: now, says: (subject) => `${subject} lost its element`})),
    moved: listed.flatMap(({now, was}) => {
      const shift =
        now.live === null || was === null || was.live === null ? null : shifted({now: now.live.box, was: was.live.box})
      if (shift === null) return []
      return [entry({match: now, says: (subject) => `${subject} moved by ${shift.dx},${shift.dy} px`})]
    }),
  }
}

function shifted(input: {now: Box; was: Box}): {dx: number; dy: number} | null {
  const {now, was} = input
  const edges = [now.x - was.x, now.y - was.y, now.w - was.w, now.h - was.h]
  if (!edges.some((edge) => Math.abs(edge) > TOLERANCES.tileMargin)) return null
  return {dx: Math.round(now.x - was.x), dy: Math.round(now.y - was.y)}
}

function changeSubject(input: {match: Match; root: Match}): string {
  const {match, root} = input
  if (named(match)) return label(match)
  return `${article(match.node)}${anchorPhrase({area: match.node.box, root, word: 'under'})}`
}

function changeLine(input: {changes: Changes; round: number; similarity: {now: number; was: number} | null}): string {
  const {changes, round, similarity} = input
  const [first] = changes.regressed
  const parts = [
    changes.done.length === 0 ? null : `${changes.done.length} done`,
    first === undefined ? null : `${changes.regressed.length} regressed (${clipped(first.sentence)})`,
    changes.paired.length === 0 ? null : `${changes.paired.length} paired`,
    changes.lost.length === 0 ? null : `${changes.lost.length} lost`,
    changes.moved.length === 0 ? null : `${changes.moved.length} moved`,
  ].filter((part) => part !== null)
  const trend =
    similarity === null ? '' : `, similarity ${similarity.now.toFixed(2)} (was ${similarity.was.toFixed(2)})`
  return `since round ${round}: ${parts.length === 0 ? 'no node changed' : parts.join(', ')}${trend}`
}

function stalledLine(input: {stage: Stage; score: number[]; unchanged: Item[]}): string {
  const {stage, score, unchanged} = input
  const total = score[1 + STAGES.indexOf(stage)] ?? 0
  const head = `stalled: the ${stage} total held at ${total} for ${TOLERANCES.stallRounds} rounds`
  if (unchanged.length === 0) return head
  const first = unchanged.slice(0, NAMED).map((item) => item.sentence)
  return `${head}; ${unchanged.length} items unchanged, first: ${first.join('; ')}`
}

function flippedLine(input: {items: Item[]; round: number}): string {
  const {items, round} = input
  const head =
    items.length === 1
      ? `1 item moved back to its round-${round} value`
      : `${items.length} items moved back to their round-${round} values`
  return `${head}: ${items
    .slice(0, NAMED)
    .map((item) => item.sentence)
    .join('; ')}`
}

function paintedLine(count: number): string {
  return `painted: ${count} elements are absolutely positioned; lay the page out with flow, flex or grid and let the browser place them`
}

function warningSentence(delta: Delta): string {
  if (delta.warning === 'svg-drawn') {
    const source = delta.file === undefined ? null : {file: delta.file, line: delta.line ?? 0}
    const what = componentLabel({tag: delta.selector ?? 'the element', source})
    return `${what}: ${delta.live}; replace it with ${delta.target}`
  }
  return `replace the hard-coded sample "${delta.live}"${designConfig.at(delta)} with the expression that renders it`
}

function reportHint(input: {
  attributed: boolean
  absolute: boolean
  cut: {listed: number; shown: number; paired: number}
}): string | null {
  const {cut} = input
  const hints = [
    cut.listed <= cut.shown
      ? null
      : `showing ${cut.shown} of ${cut.paired} paired components, those with deltas first; full: true lists up to limit of each and truncated says how many more`,
    input.attributed ? null : HINT,
    input.absolute ? null : ORIGIN_HINT,
  ].filter((hint) => hint !== null)
  return hints.length === 0 ? null : hints.join('; ')
}

const BRIEF = createBrief()

const PHRASES = {
  item: itemSentence,
  changes: changesOf,
  change: changeLine,
  stalled: stalledLine,
  flipped: flippedLine,
  painted: paintedLine,
  warning: warningSentence,
  line: BRIEF.line,
  hint: reportHint,
  structural,
  seat: childPosition,
  unbuiltSection: 'nothing of this section is built yet',
}

const DESIGN_GUIDE =
  "A design target is registered. Call `design_diff` to measure the live page against it, fix the brief, run it again, and stop when `stop` is set. Do not judge a design match from a screenshot. The brief names rows, columns, gaps and sizing rules; build with flow, flex and grid, never from coordinates. Never draw icons, logos or illustrations: no inline <svg> paths, no data urls, no CSS shapes copied from the image; every image and icon slot takes the Placeholder. Gradients are CSS. `data-conciv-key` attributes are written into the source by the compiler and are each element's identity for the diff: leave them in place, keep an element's key on it when you move or wrap it, and never copy one onto a second element."

const BLIND_GUIDE = "Never open a png or take a screenshot; the tool's numbers are the only view of the page you have."

const UNANSWERED_HINT = 'the page tab is hidden; bring it to the foreground and run design_diff again'

const [targetDef] = DESIGN_TOOLS

const NO_TARGET_MESSAGE = targetDef.errors?.['no-target'].message ?? ''

const IMAGE_UNREADABLE = targetDef.errors?.['image-unreadable'].message ?? ''

const UNCHANGED_HINT = 'the page has not changed since the last diff'

const NO_RUN_MESSAGE = 'the design target has no run yet; run design_diff before accepting'

const PAGE_ERROR_BRIEF = 'the page did not render'

const HINT = 'no element carries data-conciv-source; the page is not a dev build compiled by the conciv plugin'

const ORIGIN_HINT = 'the conciv engine origin is unknown, so xray is a path on the engine and not a full url'

const NAMED = 3

const ANCHOR_LENGTH = 40

const LISTED = 6

const GLYPH_RUN_HEIGHT = 14

const ORDINAL_SUFFIXES: Partial<Record<number, string>> = {1: 'st', 2: 'nd', 3: 'rd'}

const NOUNS = {
  text: ['text', 'texts'],
  image: ['image', 'images'],
  box: ['box', 'boxes'],
  card: ['card', 'cards'],
} as const

const SAYINGS = {
  item: itemSentence,
  changes: changesOf,
  line: BRIEF.line,
  structural,
  families: BRIEF.families,
  guide: DESIGN_GUIDE,
  hidden: UNANSWERED_HINT,
}
