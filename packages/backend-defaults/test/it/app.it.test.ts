import {ConfigProvider} from 'effect'
import {describe, expect, test} from 'vitest'
import {resolveHarnessModels} from '@conciv/harness'
import {codex} from '@conciv/harness/codex'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {makeApp, withSavedModels} from '../../src/engine/app.js'
import {resolveConfig} from '../../src/engine/config.js'
import {makeMaker} from '@conciv/protocol/schema/identifier'

describe('the saved model list', () => {
  test('a model probe that fails after a good listing keeps answering the last good list, across restarts', async () => {
    const stateDir = tempDir('saved-models-')
    const signal = new AbortController().signal
    const adapter = codex(ConfigProvider.fromEnvRecord({CODEX_HOME: tempDir('codex-home-')}))
    const listed = [{id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol'}]
    const signedOut = () => Promise.reject(new Error('the CLI is signed out'))
    const unlogged = {runFork: () => undefined}

    const first = await withSavedModels({...adapter, models: () => Promise.resolve(listed)}, stateDir, signal, unlogged)
    await expect(resolveHarnessModels(first.harness, {signal})).resolves.toEqual(listed)
    await first.settled()

    const failing = await withSavedModels({...adapter, models: signedOut}, stateDir, signal, unlogged)
    await expect(resolveHarnessModels(failing.harness, {signal})).resolves.toEqual(listed)
    await failing.settled()

    const afterFailure = await withSavedModels({...adapter, models: signedOut}, stateDir, signal, unlogged)
    await expect(resolveHarnessModels(afterFailure.harness, {signal})).resolves.toEqual(listed)
    await afterFailure.settled()
  })

  test('the engine starts listing the models before anyone asks, and the first ask reuses that listing', async () => {
    const signal = new AbortController().signal
    const adapter = codex(ConfigProvider.fromEnvRecord({CODEX_HOME: tempDir('codex-home-')}))
    const listed = [{id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol'}]
    const listing = Promise.withResolvers<typeof listed>()
    const started: string[] = []
    const models = () => {
      started.push('listing')
      return listing.promise
    }

    const warmed = await withSavedModels({...adapter, models}, tempDir('saved-models-'), signal, {
      runFork: () => undefined,
    })
    expect(started).toEqual(['listing'])

    const asked = resolveHarnessModels(warmed.harness, {signal})
    listing.resolve(listed)
    await expect(asked).resolves.toEqual(listed)
    expect(started).toEqual(['listing'])
    await warmed.settled()

    const engineStarted: string[] = []
    const recorded = {
      ...adapter,
      models: () => {
        engineStarted.push('listing')
        return Promise.resolve(listed)
      },
    }
    const root = tempDir('app-root-')
    const configProvider = ConfigProvider.fromEnvRecord({CODEX_HOME: tempDir('codex-home-')})
    const made = await makeApp({
      cfg: resolveConfig({stateRoot: root}, root, configProvider),
      cwd: root,
      home: tempDir('app-home-'),
      configProvider,
      openInEditor: () => {},
      harness: recorded,
      harnesses: [recorded],
      ids: makeMaker(),
    })
    expect(engineStarted).toEqual(['listing'])
    await made.dispose()
  })
})
