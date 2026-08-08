import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, test} from 'vitest'
import manifest from '../package.json' with {type: 'json'}

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

const declared = new Set([
  ...Object.keys(manifest.dependencies),
  ...Object.keys(manifest.peerDependencies),
  ...Object.keys(manifest.devDependencies),
])

const peersOf = (name: string): string[] => {
  const raw: unknown = JSON.parse(readFileSync(`${packageRoot}node_modules/${name}/package.json`, 'utf8'))
  const peers = (raw as {peerDependencies?: Record<string, string>}).peerDependencies
  return Object.keys(peers ?? {})
}

describe('every runtime peer of a direct dependency is provided by this package', () => {
  test.each(Object.keys(manifest.dependencies).filter((name) => !name.startsWith('@conciv/')))(
    '%s declares no peer this package leaves unresolved',
    (name) => {
      expect(peersOf(name).filter((peer) => !declared.has(peer))).toEqual([])
    },
  )
})
