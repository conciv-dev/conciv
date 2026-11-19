import {Schema} from 'effect'

export const ResizerUnavailableError = Schema.TaggedStruct('Image.ResizerUnavailableError', {})
export type ResizerUnavailableError = typeof ResizerUnavailableError.Type & globalThis.Error

export const makeResizerUnavailableError = (): ResizerUnavailableError =>
  Object.assign(new globalThis.Error('Image resizer is unavailable'), ResizerUnavailableError.make({}), {
    name: 'Image.ResizerUnavailableError',
  })

export const DecodeError = Schema.TaggedStruct('Image.DecodeError', {
  resource: Schema.String,
})
export type DecodeError = typeof DecodeError.Type & globalThis.Error

export const makeDecodeError = (fields: Omit<typeof DecodeError.Type, '_tag'>): DecodeError =>
  Object.assign(new globalThis.Error(`Image could not be decoded: ${fields.resource}`), DecodeError.make(fields), {
    name: 'Image.DecodeError',
  })

export const SizeError = Schema.TaggedStruct('Image.SizeError', {
  resource: Schema.String,
  width: Schema.Number,
  height: Schema.Number,
  bytes: Schema.Number,
  maxWidth: Schema.Number,
  maxHeight: Schema.Number,
  maxBytes: Schema.Number,
})
export type SizeError = typeof SizeError.Type & globalThis.Error

export const makeSizeError = (fields: Omit<typeof SizeError.Type, '_tag'>): SizeError =>
  Object.assign(
    new globalThis.Error(
      `Image ${fields.resource} is ${fields.width}x${fields.height} with base64 size ${fields.bytes}, exceeding configured limits ${fields.maxWidth}x${fields.maxHeight}/${fields.maxBytes} bytes`,
    ),
    SizeError.make(fields),
    {name: 'Image.SizeError'},
  )
