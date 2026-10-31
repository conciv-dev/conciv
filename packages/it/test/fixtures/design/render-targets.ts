import {readFile, writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import react from '@vitejs/plugin-react'
import {chromium} from 'playwright'
import {PNG} from 'pngjs'
import {createServer} from 'vite'

const HOST_ROOT = fileURLToPath(new URL('host/', import.meta.url))
const TARGETS_DIR = new URL('targets/', import.meta.url)

const SHOTS = [
  {name: 'u1-1280', path: '/?variant=target', ready: 'header.toolbar', width: 1280, height: 720},
  {name: 'u1-390', path: '/?variant=target', ready: 'header.toolbar', width: 390, height: 844},
  {name: 'plain-1280', path: '/plain.html', ready: 'header.plain-header', width: 1280, height: 720},
] as const

function upscale2x(source: PNG): PNG {
  const pixels = new Uint32Array(Uint8Array.from(source.data).buffer)
  const out = new PNG({width: source.width * 2, height: source.height * 2})
  const scaled = Uint32Array.from({length: out.width * out.height}, (_, index) => {
    const x = Math.floor((index % out.width) / 2)
    const y = Math.floor(Math.floor(index / out.width) / 2)
    return pixels[y * source.width + x] ?? 0
  })
  out.data = Buffer.from(scaled.buffer)
  return out
}

async function renderTargets(): Promise<void> {
  const server = await createServer({
    root: HOST_ROOT,
    configFile: false,
    logLevel: 'silent',
    server: {host: '127.0.0.1', port: 0},
    plugins: [react()],
  })
  await server.listen()
  const origin = server.resolvedUrls?.local[0]
  if (origin === undefined) throw new Error('the fixture dev server has no local url')
  const browser = await chromium.launch()
  try {
    for (const shot of SHOTS) {
      const page = await browser.newPage({viewport: {width: shot.width, height: shot.height}})
      await page.goto(new URL(shot.path, origin).href)
      await page.locator(shot.ready).waitFor()
      await page.evaluate(() => document.fonts.ready)
      await writeFile(new URL(`${shot.name}.png`, TARGETS_DIR), await page.screenshot({fullPage: false}))
      await page.close()
    }
  } finally {
    await browser.close()
    await server.close()
  }
  const retina = upscale2x(PNG.sync.read(await readFile(new URL('u1-1280.png', TARGETS_DIR))))
  await writeFile(new URL('u1-2560.png', TARGETS_DIR), PNG.sync.write(retina))
}

await renderTargets()
