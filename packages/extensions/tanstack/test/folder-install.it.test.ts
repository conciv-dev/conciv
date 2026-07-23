import {test, expect} from 'vitest'
import {cpSync, mkdirSync, symlinkSync, writeFileSync} from 'node:fs'
import {mkdtemp, realpath} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {start} from '@conciv/core/start'
import {makeCallTool, resolveSession} from '@conciv/harness-testkit'
import {loadServerExtensions} from '@conciv/extension-compiler/extensions'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))

test('a dropped re-export is discovered by loadServerExtensions and its server tool runs on the real engine', async () => {
  const root = await realpath(await mkdtemp(join(await realpath(tmpdir()), 'conciv-fi-')))
  cpSync(fileURLToPath(new URL('./fixtures/route-manifest-app', import.meta.url)), root, {recursive: true})
  mkdirSync(join(root, 'node_modules/@conciv'), {recursive: true})
  symlinkSync(packageRoot, join(root, 'node_modules/@conciv/extension-tanstack'))
  mkdirSync(join(root, 'conciv/extensions'), {recursive: true})
  writeFileSync(join(root, 'conciv/extensions/tanstack.tsx'), "export {default} from '@conciv/extension-tanstack'\n")

  const extensions = await loadServerExtensions(root, [])
  expect(extensions.map((extension) => extension.name)).toContain('tanstack')

  const engine = await start({
    options: {stateRoot: root, systemPrompt: false},
    root,
    launchEditor: () => {},
    extensions,
  })
  const apiBase = `http://127.0.0.1:${engine.port}`
  const callTool = makeCallTool(apiBase, await resolveSession(apiBase))
  const routes = await callTool('tanstack_route_manifest', {})
  expect(Array.isArray(routes)).toBe(true)
  await engine.stop()
})
