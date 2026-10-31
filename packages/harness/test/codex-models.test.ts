import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'
import {codexModels as CODEX_MODELS} from '@conciv/ai/server'
import {describe, expect, it} from 'vitest'
import {codexDefaultModel, codexHome, codexModels} from '../src/codex/models.js'

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

const codexDir = (files: Record<string, string>): string => {
  const dir = join(mkdtempSync(join(tmpdir(), 'codex-models-')), '.codex')
  mkdirSync(dir)
  Object.entries(files).forEach(([name, content]) => writeFileSync(join(dir, name), content))
  return dir
}

describe('codexModels', () => {
  it('lists the listed models from codex catalog in priority order', () => {
    const dir = codexDir({'models_cache.json': JSON.stringify(MODELS_CACHE)})
    expect(codexModels(dir)).toEqual([
      {id: 'gpt-first', name: 'GPT First', group: 'Codex'},
      {id: 'gpt-second', name: 'GPT Second', group: 'Codex'},
    ])
  })

  it('falls back to the static codex models when the catalog is missing', () => {
    expect(codexModels(codexDir({}))).toEqual(fallback)
  })

  it('falls back to the static codex models when the catalog is not json', () => {
    expect(codexModels(codexDir({'models_cache.json': '{not json'}))).toEqual(fallback)
  })
})

describe('codexDefaultModel', () => {
  it('uses the model codex config names', () => {
    const dir = codexDir({
      'models_cache.json': JSON.stringify(MODELS_CACHE),
      'config.toml': 'approval_policy = "never"\nmodel = "gpt-configured"\n\n[profiles.fast]\nmodel = "gpt-profile"\n',
    })
    expect(codexDefaultModel(dir)).toBe('gpt-configured')
  })

  it('uses the top catalog model when codex config names none', () => {
    const dir = codexDir({
      'models_cache.json': JSON.stringify(MODELS_CACHE),
      'config.toml': 'approval_policy = "never"\n',
    })
    expect(codexDefaultModel(dir)).toBe('gpt-first')
  })

  it('ignores a model set only under a profile table', () => {
    const dir = codexDir({
      'models_cache.json': JSON.stringify(MODELS_CACHE),
      'config.toml': 'approval_policy = "never"\n\n[profiles.fast]\nmodel = "gpt-profile"\n',
    })
    expect(codexDefaultModel(dir)).toBe('gpt-first')
  })
})

describe('codexHome', () => {
  it('uses CODEX_HOME when set', () => {
    expect(codexHome({CODEX_HOME: '/custom'})).toBe('/custom')
  })

  it('defaults to ~/.codex', () => {
    expect(codexHome({})).toBe(join(homedir(), '.codex'))
  })
})
