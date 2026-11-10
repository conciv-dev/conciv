import {extname} from 'node:path'
import {parse} from 'culori'
import {trim} from 'es-toolkit'
import type {Storage} from 'unstorage'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {PageNodeShotSchema, screenshotNodeDef, type PageNodeShot} from '@conciv/extension-page/defs'
import {z} from 'zod'
import type {Design, GateRow, LiveComponent} from '../shared/defs.js'
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
  folder: Storage
}): Promise<{rows: GateRow[]; ratios: {node: string; ratio: number}[]}> {
  const {reads} = input
  const pictures = createPictures(input.folder)
  const looked = await Promise.all(
    nodeLooks(input.design).map(async (look): Promise<Checked[]> => {
      const element = reads.of(look.node)[0]
      const named = reads.named(look.node)
      if (look.asset === null || element === undefined || named.selector === null) return []
      const row = (text: string): GateRow => ({
        node: look.node,
        ...named,
        kind: IMAGE,
        name: look.name,
        text,
        magnitude: 'paint',
        token: null,
      })
      const background = look.image && look.fill_kind !== IMAGE
      const expected = `wrong image at [${look.node}]: ${look.asset} expected${background ? ' as the background' : ''}`
      const box = smaller({a: {w: look.w, h: look.h}, b: element.box})
      if (!(await showsAsset({shown: element.styles.image ?? '', asset: look.asset, box, pictures})))
        return [{row: row(`${expected}, ${foundIn(element)}`), node: look.node, shot: null}]
      if (background) return []
      const shot = {
        selector: named.selector,
        width: side(look.w),
        height: side(look.h),
        scale: 1,
        reference: look.asset,
      }
      return [{row: row(expected), node: look.node, shot}]
    }),
  )
  const checked = looked.flat()
  const asked = checked.flatMap((entry) => (entry.shot === null ? [] : [entry.shot]))
  const shots = await shotsOf({page: input.page, mirror: input.mirror, nodes: asked})
  const found = checked.map((entry) => {
    if (entry.shot === null) return {row: entry.row, ratio: null}
    const shot = shots[asked.indexOf(entry.shot)] ?? null
    const ratio = shot === null ? null : ratioOf(shot)
    return {
      row: ratio === null || ratio > GATE ? entry.row : null,
      ratio: ratio === null ? null : {node: entry.node, ratio},
    }
  })
  return {
    rows: found.flatMap((entry) => (entry.row === null ? [] : [entry.row])),
    ratios: found.flatMap((entry) => (entry.ratio === null ? [] : [entry.ratio])),
  }
}

type NodeShot = z.input<typeof screenshotNodeDef.inputSchema>

type Checked = {row: GateRow; node: string; shot: NodeShot | null}

const IMAGE = 'image'
const GATE = designConfig.tolerances.segmentImageShare
const [, , , , shotsDef] = DESIGN_TOOLS
const ShotsSchema = shotsDef.outputSchema ?? z.never()

function side(length: number): number {
  return Math.max(1, Math.round(length))
}

async function shotsOf(input: {
  page: ServerToolPageAccess
  mirror: {width: number; height: number} | null
  nodes: NodeShot[]
}): Promise<(PageNodeShot | null)[]> {
  const {page, mirror, nodes} = input
  if (nodes.length === 0) return []
  if (mirror === null)
    return Promise.all(
      nodes.map(async (node) => {
        const shot = PageNodeShotSchema.safeParse(await page.call(screenshotNodeDef.name, node).catch(() => null))
        return shot.success ? shot.data : null
      }),
    )
  const taken = ShotsSchema.safeParse(await page.call(shotsDef.name, {...mirror, nodes}).catch(() => null))
  return taken.success ? taken.data.shots : nodes.map(() => null)
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
  return painted ? 'css shape' : 'none'
}

const INLINE_SVG = 'inline svg'
const SVG_EXT = '.svg'
const IMG = 'img'
const QUOTES = ['"', "'"]
const PAGE_BASE = 'http://page/'

const CHANNELS = 4
const ALPHA = 3
