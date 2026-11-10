import {isAbsolute, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import type {Storage} from 'unstorage'
import type {RawFrame, SourceLoc} from '@conciv/protocol/page-types'
import {toolError} from '@conciv/extension'
import type {CompileError, DesignRuntime, IdTree, Measured, Raster, Round, RoundReply, Runner} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {readIds} from '../shared/id-tree.js'
import {walk} from '../shared/tree.js'
import {createRaster} from './raster.js'
import {idTreeOf} from './id-tree.js'
import {mappingOf} from './mapping.js'
import {gateOf} from './gate.js'
import {reflowAt} from './reflow.js'
import {widthsOf} from './widths.js'
import {verdictOf} from './verdict.js'
import {progressOf} from './progress.js'
import {imageRowsOf} from './image-rows.js'

export function createRunner(input: {runtime: DesignRuntime; folder: Storage}): Runner {
  const {runtime, folder} = input
  const {store, measurer} = runtime
  return async ({record, page, since, variants}) => {
    const [design, stored, rounds, image, ids, streak] = await Promise.all([
      store.design(record.id),
      store.mapping(record.id),
      store.rounds(record.id),
      store.image({id: record.id}),
      store.ids(record.id),
      store.unsettledCount(record.id),
    ])
    if (image === null) throw toolError('no-target', {message: 'the design image is missing; call design_get again'})
    const measured = await measurer.measure({page, width: record.width, height: record.height})
    const thrown = await thrownError({measured, since, runtime})
    if (thrown !== null) return {thrown}
    const count = streak + 1
    const error = measured.pageError === undefined ? {} : {error: measured.pageError}
    const blank = measured.pageError !== undefined || measured.live.children.length === 0
    if (blank && count < TOLERANCES.stallRounds) {
      await store.writeUnsettledCount({id: record.id, count})
      return {unsettled: true, rendered: 0, ...error}
    }
    const last = rounds.at(-1)
    const measuredRounds = rounds.filter((round) => round.broken === null)
    const previous = measuredRounds.at(-1)
    const settled = measuredRounds.findLast((round) => round.unsettled === null)
    const built = idTreeOf({live: measured.live, sheets: measured.sheets, mapping: stored, previous: ids})
    if (previous !== undefined && previous === last && previous.tree === built.hash) {
      await store.writeUnsettledCount({id: record.id, count: previous.unsettled === null ? 0 : count})
      return {...shown(previous), unchanged: true}
    }
    const round = (last?.round ?? 0) + 1
    const decoded = createRaster(image)
    const target = design.scale === 1 ? decoded : decoded.scaled(design.scale)
    const voted = {design, measured, stored, round, pairer: runtime.pairer, target}
    const first = await gatedOf({...voted, built})
    const collapsed =
      measured.pageError === undefined &&
      settled !== undefined &&
      first.coverage.rendered < settled.coverage.rendered / 2
    const {mapped, gate, coverage} = collapsed ? await revotedOf({...voted, previous: ids}) : first
    const {mapping} = mapped
    const unsettled = unsettledReason({measured, rendered: coverage.rendered, settled})
    await store.writeUnsettledCount({id: record.id, count: unsettled === null ? 0 : count})
    const {rendered} = coverage
    if (unsettled !== null && count < TOLERANCES.stallRounds) return {unsettled: true, rendered, ...error}
    await store.writeVotes({id: record.id, round, votes: mapped.votes})
    if (unsettled === null)
      await store.writeIds({
        id: record.id,
        ids: {root: mapped.root, revoted: mapped.revoted, gone: mapped.gone},
        round,
        revoted: mapped.reasons,
      })
    const widths = widthsOf({design, styles: measured.queries, ...(variants === undefined ? {} : {variants})})
    const results = []
    const failures = []
    const waits = measured.fontsLoading === undefined ? [] : [measured.fontsLoading]
    for (const {width} of widths) {
      const narrow = width === measured.width ? measured : await measurer.measure({page, width, height: REFLOW_HEIGHT})
      if (narrow !== measured && narrow.fontsLoading !== undefined) waits.push(narrow.fontsLoading)
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
    const images = await imageRowsOf({
      design,
      reads: readIds({root: mapped.root, live: measured.live}),
      page,
      mirror: measured.sources.includes('mirror') ? {width: record.width, height: record.height} : null,
      folder,
    })
    const rows = [...gate.rows, ...images.rows, ...failures]
    const counts = {
      ...gate.counts,
      reflow: failures.length,
      paint: (gate.counts.paint ?? 0) + images.rows.length,
      rows: gate.counts.rows + images.rows.length + failures.length,
    }
    const pixels = compared({live: measured.raster, target, comparator: runtime.comparator})
    const earlier =
      previous === undefined ? null : await store.image({id: record.id, round: previous.round, kind: 'live'})
    const progress = progressOf({
      rounds: measuredRounds,
      now: {rows, coverage, pixels: {share: pixels.share}},
      live: {now: measured.raster, before: earlier === null ? null : createRaster(earlier), width: measured.width},
      root: mapped.root,
      design,
      comparator: runtime.comparator,
    })
    const names = new Map([...walk(design.root)].map(({node}) => [node.id, node.figma?.name ?? '']))
    const gone = coverage.missing.map((id) => ({id, name: names.get(id) ?? ''}))
    const judged = unsettled === null ? coverage : {...coverage, gone}
    const measuredRound: Round = {
      round,
      rows,
      reflow,
      coverage: judged,
      counts,
      pixels: {share: pixels.share},
      progress,
      at: Date.now(),
      tree: built.hash,
      verdict: 'unsettled',
      unsettled,
      broken: null,
      brokenBy: null,
    }
    const written =
      unsettled === null
        ? {...measuredRound, verdict: verdictOf({design, rounds: [...measuredRounds, measuredRound]}).verdict}
        : measuredRound
    await store.writeRound({
      id: record.id,
      round: written,
      live: measured.raster.png(),
      diff: pixels.diff,
      notes: [
        `capture ${measured.path}`,
        ...images.ratios.map(({node, ratio}) => `image ${node} mismatch ${ratio.toFixed(RATIO_DIGITS)}`),
      ],
    })
    const late = waits.length === 0 ? {} : {fontsLoading: Math.max(...waits)}
    const reply = {round, rows, reflow, coverage: judged, counts, progress, ...late}
    return unsettled === null ? reply : {...reply, unsettled: true, rendered, ...error}
  }
}

const REFLOW_HEIGHT = 900

const RATIO_DIGITS = 3

async function revotedOf(input: Omit<Parameters<typeof mappingOf>[0], 'built'> & {previous: IdTree | null}) {
  const {measured, stored, previous} = input
  const built = idTreeOf({live: measured.live, sheets: measured.sheets, mapping: stored, previous, revote: true})
  return gatedOf({...input, built, revote: true})
}

async function gatedOf(input: Parameters<typeof mappingOf>[0]) {
  const mapped = await mappingOf(input)
  const reads = readIds({root: mapped.root, live: input.measured.live})
  const gate = gateOf({design: input.design, reads, live: input.measured.live})
  const coverage = {
    ...gate.coverage,
    dupes: mapped.dupes,
    candidates: mapped.candidates,
    revoted: mapped.revoted.length,
    notRendered: [...gate.coverage.notRendered, ...mapped.notRendered],
  }
  return {mapped, gate, coverage}
}

const TOLERANCES = designConfig.tolerances

function unsettledReason(input: {measured: Measured; rendered: number; settled: Round | undefined}): string | null {
  const {measured, rendered, settled} = input
  if (measured.pageError !== undefined) return `The page shows an error: ${measured.pageError}`
  if (rendered === 0) return 'The page rendered no design nodes.'
  if (settled === undefined || rendered >= settled.coverage.rendered / 2) return null
  return `The page rendered ${rendered} design nodes, under half the ${settled.coverage.rendered} of round ${settled.round}.`
}

async function thrownError(input: {
  measured: Measured
  since: number
  runtime: DesignRuntime
}): Promise<CompileError | null> {
  const {measured, runtime} = input
  const {thrown} = measured
  if (thrown === undefined || (thrown.at < input.since && measured.live.children.length > 0)) return null
  const at = await located({frames: thrown.frames, runtime})
  if (at === null) return {message: thrown.message, file: null, line: null, column: null}
  return {
    message: thrown.message,
    file: projectFile({file: at.file, cwd: runtime.cwd}),
    line: at.line,
    column: at.column,
  }
}

async function located(input: {frames: RawFrame[]; runtime: DesignRuntime}): Promise<SourceLoc | null> {
  const [frame, ...rest] = input.frames
  if (frame === undefined) return null
  const at = await input.runtime.symbolicate([frame])
  if (at === null) return located({...input, frames: rest})
  if (!URL.canParse(at.file, frame.fileName)) return at
  return {...at, file: new URL(at.file, frame.fileName).href}
}

function projectFile(input: {file: string; cwd: string}): string {
  const {file, cwd} = input
  if (!URL.canParse(file)) return isAbsolute(file) ? relative(cwd, file) : file
  const url = new URL(file)
  return url.protocol === FILE_PROTOCOL ? relative(cwd, fileURLToPath(url)) : url.pathname.slice(1)
}

const FILE_PROTOCOL = 'file:'

function shown(last: Round): RoundReply {
  const {round, rows, reflow, coverage, counts, progress} = last
  return {round, rows, reflow, coverage, counts, progress}
}

function compared(input: {live: Raster; target: Raster; comparator: string}): {share: number; diff: Uint8Array} {
  const {live, target} = input
  const box = {x: 0, y: 0, w: Math.min(live.width, target.width), h: Math.min(live.height, target.height)}
  const cropped = live.crop({box})
  const {mismatch, mask} = cropped.compare({other: target.crop({box}), comparator: input.comparator})
  return {share: mismatch, diff: cropped.paintDiff({mask, width: box.w}).png()}
}
