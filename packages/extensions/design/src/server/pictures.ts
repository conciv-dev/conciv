import {createHash} from 'node:crypto'
import sharp, {type Metadata} from 'sharp'
import type {Storage} from 'unstorage'
import type {Box, Raster} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {createRaster} from './raster.js'

export function createPictures(folder: Storage): Pictures {
  const decoded = new Map<string, Promise<Raster | null>>()
  const read = new Map<string, Promise<Picture | null>>()
  return {same}

  async function same(input: {shown: string; expected: string; box: Box}): Promise<boolean> {
    const width = Math.max(1, Math.round(input.box.w * TOLERANCES.assetScale))
    const height = Math.max(1, Math.round(input.box.h * TOLERANCES.assetScale))
    const [shown, expected] = await Promise.all(
      [input.shown, input.expected].map((path) => rasterOf({path, width, height})),
    )
    if (shown === null || shown === undefined || expected === null || expected === undefined) return false
    return mismatchOf({a: shown, b: expected}) <= TOLERANCES.segmentImageShare
  }

  function rasterOf(input: {path: string; width: number; height: number}): Promise<Raster | null> {
    return pictureOf(input.path).then((picture) => {
      if (picture === null) return null
      const key = `${picture.hash}@${input.width}x${input.height}`
      const known = decoded.get(key) ?? scaled({bytes: picture.bytes, width: input.width, height: input.height})
      decoded.set(key, known)
      return known
    })
  }

  function pictureOf(path: string): Promise<Picture | null> {
    const known = read.get(path) ?? loaded({folder, path})
    read.set(path, known)
    return known
  }
}

type Pictures = {same: (input: {shown: string; expected: string; box: Box}) => Promise<boolean>}

type Picture = {hash: string; bytes: Uint8Array}

const TOLERANCES = designConfig.tolerances
const HASH = 'sha256'
const HEX = 'hex'
const CHANNELS = 4
const ALPHA = 3

async function loaded(input: {folder: Storage; path: string}): Promise<Picture | null> {
  const bytes: unknown = await input.folder.getItemRaw(input.path).catch(() => null)
  if (!(bytes instanceof Uint8Array)) return null
  return {hash: createHash(HASH).update(bytes).digest(HEX), bytes}
}

async function scaled(input: {bytes: Uint8Array; width: number; height: number}): Promise<Raster | null> {
  const {width, height} = input
  const meta = await sharp(input.bytes)
    .metadata()
    .catch(() => null)
  if (meta === null) return null
  const density = densityFor({meta, width, height})
  const pixels = await sharp(input.bytes, density === null ? {} : {density})
    .resize(width, height, {fit: 'fill'})
    .ensureAlpha()
    .raw()
    .toBuffer({resolveWithObject: true})
    .catch(() => null)
  if (pixels === null) return null
  return createRaster({pixels: new Uint8Array(pixels.data), width: pixels.info.width, height: pixels.info.height})
}

function densityFor(input: {meta: Metadata; width: number; height: number}): number | null {
  const {meta, width, height} = input
  if (meta.format !== 'svg' || meta.density === undefined || meta.width === 0 || meta.height === 0) return null
  return meta.density * Math.max(width / meta.width, height / meta.height)
}

function mismatchOf(input: {a: Raster; b: Raster}): number {
  const {mask} = input.a.compare({other: input.b, comparator: 'pixelmatch'})
  const a = input.a.pixels()
  const b = input.b.pixels()
  const painted = mask.reduce<{seen: number; wrong: number}>(
    (sums, wrong, index) => {
      const inked = (a[index * CHANNELS + ALPHA] ?? 0) > 0 || (b[index * CHANNELS + ALPHA] ?? 0) > 0
      if (wrong === 0 && !inked) return sums
      return {seen: sums.seen + 1, wrong: sums.wrong + wrong}
    },
    {seen: 0, wrong: 0},
  )
  return painted.seen === 0 ? 0 : painted.wrong / painted.seen
}
