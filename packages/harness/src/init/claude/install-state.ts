import {readFile} from 'node:fs/promises'
import {join, relative} from 'node:path'
import {z} from 'zod'
import type {HarnessConnectFile} from '@conciv/types/harness-types'
import {parseJsonOrNull} from '../json.js'
import {CLAUDE_CONNECT_MARKETPLACE, CLAUDE_CONNECT_PLUGIN} from './names.js'
import {inside, sameCwd} from '../paths.js'
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

export async function claudeInstallRecords(configDir: string): Promise<ClaudeInstallRecord[]> {
  const parsed = InstalledPluginsSchema.safeParse(
    await readJsonFile(join(configDir, 'plugins', 'installed_plugins.json')),
  )
  if (!parsed.success) return []
  return parsed.data.plugins[CLAUDE_CONNECT_INSTALL_TARGET] ?? []
}

export async function claudeConnectServesProject(state: ClaudeConnectInstallState): Promise<boolean> {
  const checks = await Promise.all([marketplaceRegistered(state), installRecorded(state), cachedCopyMatches(state)])
  return checks.every(Boolean)
}

function readTextOrNull(path: string): Promise<string | null> {
  return readFile(path, 'utf8').catch(() => null)
}

async function readJsonFile(path: string): Promise<unknown> {
  const raw = await readTextOrNull(path)
  return raw === null ? null : parseJsonOrNull(raw)
}

function recordCoversProject(record: ClaudeInstallRecord, state: ClaudeConnectInstallState): boolean {
  if (record.scope !== 'local') return false
  if (record.projectPath === undefined) return false
  return sameCwd(record.projectPath, state.root) && sameCwd(record.installPath, claudePluginCacheDir(state.configDir))
}

async function installRecorded(state: ClaudeConnectInstallState): Promise<boolean> {
  return (await claudeInstallRecords(state.configDir)).some((record) => recordCoversProject(record, state))
}

async function marketplaceRegistered(state: ClaudeConnectInstallState): Promise<boolean> {
  const listed = KnownMarketplacesSchema.safeParse(
    await readJsonFile(join(state.configDir, 'plugins', 'known_marketplaces.json')),
  )
  if (!listed.success) return false
  const entry = MarketplaceEntrySchema.safeParse(listed.data[CLAUDE_CONNECT_MARKETPLACE])
  if (!entry.success) return false
  return copyMatches(state, claudeConnectDir(state.stateDir), entry.data.installLocation)
}

function cachedCopyMatches(state: ClaudeConnectInstallState): Promise<boolean> {
  const pluginRoot = join(claudeConnectDir(state.stateDir), CLAUDE_CONNECT_PLUGIN)
  return copyMatches(state, pluginRoot, claudePluginCacheDir(state.configDir))
}

async function copyMatches(state: ClaudeConnectInstallState, sourceRoot: string, copyRoot: string): Promise<boolean> {
  const owned = state.files.filter((file) => inside(sourceRoot, file.path))
  if (owned.length === 0) return false
  const copies = await Promise.all(owned.map((file) => readTextOrNull(join(copyRoot, relative(sourceRoot, file.path)))))
  return copies.every((copy, index) => copy === owned[index]?.contents)
}
