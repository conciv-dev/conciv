import {describe, expect} from 'vitest'
import {test as it} from '@conciv/backend-test-utils'
import {cli} from '../utils/cli.js'

describe('plugin call', () => {
  it('the output prints, bad JSON sends nothing, and a failing method prints its code, type and data', async ({
    createEngine,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/plant-shelf']})

    const counted = await cli(['plugin', 'call', 'plant-shelf', 'count', '--data', '{"plant": "fern"}'], {engine})
    expect(counted.exitCode).toBe(0)
    expect(JSON.parse(counted.stdout)).toEqual({ok: true, data: {plant: 'fern', count: 1}})

    const refused = await cli(['plugin', 'call', 'plant-shelf', 'sell', '--data', '{plant: fern}'], {engine})
    expect(refused.exitCode).toBe(1)
    expect(JSON.parse(refused.stdout)).toEqual({
      ok: false,
      error: {
        kind: 'user',
        message: '--data is not JSON: {plant: fern}',
        hint: "pass the method's input as JSON, for example --data '{}'",
      },
    })
    expect(await engine.rpc.call('plant-shelf', 'count', {plant: 'fern'})).toEqual({plant: 'fern', count: 1})

    const sold = await cli(['plugin', 'call', 'plant-shelf', 'sell', '-d', '{"plant": "fern"}'], {engine})
    expect(JSON.parse(sold.stdout)).toEqual({ok: true, data: {plant: 'fern', count: 0}})

    const soldOut = await cli(['plugin', 'call', 'plant-shelf', 'sell', '-d', '{"plant": "fern"}'], {engine})
    expect(soldOut.exitCode).toBe(1)
    expect(JSON.parse(soldOut.stdout)).toEqual({
      ok: false,
      error: {kind: 'user', message: 'fern is sold out', code: 'PLUGIN_RPC', type: 'sold-out', data: {plant: 'fern'}},
    })
  })
})
