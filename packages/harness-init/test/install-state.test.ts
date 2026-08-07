import {cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import type {HarnessConnectFile} from '@conciv/protocol/harness-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {claudeConnectServesProject, claudePluginCacheDir} from '../src/claude/install-state.js'
import {CLAUDE_CONNECT_INSTALL_TARGET, claudeConnectDir, claudeConnectPluginFiles} from '../src/claude/plugin-files.js'

type Project = {root: string; stateDir: string}

type InstallRecord = {scope: string; installPath: string; projectPath: string}

const scratch: string[] = []

function makeDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `conciv-${name}-`))
  scratch.push(dir)
  return dir
}

function makeProject(name: string): Project {
  const root = makeDir(name)
  return {root, stateDir: concivStateDir(root)}
}

function filesOf(project: Project): HarnessConnectFile[] {
  return claudeConnectPluginFiles({stateDir: project.stateDir})
}

function writeTree(project: Project): void {
  for (const file of filesOf(project)) {
    mkdirSync(dirname(file.path), {recursive: true})
    writeFileSync(file.path, file.contents)
  }
}

function pluginsDir(configDir: string): string {
  return join(configDir, 'plugins')
}

function recordsOf(configDir: string, records: InstallRecord[]): void {
  writeFileSync(
    join(pluginsDir(configDir), 'installed_plugins.json'),
    JSON.stringify({version: 2, plugins: {[CLAUDE_CONNECT_INSTALL_TARGET]: records}}),
  )
}

function claudeInstalls(configDir: string, project: Project, previous: InstallRecord[]): InstallRecord[] {
  writeTree(project)
  const marketplaceRoot = claudeConnectDir(project.stateDir)
  const cache = claudePluginCacheDir(configDir)
  rmSync(cache, {recursive: true, force: true})
  mkdirSync(dirname(cache), {recursive: true})
  cpSync(join(marketplaceRoot, 'conciv-connect'), cache, {recursive: true})
  mkdirSync(pluginsDir(configDir), {recursive: true})
  writeFileSync(
    join(pluginsDir(configDir), 'known_marketplaces.json'),
    JSON.stringify({conciv: {source: {source: 'directory', path: marketplaceRoot}, installLocation: marketplaceRoot}}),
  )
  const records = [...previous, {scope: 'local', installPath: cache, projectPath: project.root}]
  recordsOf(configDir, records)
  return records
}

function serves(configDir: string, project: Project): boolean {
  return claudeConnectServesProject({
    configDir,
    stateDir: project.stateDir,
    root: project.root,
    files: filesOf(project),
  })
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, {recursive: true, force: true})
})

describe('claude connect install state across projects', () => {
  it('keeps serving the first project after a second project installs over the shared cache', () => {
    const configDir = makeDir('claude-config')
    const first = makeProject('first')
    const second = makeProject('second')

    const afterFirst = claudeInstalls(configDir, first, [])
    expect(serves(configDir, first)).toBe(true)

    claudeInstalls(configDir, second, afterFirst)

    expect(serves(configDir, second)).toBe(true)
    expect(serves(configDir, first)).toBe(true)
  })

  it('does not serve a project claude has no local install record for', () => {
    const configDir = makeDir('claude-config')
    const first = makeProject('first')
    const second = makeProject('second')
    claudeInstalls(configDir, first, [])
    writeTree(second)

    expect(serves(configDir, second)).toBe(false)
  })

  it('stops serving once the registered marketplace no longer holds the plugin', () => {
    const configDir = makeDir('claude-config')
    const first = makeProject('first')
    const second = makeProject('second')
    const afterFirst = claudeInstalls(configDir, first, [])
    claudeInstalls(configDir, second, afterFirst)
    rmSync(claudeConnectDir(second.stateDir), {recursive: true, force: true})

    expect(serves(configDir, first)).toBe(false)
  })
})
