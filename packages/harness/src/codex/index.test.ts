import {chmodSync, rmSync, writeFileSync} from 'node:fs'
import {delimiter, join} from 'node:path'
import {ConfigProvider} from 'effect'
import {describe, expect, it} from 'vitest'
import {codexModels} from '@conciv/ai/server'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {codex} from './index.js'

describe('codex', () => {
  it('a CODEX_HOME with a models cache and a config lists those models and picks the configured default', async () => {
    const home = tempDir('codex-home-')
    writeFileSync(
      join(home, 'models_cache.json'),
      JSON.stringify({
        models: [
          {
            slug: 'gpt-5.6-sol',
            display_name: 'GPT-5.6 Sol',
            visibility: 'list',
            priority: 2,
            supported_reasoning_levels: [{effort: 'low'}, {effort: 'high'}],
          },
          {slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list', priority: 1},
          {slug: 'gpt-internal', display_name: 'Internal', visibility: 'hide', priority: 0},
        ],
      }),
    )
    writeFileSync(join(home, 'config.toml'), 'model = "gpt-5.6-sol"\n\n[profiles.fast]\nmodel = "gpt-5.5"\n')

    const harness = codex(ConfigProvider.fromEnvRecord({CODEX_HOME: home}))

    expect(await harness.models()).toEqual([
      {id: 'gpt-5.5', name: 'GPT-5.5', group: 'Codex'},
      {id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', group: 'Codex', efforts: ['low', 'high']},
    ])
    expect(harness.defaultModel).toBe('gpt-5.6-sol')
    expect(harness.resume.command({cwd: '/workspace', nativeId: HarnessSessionId.parse('thread-1')})).toEqual({
      bin: 'codex',
      args: ['resume', 'thread-1'],
    })
  })

  it('an empty CODEX_HOME lists the built-in models and defaults to the first', async () => {
    const harness = codex(ConfigProvider.fromEnvRecord({CODEX_HOME: tempDir('codex-home-')}))

    const models = await harness.models()

    expect(models.map((model) => model.id)).toEqual([...codexModels])
    expect(harness.defaultModel).toBe(codexModels[0])
  })

  it('a CODEX_HOME whose provider does not use the stored OpenAI login is not gated on it', async () => {
    const home = tempDir('codex-home-')
    writeFileSync(
      join(home, 'config.toml'),
      [
        'model = "kimi-k3"',
        'model_provider = "gateway"',
        '',
        '[model_providers.gateway]',
        'name = "Gateway"',
        'base_url = "https://gateway.example/v1"',
        'env_key = "GATEWAY_API_KEY"',
        'wire_api = "responses"',
        '',
      ].join('\n'),
    )

    const harness = codex(ConfigProvider.fromEnvRecord({CODEX_HOME: home}))

    expect(await harness.login({signal: new AbortController().signal})).toEqual({loggedIn: true})
  })

  it('a refresh re-runs codex login status after a logged-in answer, and a plain read keeps the held answer', async () => {
    const signal = new AbortController().signal
    const bin = tempDir('codex-bin-')
    const loggedInFile = join(bin, 'logged-in')
    writeFileSync(
      join(bin, 'codex'),
      `#!/bin/sh\nif [ -e '${loggedInFile}' ]; then echo 'Logged in using an API key'; exit 0; fi\necho 'Not logged in' >&2\nexit 1\n`,
    )
    chmodSync(join(bin, 'codex'), 0o755)
    const notLoggedIn = {loggedIn: false, message: 'Codex is not logged in. Run `codex login` in a terminal.'}
    const harness = codex(
      ConfigProvider.fromEnvRecord({
        CODEX_HOME: tempDir('codex-home-'),
        PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      }),
    )

    expect(await harness.login({signal})).toEqual(notLoggedIn)
    writeFileSync(loggedInFile, '')
    expect(await harness.login({signal})).toEqual({loggedIn: true})
    rmSync(loggedInFile)
    expect(await harness.login({signal})).toEqual({loggedIn: true})
    expect(await harness.login({signal, refresh: true})).toEqual(notLoggedIn)
    expect(await harness.login({signal})).toEqual(notLoggedIn)
  })
})
