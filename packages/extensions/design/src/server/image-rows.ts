import {extname} from 'node:path'
import {parse} from 'culori'
import {trim} from 'es-toolkit'
import type {Storage} from 'unstorage'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {PageNodeShotSchema, screenshotNodeDef, type PageNodeShot} from '@conciv/extension-page/defs'
import {z} from 'zod'
import type {Box, Design, GateRow, LiveComponent, Raster} from '../shared/defs.js'
import {DESIGN_TOOLS} from '../shared/design-tools.js'
import type {readIds} from '../shared/id-tree.js'
import {designConfig} from '../shared/tolerances.js'
import {createRaster} from './raster.js'
import {nodeLooks} from './node-look.js'
import {createPictures} from './pictures.js'

export async function imageRowsOf(input: {
  design: Design
  reads: ReturnType<typeof readIds>
  page: ServerToolPageAccess
  mirror: {width: number; height: number} | null
  screen: Raster
  folder: Storage
}): Promise<{rows: GateRow[]; ratios: {node: string; ratio: number}[]}> {
  const {reads} = input
  const pictures = createPictures(input.folder)
  const looked = await Promise.all(
    nodeLooks(input.design).map(async (look): Promise<Checked[]> => {
      const element = reads.of(look.node)[0]
      const named = reads.named(look.node)
      const {asset} = look
      if (asset === null || element === undefined || named.selector === null) return []
      const row = (text: string): GateRow => ({
        node: look.node,
        ...named,
        kind: IMAGE,
        name: look.name,
        text,
        magnitude: 'paint',
        token: null,
        property: IMAGE,
        expected: asset,
        actual: foundIn(element),
        delta: null,
      })
      const background = look.image && look.fill_kind !== IMAGE
      const expected = `wrong image at [${look.node}]: ${asset} expected${background ? ' as the background' : ''}`
      const box = smaller({a: {w: look.w, h: look.h}, b: element.box})
      const shown = element.styles.image ?? ''
      if (await showsAsset({shown, asset, box, pictures})) return []
      const told = `${expected}, ${foundIn(element)}`
      if (foundIn(element) === NONE) return [{row: row(told), node: look.node, shot: null, box: element.box, asset}]
      const shot = {
        selector: named.selector,
        width: side(look.w),
        height: side(look.h),
        scale: 1,
        reference: asset,
      }
      return [{row: row(told), node: look.node, shot, box: element.box, asset}]
    }),
  )
  const checked = looked.flat()
  const asked = checked.flatMap((entry) => (entry.shot === null ? [] : [entry.shot]))
  const shots = await shotsOf({page: input.page, mirror: input.mirror, nodes: asked})
  const found = await Promise.all(
    checked.map(async (entry) => {
      if (entry.shot === null) return {row: entry.row, ratio: null}
      const taken = shots[asked.indexOf(entry.shot)] ?? {shot: null, error: 'no capture came back'}
      if (taken.shot === null)
        return {
          row: {...entry.row, text: `could not capture [${entry.node}]: ${taken.error ?? 'no image'}`},
          ratio: null,
        }
      const ratio = await shareOf({captured: ratioOf(taken.shot), entry, screen: input.screen, pictures})
      return {
        row: ratio === null || ratio > GATE ? entry.row : null,
        ratio: ratio === null ? null : {node: entry.node, ratio},
      }
    }),
  )
  return {
    rows: found.flatMap((entry) => (entry.row === null ? [] : [entry.row])),
    ratios: found.flatMap((entry) => (entry.ratio === null ? [] : [entry.ratio])),
  }
}

type NodeShot = z.input<typeof screenshotNodeDef.inputSchema>

type Checked = {row: GateRow; node: string; shot: NodeShot | null; box: Box; asset: string}

const IMAGE = 'image'
const GATE = designConfig.tolerances.segmentImageShare
const SCREEN_GATE = designConfig.tolerances.screenImageShare
const [, , , , shotsDef] = DESIGN_TOOLS
const ShotsSchema = shotsDef.outputSchema ?? z.never()

function side(length: number): number {
  return Math.max(1, Math.round(length))
}

type Taken = {shot: PageNodeShot | null; error: string | null}

async function shotsOf(input: {
  page: ServerToolPageAccess
  mirror: {width: number; height: number} | null
  nodes: NodeShot[]
}): Promise<Taken[]> {
  const {page, mirror, nodes} = input
  if (nodes.length === 0) return []
  if (mirror === null)
    return Promise.all(
      nodes.map((node) =>
        page
          .call(screenshotNodeDef.name, node)
          .then((reply) => ({shot: PageNodeShotSchema.parse(reply), error: null}))
          .catch(failed),
      ),
    )
  return page
    .call(shotsDef.name, {...mirror, nodes, timeout: designConfig.tolerances.measureTimeoutMs})
    .then((reply) => ShotsSchema.parse(reply).shots)
    .catch((error: unknown) => nodes.map(() => failed(error)))
}

function failed(error: unknown): Taken {
  return {shot: null, error: error instanceof Error ? error.message : String(error)}
}

function ratioOf(shot: PageNodeShot): number | null {
  if (shot.reference === null || shot.mask === null) return null
  const live = createRaster(Buffer.from(shot.image, 'base64'))
  const reference = createRaster(Buffer.from(shot.reference, 'base64'))
  const ink = createRaster(Buffer.from(shot.mask, 'base64')).pixels()
  const {mask} = live.compare({other: reference, comparator: 'pixelmatch'})
  const painted = mask.reduce<{seen: number; wrong: number}>(
    (sums, wrong, index) => {
      if (wrong === 0 && (ink[index * CHANNELS + ALPHA] ?? 0) === 0) return sums
      return {seen: sums.seen + 1, wrong: sums.wrong + wrong}
    },
    {seen: 0, wrong: 0},
  )
  return painted.seen === 0 ? 0 : painted.wrong / painted.seen
}

async function shareOf(input: {
  captured: number | null
  entry: Checked
  screen: Raster
  pictures: ReturnType<typeof createPictures>
}): Promise<number | null> {
  const {captured, entry} = input
  if (captured !== null && captured <= GATE) return captured
  const onScreen = await overScreen({
    screen: input.screen,
    box: entry.box,
    asset: entry.asset,
    pictures: input.pictures,
  })
  return onScreen !== null && onScreen <= SCREEN_GATE ? onScreen : captured
}

async function overScreen(input: {
  screen: Raster
  box: Box
  asset: string
  pictures: ReturnType<typeof createPictures>
}): Promise<number | null> {
  const live = input.screen.crop({box: input.box})
  if (live.width === 0 || live.height === 0) return null
  const reference = await input.pictures.raster({path: input.asset, width: live.width, height: live.height})
  if (reference === null) return null
  const ink = reference.pixels()
  const base = live.pixels()
  const laid = base.map((value, index) => {
    if (index % CHANNELS === ALPHA) return OPAQUE
    const alpha = (ink[index - (index % CHANNELS) + ALPHA] ?? 0) / OPAQUE
    return Math.round((ink[index] ?? 0) * alpha + value * (1 - alpha))
  })
  const {mask} = live.compare({
    other: createRaster({pixels: laid, width: live.width, height: live.height}),
    comparator: 'pixelmatch',
  })
  const painted = mask.reduce<{seen: number; wrong: number}>(
    (sums, wrong, index) => {
      if (wrong === 0 && (ink[index * CHANNELS + ALPHA] ?? 0) === 0) return sums
      return {seen: sums.seen + 1, wrong: sums.wrong + wrong}
    },
    {seen: 0, wrong: 0},
  )
  return painted.seen === 0 ? 0 : painted.wrong / painted.seen
}

async function showsAsset(input: {
  shown: string
  asset: string
  box: {w: number; h: number}
  pictures: ReturnType<typeof createPictures>
}): Promise<boolean> {
  const asset = pathOf(input.asset)
  if (input.shown === INLINE_SVG) return asset !== null && extname(asset) === SVG_EXT
  const shown = pathOf(input.shown)
  if (shown === null) return false
  if (shown === asset) return true
  return input.pictures.same({shown, expected: input.asset, box: {x: 0, y: 0, ...input.box}})
}

function smaller(input: {a: {w: number; h: number}; b: {w: number; h: number}}): {w: number; h: number} {
  const {a, b} = input
  if (b.w <= 0 || b.h <= 0) return a
  return a.w * a.h <= b.w * b.h ? a : {w: b.w, h: b.h}
}

function pathOf(url: string): string | null {
  const bare = trim(url, QUOTES)
  if (bare === '' || !URL.canParse(bare, PAGE_BASE)) return null
  return new URL(bare, PAGE_BASE).pathname
}

function foundIn(element: LiveComponent): string {
  const {image = '', background, border, gradient} = element.styles
  if (image === INLINE_SVG) return INLINE_SVG
  if (image !== '') return element.tag === IMG ? `<img src=${image}>` : `an image ${image}`
  const fill = parse(background)
  const painted = (fill !== undefined && (fill.alpha ?? 1) > 0) || border.width > 0 || gradient !== null
  return painted ? 'css shape' : NONE
}

const INLINE_SVG = 'inline svg'
const NONE = 'none'
const SVG_EXT = '.svg'
const IMG = 'img'
const QUOTES = ['"', "'"]
const PAGE_BASE = 'http://page/'

const CHANNELS = 4
const ALPHA = 3
const OPAQUE = 255
