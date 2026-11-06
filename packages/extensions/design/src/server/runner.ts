import {toolError} from '@conciv/extension'
import type {DesignRuntime, Raster, Round, Runner} from '../shared/defs.js'
import {createRaster} from './raster.js'
import {mappingOf} from './mapping.js'
import {renderersOf} from './renderers.js'
import {gateOf} from './gate.js'
import {reflowAt} from './reflow.js'

export function createRunner(runtime: DesignRuntime): Runner {
  const {store, measurer} = runtime
  return async ({record, page}) => {
    const [design, stored, rounds, image] = await Promise.all([
      store.design(record.id),
      store.mapping(record.id),
      store.rounds(record.id),
      store.image({id: record.id}),
    ])
    if (image === null) throw toolError('no-target', {message: 'the design image is missing; call design_get again'})
    const measured = await measurer.measure({page, width: record.width, height: record.height})
    if (measured.pageError !== undefined) return {unsettled: true, rendered: 0, error: measured.pageError}
    const previous = rounds.at(-1)
    const round = (previous?.round ?? 0) + 1
    const decoded = createRaster(image)
    const target = design.scale === 1 ? decoded : decoded.scaled(design.scale)
    const mapping = await mappingOf({record, design, measured, stored, round, pairer: runtime.pairer, target})
    const renderers = renderersOf({live: measured.live, mapping})
    const gate = gateOf({root: design.root, renderers, live: measured.live})
    if (previous !== undefined && gate.coverage.rendered < previous.coverage.rendered / 2)
      return {unsettled: true, rendered: gate.coverage.rendered}
    await store.writeMapping({id: record.id, mapping})
    const reflow = []
    for (const width of REFLOW_WIDTHS) {
      const narrow = await measurer.measure({page, width, height: REFLOW_HEIGHT})
      const at = renderersOf({live: narrow.live, mapping})
      reflow.push(reflowAt({root: design.root, renderers: at, live: narrow.live, width, overflowX: narrow.overflowX}))
    }
    const pixels = compared({live: measured.raster, target, comparator: runtime.comparator})
    const written: Round = {
      round,
      rows: gate.rows,
      reflow,
      coverage: gate.coverage,
      counts: gate.counts,
      pixels: {share: pixels.share},
      at: Date.now(),
    }
    await store.writeRound({id: record.id, round: written, live: measured.raster.png(), diff: pixels.diff})
    return {round, rows: gate.rows, reflow, coverage: gate.coverage, counts: gate.counts}
  }
}

const REFLOW_WIDTHS = [1024, 768]

const REFLOW_HEIGHT = 900

function compared(input: {live: Raster; target: Raster; comparator: string}): {share: number; diff: Uint8Array} {
  const {live, target} = input
  const box = {x: 0, y: 0, w: Math.min(live.width, target.width), h: Math.min(live.height, target.height)}
  const shown = live.crop({box})
  const {mismatch, mask} = shown.compare({other: target.crop({box}), comparator: input.comparator})
  return {share: mismatch, diff: shown.paintDiff({mask, width: box.w}).png()}
}
