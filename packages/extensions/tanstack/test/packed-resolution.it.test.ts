import {test, expect} from 'vitest'
import {execFileSync} from 'node:child_process'
import {mkdtempSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'

test('packed tarball has no workspace protocol and ships the conditional export map', () => {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-packed-'))
  execFileSync('pnpm', ['pack', '--pack-destination', dir], {cwd: process.cwd()})
  const tgz = execFileSync('sh', ['-c', `ls ${dir}/*.tgz`])
    .toString()
    .trim()
  const manifestText = execFileSync('tar', ['-xzOf', tgz, 'package/package.json']).toString()
  expect(manifestText).not.toContain('workspace:')
  const manifest: unknown = JSON.parse(manifestText)
  if (typeof manifest !== 'object' || manifest === null || !('exports' in manifest)) throw new Error('no exports')
  expect(manifest.exports).toMatchObject({
    '.': {
      browser: {types: './dist/client.d.ts', default: './dist/client.js'},
      import: {types: './dist/server.d.ts', default: './dist/server.js'},
    },
  })
  const files = execFileSync('tar', ['-tzf', tgz]).toString()
  expect(files).toContain('package/dist/client.js')
  expect(files).toContain('package/dist/server.js')
})
