import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {expect, test} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {makeWidgetPageApp} from './widget-page.js'

test('the widget page points the widget at its own origin, takes a known launcher only, and serves the loader and its chunks', async () => {
  const dir = tempDir('widget-page-')
  mkdirSync(join(dir, 'widget'))
  writeFileSync(join(dir, 'conciv-widget.global.js'), 'loader()')
  writeFileSync(join(dir, 'widget', 'chunk-a.js'), 'chunk()')
  const app = makeWidgetPageApp(dir)

  const page = await (await app.request('http://127.0.0.1:4599/?launcher=native')).text()
  expect(page).toContain('<meta name="conciv-api-base" content="http://127.0.0.1:4599" />')
  expect(page).toContain('<meta name="conciv-widget" content="{&quot;launcher&quot;:&quot;native&quot;}" />')
  expect(page).toContain('<script src="widget/conciv-widget.global.js"></script>')
  expect(await (await app.request('http://127.0.0.1:4599/?launcher=evil')).text()).toContain(
    '<meta name="conciv-widget" content="{}" />',
  )
  expect(await (await app.request('/conciv-widget.global.js')).text()).toBe('loader()')
  expect(await (await app.request('/widget/chunk-a.js')).text()).toBe('chunk()')
  expect((await app.request('/other.js')).status).toBe(404)
  expect((await app.request('/widget/..%2Fsecret.js')).status).toBe(404)
})
