import {defineErrorCatalog} from 'evlog'

export const imageErrors = defineErrorCatalog('app-api.image', {
  RESIZER_UNAVAILABLE: {message: 'Image resizer is unavailable'},
  DECODE_FAILED: {
    status: 400,
    message: ({resource}: {resource: string}) => `Image could not be decoded: ${resource}`,
    fix: 'Send the image as a PNG, JPEG, GIF or WebP file.',
  },
  TOO_LARGE: {
    status: 413,
    message: (size: {
      resource: string
      width: number
      height: number
      bytes: number
      maxWidth: number
      maxHeight: number
      maxBytes: number
    }) =>
      `Image ${size.resource} is ${size.width}x${size.height} with base64 size ${size.bytes}, exceeding configured limits ${size.maxWidth}x${size.maxHeight}/${size.maxBytes} bytes`,
    fix: 'Send a smaller image, or turn on image auto-resize.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'app-api.image': typeof imageErrors
  }
}
