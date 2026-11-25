import {chmodSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {listOpencodeModelsInChild} from '../utils/claude-sdk-env.js'

describe('models', () => {
  it('the picker lists what `opencode models --verbose` prints, deprecated ones left out and same names told apart by provider', async () => {
    const binDir = tempDir('opencode-bin-')
    const printed = [
      {id: 'gpt-5', providerID: 'opencode', name: 'GPT-5', release_date: '2025-08-07'},
      {id: 'claude-sonnet-4-5', providerID: 'anthropic', name: 'Claude Sonnet 4.5', release_date: '2025-09-29'},
      {id: 'claude-2', providerID: 'anthropic', name: 'Claude 2', release_date: '2023-07-11', status: 'deprecated'},
      {
        id: 'anthropic/claude-sonnet-4.5',
        providerID: 'openrouter',
        name: 'Claude Sonnet 4.5',
        release_date: '2025-09-29',
      },
    ]
      .map((model) => `${model.providerID}/${model.id}\n${JSON.stringify(model, null, 2)}`)
      .join('\n')
    writeFileSync(join(binDir, 'opencode'), `#!/bin/sh\ncat <<'LISTING'\n${printed}\nLISTING\n`)
    chmodSync(join(binDir, 'opencode'), 0o755)

    const models = await listOpencodeModelsInChild(binDir)

    expect(models).toEqual([
      {
        id: 'anthropic/claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5 · anthropic',
        description: 'anthropic',
        group: 'OpenCode',
      },
      {
        id: 'openrouter/anthropic/claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5 · openrouter',
        description: 'openrouter',
        group: 'OpenCode',
      },
      {id: 'opencode/gpt-5', name: 'GPT-5', description: 'opencode', group: 'OpenCode'},
    ])
  })
})
