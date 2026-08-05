import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {expect, test} from 'vitest'

test('the package index never imports @orpc/server, so browser and SSR graphs stay free of it', async () => {
  const indexDist = fileURLToPath(new URL('../dist/index.js', import.meta.url))
  const source = await readFile(indexDist, 'utf8')
  expect(source).not.toContain('@orpc/server')
  expect(source).not.toContain('tool-registry')
})
