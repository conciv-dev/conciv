declare module 'js-beautify/js/lib/beautifier.js' {
  import type {HTMLBeautifyOptions} from 'js-beautify'

  export const html: (source: string, options?: HTMLBeautifyOptions) => string
}
