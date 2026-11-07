import {createHash} from 'node:crypto'
import {toolError} from '@conciv/extension'
import type {DesignRuntime, Measured, Raster, Round, Runner, Watched} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {createRaster} from './raster.js'
import {mappingOf} from './mapping.js'
import {renderersOf} from './renderers.js'
import {gateOf} from './gate.js'
import {reflowAt} from './reflow.js'
import {widthsOf} from './widths.js'

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
    const selectors = stored.map((entry) => entry.selector)
    const measured = await measurer.measure({page, width: record.width, height: record.height, selectors})
    if (measured.pageError !== undefined) return {unsettled: true, rendered: 0, error: measured.pageError}
    const previous = rounds.at(-1)
    const tree = treeOf(measured)
    if (previous !== undefined && previous.tree === tree) return shown(previous)
    const round = (previous?.round ?? 0) + 1
    const decoded = createRaster(image)
    const target = design.scale === 1 ? decoded : decoded.scaled(design.scale)
    const {mapping, matches, dupes, candidates, notRendered, provisional} = await mappingOf({
      record,
      design,
      measured,
      stored,
      round,
      pairer: runtime.pairer,
      target,
    })
    const renderers = renderersOf({live: measured.live, mapping, matches})
    const gate = gateOf({root: design.root, renderers})
    const coverage = {
      ...gate.coverage,
      dupes,
      candidates,
      provisional,
      notRendered: [...gate.coverage.notRendered, ...notRendered],
    }
    if (previous !== undefined && coverage.rendered < previous.coverage.rendered / 2)
      return {unsettled: true, rendered: gate.coverage.rendered}
    await store.writeMapping({id: record.id, mapping})
    const widths = widthsOf({design, styles: measured.queries})
    const results = []
    for (const {width} of widths) {
      const narrow =
        width === measured.width
          ? {...measured, matches}
          : await measurer.measure({
              page,
              width,
              height: REFLOW_HEIGHT,
              selectors: mapping.map((entry) => entry.selector),
            })
      const at = renderersOf({live: narrow.live, mapping, matches: narrow.matches})
      results.push(reflowAt({root: design.root, renderers: at, live: narrow.live, width, overflowX: narrow.overflowX}))
    }
    const reflow = {widths, results}
    const pixels = compared({live: measured.raster, target, comparator: runtime.comparator})
    const written: Round = {
      round,
      rows: gate.rows,
      reflow,
      coverage,
      counts: gate.counts,
      pixels: {share: pixels.share},
      at: Date.now(),
      tree,
    }
    await store.writeRound({id: record.id, round: written, live: measured.raster.png(), diff: pixels.diff})
    return {round, rows: gate.rows, reflow, coverage, counts: gate.counts}
  }
}

const REFLOW_HEIGHT = 900

function treeOf(measured: Measured): string {
  const elements = [...walk(measured.live)].flatMap(({node, depth}) =>
    depth === 0 ? [] : [[node.key, Object.values(node.bounds).map(Math.round), node.styles]],
  )
  return createHash('sha256')
    .update(JSON.stringify({sheets: measured.sheets, elements}))
    .digest('hex')
}

function shown(round: Round): Watched {
  return {round: round.round, rows: round.rows, reflow: round.reflow, coverage: round.coverage, counts: round.counts}
}

function compared(input: {live: Raster; target: Raster; comparator: string}): {share: number; diff: Uint8Array} {
  const {live, target} = input
  const box = {x: 0, y: 0, w: Math.min(live.width, target.width), h: Math.min(live.height, target.height)}
  const shown = live.crop({box})
  const {mismatch, mask} = shown.compare({other: target.crop({box}), comparator: input.comparator})
  return {share: mismatch, diff: shown.paintDiff({mask, width: box.w}).png()}
}
