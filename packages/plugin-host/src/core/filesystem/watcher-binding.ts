import {createRequire} from 'node:module'

declare const OPENCODE_LIBC: string | undefined

function detectedLibc(require: NodeJS.Require) {
  if (process.platform !== 'linux') return undefined
  const {MUSL, family}: {MUSL: unknown; family: unknown} = require('detect-libc')
  return family === MUSL ? 'musl' : 'glibc'
}

export default function load() {
  const require = createRequire(import.meta.url)
  const libc = typeof OPENCODE_LIBC === 'undefined' ? detectedLibc(require) : OPENCODE_LIBC
  return require(
    process.env.OPENCODE_PARCEL_WATCHER_PATH ??
      `@parcel/watcher-${process.platform}-${process.arch}${process.platform === 'linux' ? `-${libc || 'glibc'}` : ''}`,
  )
}
