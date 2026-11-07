import {migratedDb} from '@conciv/db'
import {extensionDb, type AnyExtension} from '@conciv/extension'
import {builtinServerExtensions} from '@conciv/extension-compiler/builtin-server-extensions'
import {loadServerExtensions} from '@conciv/extension-compiler/extensions'
import {userFailure} from './failure.js'
import {stateRoot} from './state-root.js'

export type LocalDb = ReturnType<typeof extensionDb>

export async function localProject(): Promise<{extensions: AnyExtension[]; open: () => LocalDb}> {
  const cwd = process.cwd()
  const root = stateRoot({cwd, env: process.env})
  const extensions = await loadServerExtensions(root ?? cwd, builtinServerExtensions)
  return {
    extensions,
    open: () => {
      if (root === undefined)
        throw userFailure(`No conciv database: looked for .conciv/conciv.db in ${cwd} and every directory above it.`, {
          hint: 'Run your app with conciv once, or set CONCIV_STATE_ROOT to the directory that holds .conciv.',
        })
      return extensionDb({orm: migratedDb({stateRoot: root, extensions}), extensions})
    },
  }
}
