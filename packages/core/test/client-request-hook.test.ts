import {test, expect} from 'vitest'
import {start} from '../src/start.js'

test('onClientRequest fires once on the first token request', async () => {
  let fired = 0
  const engine = await start({
    options: {harnessBin: 'true'},
    root: process.cwd(),
    launchEditor: () => {},
    accessToken: 'tok-hook',
    onClientRequest: () => {
      fired += 1
    },
  })
  expect(fired).toBe(0)
  await fetch(`http://127.0.0.1:${engine.port}/t/tok-hook/health`)
  await fetch(`http://127.0.0.1:${engine.port}/t/tok-hook/health`)
  expect(fired).toBe(1)
  await engine.stop()
})
