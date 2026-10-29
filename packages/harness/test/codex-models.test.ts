import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {CODEX_MODELS} from '@tanstack/ai-codex'
import {describe, expect, it} from 'vitest'
import {codexDefaultModel, codexModels} from '../src/codex/models.js'

const MODELS_CACHE = {
  fetched_at: '2026-10-30T00:00:00Z',
  etag: 'etag-1',
  client_version: '0.150.0',
  models: [
    {slug: 'gpt-second', display_name: 'GPT Second', visibility: 'list', priority: 2, supported_in_api: true},
    {slug: 'gpt-hidden', display_name: 'GPT Hidden', visibility: 'hide', priority: 0, supported_in_api: true},
    {slug: 'gpt-first', display_name: 'GPT First', visibility: 'list', priority: 1, supported_in_api: true},
  ],
}

const fallback = CODEX_MODELS.map((id) => ({id, name: id, group: 'Codex'}))

const codexHome = (files: Record<string, string>): string => {
  const home = mkdtempSync(join(tmpdir(), 'codex-models-'))
  mkdirSync(join(home, '.codex'))
  Object.entries(files).forEach(([name, content]) => writeFileSync(join(home, '.codex', name), content))
  return home
}

describe('codexModels', () => {
  it('lists the listed models from codex catalog in priority order', () => {
    const home = codexHome({'models_cache.json': JSON.stringify(MODELS_CACHE)})
    expect(codexModels(home)).toEqual([
      {id: 'gpt-first', name: 'GPT First', group: 'Codex'},
      {id: 'gpt-second', name: 'GPT Second', group: 'Codex'},
    ])
  })

  it('falls back to the static codex models when the catalog is missing', () => {
    expect(codexModels(codexHome({}))).toEqual(fallback)
  })

  it('falls back to the static codex models when the catalog is not json', () => {
    expect(codexModels(codexHome({'models_cache.json': '{not json'}))).toEqual(fallback)
  })
})

describe('codexDefaultModel', () => {
  it('uses the model codex config names', () => {
    const home = codexHome({
      'models_cache.json': JSON.stringify(MODELS_CACHE),
      'config.toml': 'approval_policy = "never"\nmodel = "gpt-configured"\n\n[profiles.fast]\nmodel = "gpt-profile"\n',
    })
    expect(codexDefaultModel(home)).toBe('gpt-configured')
  })

  it('uses the top catalog model when codex config names none', () => {
    const home = codexHome({
      'models_cache.json': JSON.stringify(MODELS_CACHE),
      'config.toml': 'approval_policy = "never"\n',
    })
    expect(codexDefaultModel(home)).toBe('gpt-first')
  })
})
