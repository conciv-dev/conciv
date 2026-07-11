import {test, expect} from 'vitest'
import {start} from '../src/start.js'

test('start boots on the requested fixed port', async () => {
  const engine = await start({
    options: {harnessBin: 'true'},
    root: process.cwd(),
    launchEditor: () => {},
    port: 41799,
  })
  expect(engine.port).toBe(41799)
  await engine.stop()
})
