import {existsSync, statSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
import {toolError} from '@conciv/extension'
import type {TargetAdapter} from '../../shared/types.js'
import {decodePng, scaleToWidth} from '../raster.js'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngBase64(ref: string): Uint8Array | null {
  const bytes = new Uint8Array(Buffer.from(ref, 'base64'))
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) ? bytes : null
}

export function unreadableMessage(ref: string): string {
  return `image is neither a PNG file nor PNG base64: ${ref.slice(0, 80)}`
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile()
}

async function readImage(input: {ref: string; cwd: string}): Promise<Uint8Array> {
  const path = resolve(input.cwd, input.ref)
  if (isFile(path)) return new Uint8Array(await readFile(path))
  const bytes = pngBase64(input.ref)
  if (bytes !== null) return bytes
  throw toolError('image-unreadable', {message: unreadableMessage(input.ref)})
}

export const imageAdapter: TargetAdapter = {
  kind: 'image',
  accepts: ({ref, cwd}) => isFile(resolve(cwd, ref)) || pngBase64(ref) !== null,
  load: async ({ref, width, cwd}) => {
    const decoded = decodePng(await readImage({ref, cwd}))
    const {raster, scale} = scaleToWidth({raster: decoded, width: width ?? decoded.width})
    return {
      id: randomUUID().slice(0, 8),
      source: {kind: 'image', ref: isFile(resolve(cwd, ref)) ? ref : 'base64'},
      viewport: {width: raster.width, height: raster.height},
      raster,
      scale,
      root: {
        id: 'root',
        kind: 'frame',
        box: {x: 0, y: 0, w: raster.width, h: raster.height},
        confidence: 1,
        children: [],
      },
    }
  },
}
