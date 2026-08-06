import {readFileSync} from 'node:fs'
import {join, relative} from 'node:path'
import {z} from 'zod'
import type {HarnessConnectFile} from '@conciv/protocol/harness-types'
import {parseJsonOrNull} from './json.js'
import {CLAUDE_CONNECT_MARKETPLACE, CLAUDE_CONNECT_PLUGIN} from './names.js'
import {inside, sameCwd} from './paths.js'
import {claudeConnectDir, CLAUDE_CONNECT_INSTALL_TARGET, CLAUDE_CONNECT_PLUGIN_VERSION} from './plugin-files.js'

const InstalledPluginsSchema = z.object({
  plugins: z.record(
    z.string(),
    z.array(z.object({scope: z.string(), installPath: z.string(), projectPath: z.string().optional()})),
  ),
})

const KnownMarketplacesSchema = z.record(z.string(), z.unknown())
const MarketplaceEntrySchema = z.object({installLocation: z.string()})

export type ClaudeInstallRecord = z.infer<typeof InstalledPluginsSchema>['plugins'][string][number]

export type ClaudeConnectInstallState = {
  configDir: string
  stateDir: string
  root: string
  files: HarnessConnectFile[]
}

export function claudeConfigDir(opts: {home: string; override: string | undefined}): string {
  const override = opts.override
  if (override !== undefined && override.length > 0) return override
  return join(opts.home, '.claude')
}

export function claudePluginCacheDir(configDir: string): string {
  return join(
    configDir,
    'plugins',
    'cache',
    CLAUDE_CONNECT_MARKETPLACE,
    CLAUDE_CONNECT_PLUGIN,
    CLAUDE_CONNECT_PLUGIN_VERSION,
  )
}

export function claudeInstallRecords(configDir: string): ClaudeInstallRecord[] {
  const parsed = InstalledPluginsSchema.safeParse(readJsonFile(join(configDir, 'plugins', 'installed_plugins.json')))
  if (!parsed.success) return []
  return parsed.data.plugins[CLAUDE_CONNECT_INSTALL_TARGET] ?? []
}

export function claudeConnectServesProject(state: ClaudeConnectInstallState): boolean {
  return marketplaceRegistered(state) && installRecorded(state) && cachedCopyMatches(state)
}

function readTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function readJsonFile(path: string): unknown {
  const raw = readTextOrNull(path)
  return raw === null ? null : parseJsonOrNull(raw)
}

function recordCoversProject(record: ClaudeInstallRecord, state: ClaudeConnectInstallState): boolean {
  if (record.scope !== 'local') return false
  if (record.projectPath === undefined) return false
  return sameCwd(record.projectPath, state.root) && sameCwd(record.installPath, claudePluginCacheDir(state.configDir))
}

function installRecorded(state: ClaudeConnectInstallState): boolean {
  return claudeInstallRecords(state.configDir).some((record) => recordCoversProject(record, state))
}

function marketplaceRegistered(state: ClaudeConnectInstallState): boolean {
  const listed = KnownMarketplacesSchema.safeParse(
    readJsonFile(join(state.configDir, 'plugins', 'known_marketplaces.json')),
  )
  if (!listed.success) return false
  const entry = MarketplaceEntrySchema.safeParse(listed.data[CLAUDE_CONNECT_MARKETPLACE])
  if (!entry.success) return false
  return copyMatches(state, claudeConnectDir(state.stateDir), entry.data.installLocation)
}

function cachedCopyMatches(state: ClaudeConnectInstallState): boolean {
  const pluginRoot = join(claudeConnectDir(state.stateDir), CLAUDE_CONNECT_PLUGIN)
  return copyMatches(state, pluginRoot, claudePluginCacheDir(state.configDir))
}

function copyMatches(state: ClaudeConnectInstallState, sourceRoot: string, copyRoot: string): boolean {
  const owned = state.files.filter((file) => inside(sourceRoot, file.path))
  if (owned.length === 0) return false
  return owned.every((file) => readTextOrNull(join(copyRoot, relative(sourceRoot, file.path))) === file.contents)
}
