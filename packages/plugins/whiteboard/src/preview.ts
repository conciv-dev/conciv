import {Renderer} from '@takumi-rs/core'
import {container, image, percentage} from '@takumi-rs/helpers'
import {Effect, Schema} from 'effect'

export const RenderFailed = Schema.TaggedStruct('RenderFailed', {message: Schema.String})
export type RenderFailed = typeof RenderFailed.Type

export const makeRenderer = Effect.sync(() => new Renderer())

export const renderDraftPng = Effect.fn('whiteboard.canvas.renderDraftPng')(function* (
  renderer: Renderer,
  svg: string,
  width: number,
  height: number,
) {
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const node = container({
    style: {width: percentage(100), height: percentage(100), backgroundColor: '#ffffff'},
    children: [image({src: dataUri, width, height})],
  })
  const buffer = yield* Effect.tryPromise({
    try: () => renderer.render(node, {width, height, format: 'png'}),
    catch: (error) => RenderFailed.make({message: error instanceof Error ? error.message : String(error)}),
  })
  return buffer.toString('base64')
})
