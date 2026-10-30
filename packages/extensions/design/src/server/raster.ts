import {PNG} from 'pngjs'
import type {Raster} from '../shared/types.js'

export function decodePng(bytes: Uint8Array): Raster {
  const png = PNG.sync.read(Buffer.from(bytes))
  return {width: png.width, height: png.height, data: new Uint8Array(png.data)}
}

export function encodePng(raster: Raster): Uint8Array {
  const png = new PNG({width: raster.width, height: raster.height})
  png.data = Buffer.from(raster.data)
  return new Uint8Array(PNG.sync.write(png))
}
