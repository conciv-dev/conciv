import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {expect, test} from '@playwright/test'
import {uniq} from 'es-toolkit'
import {z} from 'zod'
import {e2eConfigDir, harnessHome} from '@conciv/e2e-utils/config'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test('widget boots from dist in a vanilla vite app', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
})

const OPTIMIZED_DEPENDENCY = /\/node_modules\/\.vite\/deps\/([^/]+\.js)$/

const START_LIBRARIES = [
  '@ark-ui/solid',
  '@orpc/client',
  '@orpc/contract',
  '@orpc/standard-server-peer',
  '@pierre/diffs',
  '@tanstack/ai',
  '@tanstack/ai-event-client',
  '@tanstack/history',
  '@tanstack/pacer',
  '@tanstack/solid-hotkeys',
  '@tanstack/solid-pacer',
  '@tanstack/solid-virtual',
  '@tanstack/store',
  '@tiptap/core',
  '@tiptap/extension-document',
  '@tiptap/extension-hard-break',
  '@tiptap/extension-mention',
  '@tiptap/extension-paragraph',
  '@tiptap/extension-text',
  '@tiptap/extensions',
  '@tiptap/pm',
  '@tiptap/suggestion',
  'defu',
  'effect',
  'es-toolkit',
  'gsap',
  'lru_map',
  'lucide-solid',
  'partysocket',
  'shiki',
  'solid-js',
  'vite',
  'zod',
]

const ViteMetadataSchema = z.object({optimized: z.record(z.string(), z.object({file: z.string(), src: z.string()}))})

function libraryInPath(path: string): string | undefined {
  const parts = path.split('/node_modules/')
  const tail = parts.at(-1)
  if (parts.length < 2 || tail === undefined) return undefined
  const [scope, name] = tail.split('/')
  return scope?.startsWith('@') ? `${scope}/${name}` : scope
}

function optimizedSources(configDir: string): Map<string, string> {
  const metadata = ViteMetadataSchema.parse(
    JSON.parse(readFileSync(join(configDir, 'node_modules', '.vite', 'deps', '_metadata.json'), 'utf8')),
  )
  return new Map(Object.values(metadata.optimized).map((entry) => [entry.file, entry.src]))
}

function requestedLibraries(paths: readonly string[], sources: Map<string, string>): string[] {
  const libraries = paths.flatMap((path) => {
    const optimized = OPTIMIZED_DEPENDENCY.exec(path)?.[1]
    const source = optimized === undefined ? path : sources.get(optimized)
    const library = source === undefined ? undefined : libraryInPath(source)
    return library === undefined ? [] : [library]
  })
  return uniq(libraries).toSorted()
}

test('the widget start requests only the libraries every session needs', async ({page}) => {
  const paths: string[] = []
  page.on('request', (request) => paths.push(new URL(request.url()).pathname))
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
  const terminalTab = page.getByRole('tab', {name: 'Terminal'})
  await expect(terminalTab).toBeVisible()
  const configDir = e2eConfigDir(test.info().config.configFile)
  expect(requestedLibraries(paths, optimizedSources(configDir))).toEqual(START_LIBRARIES)

  await terminalTab.click()
  await expect(page.getByRole('textbox', {name: 'Terminal input'})).toBeAttached()
  expect(requestedLibraries(paths, optimizedSources(configDir))).toContain('@xterm/xterm')
})

test('files a harness writes into its e2e home do not reload the page', async ({page}) => {
  const configDir = e2eConfigDir(test.info().config.configFile)
  const clone = join(harnessHome(configDir, 'codex'), '.codex', '.tmp', 'plugins-clone', 'plugin')
  const probeName = `reload-probe-${test.info().testId}`
  const probe = join(configDir, '.conciv', probeName)
  const probeReload = JSON.stringify({type: 'full-reload', path: `/.conciv/${probeName}/index.html`})
  const hmrSocket = page.waitForEvent('websocket', (socket) => {
    const url = new URL(socket.url())
    return url.pathname === '/' && url.searchParams.has('token')
  })
  await page.goto('/', {waitUntil: 'domcontentloaded'})
  const socket = await hmrSocket
  await page.getByRole('button', {name: 'Count is 0'}).click()
  await expect(page.getByRole('button', {name: 'Count is 1'})).toBeVisible()
  try {
    const probeAnnounced = socket.waitForEvent('framereceived', {
      predicate: (frame) => String(frame.payload) === probeReload,
    })
    mkdirSync(clone, {recursive: true})
    writeFileSync(join(clone, 'tsconfig.json'), '{}')
    writeFileSync(join(clone, 'index.html'), '<!doctype html>')
    mkdirSync(probe, {recursive: true})
    writeFileSync(join(probe, 'index.html'), '<!doctype html>')
    await probeAnnounced
    await page.getByRole('button', {name: 'Count is 1'}).click()
    await expect(page.getByRole('button', {name: 'Count is 2'})).toBeVisible()
  } finally {
    rmSync(probe, {recursive: true, force: true})
    rmSync(harnessHome(configDir, 'codex'), {recursive: true, force: true})
  }
})
