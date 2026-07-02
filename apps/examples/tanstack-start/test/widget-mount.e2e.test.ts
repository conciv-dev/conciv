import {afterEach, describe, expect, it} from 'vitest'
import {spawn, type ChildProcess} from 'node:child_process'
import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium} from 'playwright'

const appDir = dirname(dirname(fileURLToPath(import.meta.url)))

function startDevServer(nitro: boolean, port: number): Promise<{child: ChildProcess; url: string}> {
  const child = spawn('node_modules/.bin/vite', ['dev', '--port', String(port)], {
    cwd: appDir,
    env: {...process.env, CONCIV_NITRO: nitro ? '1' : '0'},
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('dev server did not print a Local URL in time')), 60_000)
    const onData = (buf: Buffer): void => {
      const match = /Local:\s+(http:\/\/localhost:\d+\/?)/.exec(buf.toString())
      if (!match) return
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      resolve({child, url: match[1]})
    }
    child.stdout?.on('data', onData)
    child.on('exit', (code) => reject(new Error(`dev server exited early (code ${code})`)))
  })
}

function stopDevServer(child: ChildProcess): void {
  if (child.pid === undefined) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

async function widgetMounts(url: string): Promise<boolean> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(url, {waitUntil: 'domcontentloaded'})
    await page.waitForSelector('[data-conciv-root]', {timeout: 20_000})
    return true
  } catch {
    return false
  } finally {
    await browser.close()
  }
}

describe.each([
  {label: 'classic TanStack Start dev SSR', nitro: false, port: 3210},
  {label: 'nitro server layer', nitro: true, port: 3211},
])('conciv widget on the $label stack', ({nitro, port}) => {
  const state: {child: ChildProcess | undefined} = {child: undefined}
  afterEach(() => {
    if (state.child) stopDevServer(state.child)
    state.child = undefined
  })

  it('mounts the widget into the SSR document', async () => {
    const {child, url} = await startDevServer(nitro, port)
    state.child = child
    expect(await widgetMounts(url)).toBe(true)
  }, 90_000)
})
