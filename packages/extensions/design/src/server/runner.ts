import {toolError} from '@conciv/extension'
import type {DesignRuntime, Raster, Round, RoundReply, Runner} from '../shared/defs.js'
import {readIds} from '../shared/id-tree.js'
import {createRaster} from './raster.js'
import {idTreeOf} from './id-tree.js'
import {mappingOf} from './mapping.js'
import {gateOf} from './gate.js'
import {reflowAt} from './reflow.js'
import {widthsOf} from './widths.js'

export function createRunner(runtime: DesignRuntime): Runner {
  const {store, measurer} = runtime
  return async ({record, page}) => {
    const [design, stored, rounds, image, ids] = await Promise.all([
      store.design(record.id),
      store.mapping(record.id),
      store.rounds(record.id),
      store.image({id: record.id}),
      store.ids(record.id),
    ])
    if (image === null) throw toolError('no-target', {message: 'the design image is missing; call design_get again'})
    const measured = await measurer.measure({page, width: record.width, height: record.height})
    if (measured.pageError !== undefined) return {unsettled: true, rendered: 0, error: measured.pageError}
    if (measured.live.children.length === 0) return {unsettled: true, rendered: 0}
    const previous = rounds.at(-1)
    const built = idTreeOf({live: measured.live, sheets: measured.sheets, mapping: stored, previous: ids})
    if (previous !== undefined && previous.tree === built.hash) return {...shown(previous), unchanged: true}
    const round = (previous?.round ?? 0) + 1
    const decoded = createRaster(image)
    const target = design.scale === 1 ? decoded : decoded.scaled(design.scale)
    const mapped = await mappingOf({design, measured, built, stored, round, pairer: runtime.pairer, target})
    const {mapping} = mapped
    const gate = gateOf({root: design.root, reads: readIds({root: mapped.root, live: measured.live})})
    const coverage = {
      ...gate.coverage,
      dupes: mapped.dupes,
      candidates: mapped.candidates,
      revoted: mapped.revoted.length,
      notRendered: [...gate.coverage.notRendered, ...mapped.notRendered],
    }
    if (coverage.rendered === 0 || (previous !== undefined && coverage.rendered < previous.coverage.rendered / 2))
      return {unsettled: true, rendered: gate.coverage.rendered}
    await store.writeVotes({id: record.id, round, votes: mapped.votes})
    await store.writeIds({
      id: record.id,
      ids: {root: mapped.root, revoted: mapped.revoted, gone: mapped.gone},
      round,
      revoted: mapped.reasons,
    })
    const widths = widthsOf({design, styles: measured.queries})
    const results = []
    const failures = []
    for (const {width} of widths) {
      const narrow = width === measured.width ? measured : await measurer.measure({page, width, height: REFLOW_HEIGHT})
      const at = idTreeOf({live: narrow.live, sheets: narrow.sheets, mapping, previous: null})
      const measuredAt = reflowAt({
        root: design.root,
        reads: readIds({root: at.root, live: narrow.live}),
        live: narrow.live,
        width,
        overflowX: narrow.overflowX,
      })
      results.push(measuredAt.reflow)
      failures.push(...measuredAt.rows)
    }
    const reflow = {widths, results}
    const rows = [...gate.rows, ...failures]
    const counts = {...gate.counts, reflow: failures.length, rows: gate.counts.rows + failures.length}
    const pixels = compared({live: measured.raster, target, comparator: runtime.comparator})
    const written: Round = {
      round,
      rows,
      reflow,
      coverage,
      counts,
      pixels: {share: pixels.share},
      at: Date.now(),
      tree: built.hash,
    }
    await store.writeRound({id: record.id, round: written, live: measured.raster.png(), diff: pixels.diff})
    return {round, rows, reflow, coverage, counts}
  }
}

const REFLOW_HEIGHT = 900

function shown(last: Round): RoundReply {
  return {round: last.round, rows: last.rows, reflow: last.reflow, coverage: last.coverage, counts: last.counts}
}

function compared(input: {live: Raster; target: Raster; comparator: string}): {share: number; diff: Uint8Array} {
  const {live, target} = input
  const box = {x: 0, y: 0, w: Math.min(live.width, target.width), h: Math.min(live.height, target.height)}
  const cropped = live.crop({box})
  const {mismatch, mask} = cropped.compare({other: target.crop({box}), comparator: input.comparator})
  return {share: mismatch, diff: cropped.paintDiff({mask, width: box.w}).png()}
}
