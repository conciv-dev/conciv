import {Store} from '@conciv/plugin/experimental'
import {z} from 'zod'

export const whiteboardStores = {
  account: Store.global(z.object({id: z.string().nullable()}), {id: null}),
  canvas: Store.global(z.object({transparent: z.boolean()}), {transparent: true}),
}

export type CanvasBackground = 'transparent' | '#ffffff'

export function readCanvasBackground(transparent: boolean): CanvasBackground {
  return transparent ? 'transparent' : '#ffffff'
}
