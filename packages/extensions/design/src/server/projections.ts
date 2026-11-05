import {isAbsolute, relative} from 'node:path'
import {countBy, maxBy} from 'es-toolkit'
import type {Delta, Design, DesignNode, DiffReport, Match, Run, Words} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'

export function createProjections(input: {config: DesignConfig; cwd: string}): {
  status(request: Parameters<Words['status']>[0] & {phrases: Sayings}): StatusReport
  watch(request: Parameters<Words['watch']>[0] & {phrases: Sayings}): WatchReport
} {
  return {
    status: (request) => statusOf({...request, cwd: input.cwd}),
    watch: watchOf,
  }
}

type DesignConfig = ReturnType<typeof designConfig.parse>
type Item = Run['items'][number]
type StatusReport = ReturnType<Words['status']>
type WatchReport = ReturnType<Words['watch']>
type WatchRow = WatchReport['rows'][number]
type Sayings = {
  item(input: {item: Item; root: Match}): string
  changes(input: {
    previous: Run | null
    root: Match
    items: Item[]
    crop: (node: string) => string
  }): DiffReport['changes']
  line(input: {node: Match['node']; scale: number}): string
  structural(input: {match: Match; parent: Match; root: Match}): boolean
  families(root: DesignNode): string[]
  guide: string
  hidden: string
}

const TOLERANCES = designConfig.tolerances

function statusOf(input: Parameters<Words['status']>[0] & {phrases: Sayings; cwd: string}): StatusReport {
  const {record, run, design, previous, accepted, phrases, cwd} = input
  const shown = (path: string): string => (isAbsolute(path) ? relative(cwd, path) : path)
  const paths = {design: shown(record.paths.design), placeholder: shown(record.paths.placeholder)}
  const sections =
    design === null ? [] : design.root.children.toSorted((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
  const done = design !== null && finished({run, accepted})
  const families = design === null ? [] : phrases.families(design.root)
  const first = (run?.round ?? 0) === 0
  const lastAt = run === null ? null : Number(run.id.split('-')[0])
  const changes =
    run === null || previous === null
      ? {}
      : {changes: phrases.changes({previous, root: run.root, items: run.items, crop: () => ''})}
  return {
    ...(record.route === undefined ? {} : {route: record.route}),
    targets: [
      {
        id: record.id,
        width: record.width,
        mismatch: run === null ? null : run.mismatch,
        above: run === null ? 0 : aboveCount({root: run.root, phrases}),
        lastAt: lastAt === null || !Number.isFinite(lastAt) ? null : lastAt,
      },
    ],
    done,
    ...(record.acceptedRun === undefined ? {} : {acceptedRun: record.acceptedRun}),
    ...(run === null
      ? {}
      : {
          score: run.score,
          round: run.round,
          stop: run.stop,
          ...(run.similarity === null ? {} : {similarity: run.similarity}),
        }),
    ledger: ledgerCounts(
      run === null ? [] : [...walk(run.root)].flatMap(({node, depth}) => (depth === 0 ? [] : [node])),
    ),
    sections: sections.map((section) => {
      const match = run?.root.children.find((child) => child.node.id === section.id) ?? null
      const similarity = run?.sections.find((entry) => entry.id === section.id)?.similarity
      return {
        id: section.id,
        kind: section.kind,
        line: phrases.line({node: section, scale: design?.scale ?? 1}),
        ledger: ledgerCounts(match === null ? [] : [...walk(match)].map(({node}) => node)),
        roundsUsed: roundsUsed({section: section.id, rounds: input.rounds}),
        ...(similarity === undefined ? {} : {similarity}),
      }
    }),
    ...changes,
    designPath: paths.design,
    placeholderPath: paths.placeholder,
    ...statusNext({done, unanswered: input.unanswered, first, families, paths, phrases}),
    ...(design === null ? {reregister: true} : {}),
  }
}

function finished(input: {run: Run | null; accepted: Run | null}): boolean {
  const {run, accepted} = input
  if (run === null) return false
  if (run.stop === 'done') return true
  return accepted !== null && !lexicallyWorse({a: run.score, b: accepted.score})
}

function lexicallyWorse(input: {a: number[]; b: number[]}): boolean {
  const {a, b} = input
  const index = a.findIndex((value, at) => value !== (b[at] ?? value))
  if (index < 0) return false
  return (a[index] ?? 0) > (b[index] ?? 0)
}

function roundsUsed(input: {section: string; rounds: Run[]}): number {
  const rounds = input.rounds.toSorted((a, b) => a.round - b.round)
  const hashes = rounds.map((run) => run.root.children.find((child) => child.node.id === input.section)?.hash ?? null)
  return rounds.filter(
    (run, index) => index > 0 && run.section === input.section && hashes[index] !== hashes[index - 1],
  ).length
}

function aboveCount(input: {root: Match; phrases: Sayings}): number {
  const {root, phrases} = input
  const paths = new Set(
    [...walk(root)].flatMap(({node, depth}) =>
      depth === 0 || node.live === null || !node.deltas.some(aboveDelta) ? [] : [node.live.path],
    ),
  )
  const unbuilt = [...walk(root)].filter(
    ({node, parent}) => parent !== null && node.live === null && phrases.structural({match: node, parent, root}),
  )
  return paths.size + unbuilt.length
}

function aboveDelta(delta: Delta): boolean {
  if (delta.warning !== undefined) return false
  if (delta.kind !== 'pixels' || typeof delta.live !== 'number') return true
  return delta.live >= TOLERANCES.tileGate
}

function statusNext(input: {
  done: boolean
  unanswered: boolean
  first: boolean
  families: string[]
  paths: {design: string; placeholder: string}
  phrases: Sayings
}): {next?: string} {
  if (input.unanswered) return {next: input.phrases.hidden}
  if (input.done) return {}
  if (!input.first) return {next: input.phrases.guide}
  const fonts =
    input.families.length === 0
      ? ''
      : `; the design sets its text in ${input.families.join(', ')}: load these fonts before building`
  return {
    next: `read ${input.paths.design} for the whole design before building; the brief lists what to fix first; copy ${input.paths.placeholder} into the page's source and use <Placeholder kind=…> for every image and icon line${fonts}`,
  }
}

function watchOf(input: Parameters<Words['watch']>[0] & {phrases: Sayings}): WatchReport {
  const {record, run, design, previous, phrases} = input
  const query = input.input
  const rows = (run === null ? designRows(design) : runRows({run, phrases})).filter((row) => watchMatches({row, query}))
  return {
    target: record.id,
    run: run?.id ?? null,
    live: run !== null && run.id !== previous?.id,
    counts:
      run === null
        ? {...ledgerCounts([]), unbuilt: rows.length}
        : ledgerCounts([...walk(run.root)].flatMap(({node, depth}) => (depth === 0 ? [] : [node]))),
    rows: rows.slice(0, query.limit),
    truncated: Math.max(0, rows.length - query.limit),
  }
}

function runRows(input: {run: Run; phrases: Sayings}): WatchRow[] {
  const {run, phrases} = input
  return [...walk(run.root)].flatMap(({node, depth}): WatchRow[] => {
    if (depth === 0) return []
    const worst = maxBy(
      run.items.filter((item) => item.node === node.node.id && item.stage !== null),
      (item) => item.size,
    )
    return [
      {
        node: node.node.id,
        ref: node.node.id,
        kind: node.node.kind,
        text: node.node.kind === 'text' ? node.node.text : null,
        box: node.node.box,
        status: node.status,
        key: node.live?.key ?? null,
        source: node.live?.source ?? null,
        path: node.live?.path ?? null,
        confidence: node.live === null ? null : node.confidence,
        item: worst === undefined ? null : phrases.item({item: worst, root: run.root}),
      },
    ]
  })
}

function designRows(design: Design): WatchRow[] {
  return [...walk(design.root)].flatMap(({node, depth}): WatchRow[] =>
    depth === 0
      ? []
      : [
          {
            node: node.id,
            ref: node.id,
            kind: node.kind,
            text: node.kind === 'text' ? node.text : null,
            box: node.box,
            status: 'unbuilt',
            key: null,
            source: null,
            path: null,
            confidence: null,
            item: null,
          },
        ],
  )
}

function watchMatches(input: {row: WatchRow; query: Parameters<Words['watch']>[0]['input']}): boolean {
  const {row, query} = input
  if (query.node !== undefined && row.node !== query.node) return false
  if (query.ref !== undefined && row.ref !== query.ref) return false
  if (query.key !== undefined && row.key !== query.key) return false
  return query.status === undefined || row.status === query.status
}

function ledgerCounts(matches: Match[]): DiffReport['ledger'] {
  const counted = countBy(matches, (match) => match.status)
  return {
    unbuilt: counted.unbuilt ?? 0,
    paired: counted.paired ?? 0,
    done: counted.done ?? 0,
    regressed: counted.regressed ?? 0,
    accepted: counted.accepted ?? 0,
  }
}
