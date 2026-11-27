import {describe, expect} from 'vitest'
import {test} from '@conciv/backend-test-utils'
import {TestLLM} from '@conciv/backend-test-utils'
import {listerPlugin} from '@internal/engine-kit'

describe('the ios plugin with no options', () => {
  test('every ios tool answers that the plugin is not configured, without an ask', async ({createEngine}) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-ios']})
    const notConfigured = {ok: false, error: 'ios plugin not configured'}

    expect(await engine.session.tool('ios_build').call({})).toEqual(notConfigured)
    expect(await engine.session.tool('ios_run').call({})).toEqual(notConfigured)
    expect(await engine.session.tool('ios_screenshot').call({})).toEqual(notConfigured)
    expect(await engine.session.tool('ios_logs').call({})).toEqual(notConfigured)
  })
})

describe('the ios rules in the system prompt', () => {
  test('a configured app adds the overlay and app rules to the model request, and no options add none', async ({
    createEngine,
  }) => {
    const configured = await createEngine({
      plugins: [['@conciv/plugin-ios', {projectRoot: 'PayApp', bundleId: 'dev.conciv.pay', buildMode: 'swiftc'}]],
    })
    await configured.reply(TestLLM.text('The button is on the native screen'))
    await configured.session.send('Where is the pay button?')

    const [configuredRequest] = await configured.requests()
    const configuredSystem = configuredRequest?.system.join('\n')
    expect(configuredSystem).toContain(
      'You are running as an overlay inside a native iOS app on the simulator, not on a web page.',
    )
    expect(configuredSystem).toContain(
      'bundle id dev.conciv.pay, built in swiftc mode with the default scheme for the iPhone 17 Pro simulator.',
    )

    const unconfigured = await createEngine({plugins: ['@conciv/plugin-ios']})
    await unconfigured.reply(TestLLM.text('I see a web page'))
    await unconfigured.session.send('Where is the pay button?')

    const [unconfiguredRequest] = await unconfigured.requests()
    const unconfiguredSystem = unconfiguredRequest?.system.join('\n')
    expect(unconfiguredSystem).not.toContain(
      'You are running as an overlay inside a native iOS app on the simulator, not on a web page.',
    )
    expect(unconfiguredSystem).not.toContain('This session serves exactly one app')
  })
})

describe('building and running a configured app', () => {
  test('the agent asks before ios_build and before ios_run, and a stopped turn runs neither', async ({
    createEngine,
  }) => {
    const engine = await createEngine({
      plugins: [['@conciv/plugin-ios', {projectRoot: 'PayApp', bundleId: 'dev.conciv.pay', buildMode: 'swiftc'}]],
    })

    await engine.reply(TestLLM.toolCall('c1', 'ios_build', {}))
    const buildAsked = await engine.event('permission.asked')
    const building = engine.session.send('Build the app')
    await expect(buildAsked.arrived).resolves.toMatchObject({data: {action: 'ios_build', resources: ['*']}})
    await engine.session.stop()
    await building
    expect(await engine.requests()).toHaveLength(1)

    await engine.reply(TestLLM.toolCall('c2', 'ios_run', {}))
    const runAsked = await engine.event('permission.asked')
    const running = engine.session.send('Run the app')
    await expect(runAsked.arrived).resolves.toMatchObject({data: {action: 'ios_run', resources: ['*']}})
    await engine.session.stop()
    await running
    expect(await engine.requests()).toHaveLength(2)
  })
})

describe('the ios plugin with bad options', () => {
  test.for([
    [
      'a missing bundle id',
      {projectRoot: 'PayApp'},
      {status: 'failed', error: expect.stringMatching(/^failed to load plugin: ios\.INVALID_OPTIONS: .*bundleId/s)},
    ],
    [
      'a concivUrl with a page path',
      {projectRoot: 'PayApp', bundleId: 'dev.conciv.pay', concivUrl: 'http://127.0.0.1:4732/widget/panel'},
      {
        status: 'failed',
        error: expect.stringContaining(
          'concivUrl must be the engine api base with no path: the swift sdk appends /widget itself',
        ),
      },
    ],
    [
      'a concivUrl that ends in /widget',
      {projectRoot: 'PayApp', bundleId: 'dev.conciv.pay', concivUrl: 'http://127.0.0.1:4732/widget'},
      {status: 'active'},
    ],
  ] as const)('the engine lists the ios plugin state for %s', async ([_case, options, state], {createEngine}) => {
    const engine = await createEngine({plugins: [listerPlugin, ['@conciv/plugin-ios', options]]})

    expect(await engine.session.tool('list_plugins').call({})).toEqual({
      plugins: expect.arrayContaining([expect.objectContaining({id: 'ios', state})]),
    })
  })
})
