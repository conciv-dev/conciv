import {RoundSchema, type Round} from '../shared/defs.js'
import type {storeTables} from './runs/store-tables.js'

export function roundOf(input: Stored): Round {
  const {head, rows: listed} = input
  const kinds = (kind: string, from: Stored['missing']): string[] =>
    from.filter((entry) => entry.kind === kind).map((entry) => entry.node)
  const tied = Map.groupBy(input.candidates, (entry) => entry.node)
  const named = Map.groupBy(input.widths, (entry) => entry.width)
  return RoundSchema.parse({
    round: head.round,
    rows: listed.map(gateRowOf),
    reflow: {
      widths: [...named].map(([width, entries]) => ({width, from: entries.map((entry) => entry.from)})),
      results: [...named].map(([width, [first]]) => ({
        width,
        rootHeight: first?.root_height ?? 0,
        sticksOut: [],
        overflowX: first?.overflow_x ?? false,
        overlaps: [],
        tags: [],
        rows: listed.filter((row) => row.magnitude === 'reflow' && row.width === width).map(gateRowOf),
      })),
    },
    coverage: {
      nodes: head.nodes,
      mapped: head.mapped,
      rendered: head.rendered,
      missing: kinds('missing', input.missing),
      ...(head.unsettled === null
        ? {}
        : {gone: kinds('missing', input.missing).map((id) => ({id, name: input.names.get(id) ?? ''}))}),
      notRendered: kinds('not_rendered', input.missing),
      dupes: kinds('dupe', input.missing),
      revoted: head.revoted,
      candidates: [...tied].map(([node, entries]) => ({
        node,
        candidates: entries.map(({selector, score}) => ({selector, score})),
      })),
    },
    counts: {
      much: head.much,
      noticeably: head.noticeably,
      slightly: head.slightly,
      pins: head.pins,
      other: head.other,
      rows: head.rows_count,
      reflow: head.reflow,
      paint: head.paint,
      drift: head.drift,
    },
    pixels: head.pixel_share === null ? null : {share: head.pixel_share},
    progress: progressOf(input),
    at: head.at,
    tree: head.tree,
    verdict: head.verdict,
    unsettled: head.unsettled,
    broken: head.broken,
    brokenBy: head.broken_by,
  })
}

function progressOf(input: Stored): Round['progress'] {
  const {head} = input
  if (head.closed === null || head.opened === null) return null
  const now = input.missing.filter((entry) => entry.kind === 'missing').map((entry) => entry.node)
  const before = input.missingBefore.filter((entry) => entry.kind === 'missing').map((entry) => entry.node)
  return {
    closed: head.closed,
    opened: head.opened,
    kept: input.rows
      .filter((row) => row.repeat > 0)
      .map((row) => ({node: row.node, id: row.id, text: row.text, repeat: row.repeat})),
    mapped: {
      gained: before.filter((node) => !now.includes(node)),
      lost: now.filter((node) => !before.includes(node)),
    },
    pixels: {now: head.pixel_share, before: head.pixel_before},
    changed:
      head.changed_ratio === null
        ? null
        : {
            ratio: head.changed_ratio,
            regions: regionsOf(input.regions),
            truncated: input.regions.some((entry) => entry.truncated),
            count: head.changed_regions ?? 0,
          },
    note: head.note,
  }
}

function regionsOf(stored: Stored['regions']): NonNullable<NonNullable<Round['progress']>['changed']>['regions'] {
  const grouped = stored.reduce<Stored['regions'][]>((groups, entry) => {
    const last = groups.at(-1)
    const first = last?.[0]
    const same =
      first !== undefined &&
      first.x === entry.x &&
      first.y === entry.y &&
      first.width === entry.width &&
      first.height === entry.height
    return same && last !== undefined ? [...groups.slice(0, -1), [...last, entry]] : [...groups, [entry]]
  }, [])
  return grouped.map((group) => {
    const [first] = group
    return {
      box: {x: first?.x ?? 0, y: first?.y ?? 0, w: first?.width ?? 0, h: first?.height ?? 0},
      ids: group.flatMap((entry) =>
        entry.id === null
          ? []
          : [{id: entry.id, node: entry.node, name: entry.name, source: entry.source, overlap: entry.overlap ?? 0}],
      ),
    }
  })
}

function gateRowOf(row: RowRow): Record<string, unknown> {
  const {
    seq: _seq,
    target_id: _target,
    run_id: _run,
    session: _session,
    round: _round,
    property: _property,
    expected: _expected,
    actual: _actual,
    delta: _delta,
    at: _at,
    repeat: _repeat,
    width,
    token,
    component,
    specifier,
    kit_token: kitToken,
    design_token: designToken,
    ...rest
  } = row
  return {
    ...rest,
    ...(width === null ? {} : {width}),
    ...(token === null ? {} : {token}),
    ...(component === null ? {} : {component}),
    ...(specifier === null ? {} : {specifier}),
    ...(kitToken === null ? {} : {kitToken}),
    ...(designToken === null ? {} : {designToken}),
  }
}

type Tables = typeof storeTables

type RowRow = Tables['rows']['$inferSelect']

type Stored = {
  head: Tables['rounds']['$inferSelect']
  before: Tables['rounds']['$inferSelect'] | null
  rows: RowRow[]
  missing: Tables['missing']['$inferSelect'][]
  missingBefore: Tables['missing']['$inferSelect'][]
  candidates: Tables['candidates']['$inferSelect'][]
  widths: Tables['widths']['$inferSelect'][]
  regions: Tables['regions']['$inferSelect'][]
  names: Map<string, string>
}
