import {createRequire} from 'node:module'

declare const CONCIV_LIBC: string | undefined

function detectedLibc(require: NodeJS.Require) {
  if (process.platform !== 'linux') return undefined
  const {MUSL, family}: {MUSL: unknown; family: unknown} = require('detect-libc')
  return family === MUSL ? 'musl' : 'glibc'
}

export default function load(bindingPath: string | undefined) {
  const require = createRequire(import.meta.url)
  const libc = typeof CONCIV_LIBC === 'undefined' ? detectedLibc(require) : CONCIV_LIBC
  return require(
    bindingPath ??
      `@parcel/watcher-${process.platform}-${process.arch}${process.platform === 'linux' ? `-${libc || 'glibc'}` : ''}`,
  )
}
