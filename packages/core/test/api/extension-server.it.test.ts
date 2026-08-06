import {expect, test} from 'vitest'
import {bootKit} from '../helpers/boot.js'
import {sampleServerExtension, sampleState} from '../fixtures/sample-server-extension.js'

test('extension route serves typed config; tool runs against injected ctx; dispose on close', async () => {
  sampleState.disposed = false
  const kit = await bootKit({
    extensions: [sampleServerExtension],
    extensionConfig: {sample: {factor: 5}},
  })
  const {base, cleanup: close} = kit
  try {
    const echo = (await (await fetch(`${base}/api/ext/sample/echo`)).json()) as {factor: number; cwd: string}
    expect(echo.factor).toBe(5)

    expect(JSON.stringify(await kit.callTool('sample_mul', {n: 4}))).toContain('20')
  } finally {
    await close()
  }
  expect(sampleState.disposed).toBe(true)
}, 30_000)
