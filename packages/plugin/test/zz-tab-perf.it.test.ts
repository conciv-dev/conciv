import {writeFileSync, mkdtempSync, realpathSync, mkdirSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {it} from 'vitest'
import {chromium, type Page} from 'playwright'
import {createServer} from 'vite'
import {NO_BUILTINS, type Builtins} from '@conciv/extension-compiler/extensions'
import ios from '@conciv/extension-ios'
import recorder from '@conciv/extension-recorder'
import terminal from '@conciv/extension-terminal'
import testRunner from '@conciv/extension-test-runner'
import whiteboard from '@conciv/extension-whiteboard'
import {makeViteHook} from '../src/core/vite.js'

const OUT = process.env.PERF_OUT ?? '/tmp/perf.json'
const MODE = process.env.PERF_MODE ?? 'measure'
const ROUNDS = Number(process.env.PERF_ROUNDS ?? 5)

const builtins: Builtins = {
  ...NO_BUILTINS,
  serverExtensions: [terminal, testRunner, whiteboard, recorder, ios],
  clientEntries: [
    '@conciv/extension-terminal/client',
    '@conciv/extension-test-runner/client',
    '@conciv/extension-whiteboard/client',
    '@conciv/extension-recorder/client',
    '@conciv/extension-ios/client',
  ].map((specifier) => fileURLToPath(import.meta.resolve(specifier))),
  embedEntry: fileURLToPath(import.meta.resolve('@conciv/embed')),
  dedupeEntry: fileURLToPath(import.meta.resolve('@conciv/extension-compiler/dedupe')),
}

const EXCHANGES = Number(process.env.PERF_EXCHANGES ?? 0)

function seedTranscript(home: string, cwd: string): void {
  const dir = join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(dir, {recursive: true})
  const lines: string[] = []
  const stamp = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()
  for (let i = 0; i < EXCHANGES; i++) {
    lines.push(JSON.stringify({type: 'user', uuid: randomUUID(), timestamp: stamp(i * 3), message: {role: 'user', content: i === 0 ? 'perf seeded thread' : `question number ${i}: why does the layout of the card list wrap on narrow screens?`}}))
    const toolId = `toolu_${i}`
    lines.push(JSON.stringify({type: 'assistant', uuid: randomUUID(), timestamp: stamp(i * 3 + 1), message: {id: `msg_${i}`, role: 'assistant', content: [
      {type: 'text', text: `Let me look at the card list for exchange ${i}.`},
      {type: 'tool_use', id: toolId, name: 'Bash', input: {command: `rg -n "CardList" src --glob '*.tsx' # ${i}`}},
    ]}}))
    lines.push(JSON.stringify({type: 'user', uuid: randomUUID(), timestamp: stamp(i * 3 + 2), message: {role: 'user', content: [{type: 'tool_result', tool_use_id: toolId, content: 'src/card-list.tsx:12: export function CardList()\nsrc/routes/index.tsx:40: <CardList items={items} />'}]}}))
    lines.push(JSON.stringify({type: 'assistant', uuid: randomUUID(), timestamp: stamp(i * 3 + 2), message: {id: `msg_${i}b`, role: 'assistant', content: [
      {type: 'text', text: `## Exchange ${i}\n\nThe grid uses **fixed** column widths, so it wraps early. Here is the fix:\n\n\`\`\`tsx\nexport function CardList(props: {items: Item[]}) {\n  return (\n    <ul class=\"grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3\">\n      <For each={props.items}>{(item) => <Card item={item} />}</For>\n    </ul>\n  )\n}\n\`\`\`\n\n- keeps cards at least 14rem\n- fills the row\n- no media queries needed`},
    ]}}))
  }
  writeFileSync(join(dir, `${randomUUID()}.jsonl`), lines.join('\n') + '\n')
}

function readyOf(page: Page, name: string) {
  if (name === 'Terminal') return page.getByRole('textbox', {name: 'Terminal input'})
  if (name === 'Recorder') return page.getByRole('button', {name: 'New recording'})
  if (name === 'Messages') return page.frameLocator('iframe[title="Messages"]').getByText('No messages')
  if (name === 'Terminals') return page.frameLocator('iframe[title="Terminals"]').getByText('Terminals').first()
  return page.getByRole('tabpanel', {name}).first()
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0
  return {median: at(0.5), p95: at(0.95), all: values.map((v) => Math.round(v))}
}

it('measures tab switches', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-perf-')))
  if (EXCHANGES > 0) {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-perf-home-')))
    process.env.HOME = home
    seedTranscript(home, root)
  }
  writeFileSync(join(root, 'index.html'), '<!doctype html><meta charset="utf-8"><title>host</title><h1>host</h1>')
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: {host: '127.0.0.1', port: 0},
    plugins: [makeViteHook({enabled: true, stateRoot: root}, builtins)],
  })
  await server.listen()
  const url = server.resolvedUrls?.local[0] ?? ''
  const browser = await chromium.launch({headless: true})
  const page: Page = await browser.newPage({viewport: {width: 1280, height: 900}})
  try {
    const trusted = await import('@conciv/extension-testkit/trusted-tab').catch(() => undefined)
    if (trusted) {
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          await trusted.trustedTab(page, {root})
          break
        } catch {
          await page.waitForTimeout(100)
        }
      }
    }
    await page.addInitScript(() => {
      const tasks: {start: number; duration: number}[] = []
      Reflect.set(globalThis, '__longTasks', tasks)
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) tasks.push({start: entry.startTime, duration: entry.duration})
      }).observe({type: 'longtask', buffered: true})
    })
    const requests: {at: number; url: string}[] = []
    const frames: {at: number; url: string}[] = []
    page.on('request', (request) => requests.push({at: Date.now(), url: request.url()}))
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) frames.push({at: Date.now(), url: frame.url()})
    })
    await page.goto(url, {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: /conciv chat$/}).click({timeout: 60_000})
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.waitFor({timeout: 60_000})
    if (EXCHANGES > 0) {
      await page.getByRole('button', {name: 'Session options'}).click()
      await page.getByRole('button', {name: /^Session: /}).click()
      await page.getByRole('option', {name: /perf seeded thread/}).click({timeout: 30_000})
      await page.keyboard.press('Escape')
      await page.getByText(`Exchange ${EXCHANGES - 1}`, {exact: true}).waitFor({timeout: 60_000})
    }
    const bar = page.getByRole('toolbar', {name: 'Session status'})
    const tabs = bar.getByRole('tab')
    await page.waitForTimeout(3000)
    const names = (await tabs.allInnerTexts()).map((text) => text.trim().split('\n')[0] ?? '')
    console.log('TABS', JSON.stringify(names))
    if (MODE === 'discover') {
      for (const name of names) {
        await bar.getByRole('tab', {name}).first().click()
        await page.waitForTimeout(2500)
        const panel = page.getByRole('tabpanel').filter({visible: true})
        console.log('PANEL', name, await panel.first().ariaSnapshot().catch((e) => String(e)))
        await page.screenshot({path: `${OUT}.${name}.png`})
      }
      return
    }
    const results: Record<string, unknown> = {}
    for (const name of names.filter((n) => n !== 'Chat')) {
      const toTab: number[] = []
      const toChat: number[] = []
      const longTo: number[] = []
      const longBack: number[] = []
      const reqTo: number[] = []
      const reqBack: number[] = []
      const frameTo: number[] = []
      const frameBack: number[] = []
      for (let round = 0; round < ROUNDS; round++) {
        for (const direction of ['to', 'back'] as const) {
          const target = direction === 'to' ? name : 'Chat'
          await page.waitForTimeout(800)
          const longBefore = (await page.evaluate(() => (Reflect.get(globalThis, '__longTasks') as unknown[]).length))
          const reqBefore = requests.length
          const frameBefore = frames.length
          const t0 = Date.now()
          await bar.getByRole('tab', {name: target}).first().click()
          if (direction === 'back' && EXCHANGES > 0) await page.getByText(`Exchange ${EXCHANGES - 1}`, {exact: true}).waitFor({state: 'visible', timeout: 30_000})
          else if (direction === 'back') await composer.waitFor({state: 'visible', timeout: 30_000})
          else await readyOf(page, name).waitFor({state: 'visible', timeout: 30_000})
          const elapsed = Date.now() - t0
          await page.waitForTimeout(1000)
          const longs = await page.evaluate(
            (from) => (Reflect.get(globalThis, '__longTasks') as {duration: number}[]).slice(from),
            longBefore,
          )
          const longSum = longs.reduce((sum, task) => sum + task.duration, 0)
          ;(direction === 'to' ? toTab : toChat).push(elapsed)
          ;(direction === 'to' ? longTo : longBack).push(longSum)
          ;(direction === 'to' ? reqTo : reqBack).push(requests.length - reqBefore)
          ;(direction === 'to' ? frameTo : frameBack).push(frames.length - frameBefore)
          if (round === 0) console.log('REQS', direction, target, JSON.stringify(requests.slice(reqBefore).map((r) => r.url.replace(url, '/'))))
        }
      }
      results[name] = {
        toTab: stats(toTab),
        toChat: stats(toChat),
        longTaskMsTo: stats(longTo),
        longTaskMsBack: stats(longBack),
        requestsTo: stats(reqTo),
        requestsBack: stats(reqBack),
        framesTo: stats(frameTo),
        framesBack: stats(frameBack),
      }
    }
    writeFileSync(OUT, JSON.stringify(results, null, 2))
    console.log('RESULTS', JSON.stringify(results))
  } finally {
    await browser.close()
    await server.close()
  }
}, 600_000)
