import {describe, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'

describe.concurrent('model list', () => {
  test.for([
    {
      case: "the engine harness's own list",
      harnesses: undefined,
      models: [
        {id: 'opus', providerId: 'engine', name: 'Opus 5.5'},
        {id: 'sonnet', providerId: 'engine', name: 'Sonnet 5.5'},
        {id: 'claude-opus-4-7', providerId: 'engine', name: 'Opus 4.7'},
        {id: 'claude-haiku-4-5', providerId: 'engine', name: 'Haiku 4.5'},
      ],
    },
    {
      case: 'another list',
      harnesses: [{id: 'engine', models: [{id: 'tiny', name: 'Tiny 1'}]}],
      models: [{id: 'tiny', providerId: 'engine', name: 'Tiny 1'}],
    },
    {
      case: 'no models',
      harnesses: [{id: 'engine', models: []}],
      models: [],
    },
  ])('a plugin reads $case from model.list', async ({harnesses, models}, {expect}) => {
    const engine = await createEngine(
      {plugins: ['./test/fixtures/plugins/model-lister']},
      harnesses === undefined ? {} : {harnesses},
    )

    expect(await engine.session.tool('list_models').call({})).toEqual({models})
  })
})
