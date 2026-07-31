import {randomUUID} from 'node:crypto'
import {chmodSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {readdir, rm, stat} from 'node:fs/promises'
import {platform} from 'node:os'
import {dirname, isAbsolute, join, resolve} from 'node:path'
import type {HarnessConnectFile, HarnessConnectPlan, TerminalOpener} from '@conciv/protocol/harness-types'
import {logError} from '../lib/debug.js'

const DEFAULT_FILE_MODE = 0o600

const LAUNCH_DIR = 'launch'

const LAUNCH_SCRIPT_MODE = 0o700

const LAUNCH_SCRIPT_MAX_AGE_MS = 60 * 60 * 1000

const LAUNCH_SCRIPT_LIFETIME_MS = 5_000

export type ConnectExecOptions = {
  cwd: string
  stateDir: string
  open: boolean
  openTerminal: TerminalOpener
  platform?: () => NodeJS.Platform
}

export type ConnectExecResult = {opened: boolean; command: string}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function envPrefix(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${shellQuote(value)} `)
    .join('')
}

export function renderConnectCommand(plan: HarnessConnectPlan, cwd: string): string {
  return `cd ${shellQuote(cwd)} && ${envPrefix(plan.env)}${plan.argv.map(shellQuote).join(' ')}`
}

function cmdQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function cmdLiteral(value: string): string {
  return value.replaceAll('%', '%%')
}

export function renderCmdCommand(plan: HarnessConnectPlan, cwd: string): string {
  const sets = Object.entries(plan.env)
    .map(([key, value]) => `set ${cmdQuote(`${key}=${value}`)} && `)
    .join('')
  return `cd /d ${cmdQuote(cwd)} && ${sets}${plan.argv.map(cmdQuote).join(' ')}`
}

export function renderCmdScript(plan: HarnessConnectPlan, cwd: string): string {
  const sets = Object.entries(plan.env).map(([key, value]) => `set "${key}=${cmdLiteral(value)}"`)
  const argv = plan.argv.map((value) => cmdLiteral(cmdQuote(value))).join(' ')
  return ['@echo off', ...sets, `cd /d ${cmdLiteral(cmdQuote(cwd))}`, argv, ''].join('\r\n')
}

export function renderBashScript(plan: HarnessConnectPlan, cwd: string): string {
  return ['#!/bin/bash', renderConnectCommand(plan, cwd), 'exec $SHELL', ''].join('\n')
}

function launchDir(stateDir: string): string {
  return join(stateDir, LAUNCH_DIR)
}

function writeScript(stateDir: string, contents: string, extension: string): string {
  const dir = launchDir(stateDir)
  mkdirSync(dir, {recursive: true, mode: LAUNCH_SCRIPT_MODE})
  const file = join(dir, `conciv-launch-${randomUUID()}.${extension}`)
  writeFileSync(file, contents, {mode: LAUNCH_SCRIPT_MODE})
  return file
}

function forgetScript(file: string): void {
  const drop = (): void => {
    try {
      rmSync(file, {force: true})
    } catch (error) {
      logError(`[core] could not remove launch script ${file}: ${String(error)}`)
    }
  }
  setTimeout(drop, LAUNCH_SCRIPT_LIFETIME_MS).unref()
}

export async function sweepLaunchScripts(stateDir: string, now: number): Promise<void> {
  const root = launchDir(stateDir)
  const entries = await readdir(root, {withFileTypes: true}).catch(() => [])
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const path = join(root, entry.name)
    const info = await stat(path).catch(() => null)
    if (!info || now - info.mtimeMs < LAUNCH_SCRIPT_MAX_AGE_MS) continue
    await rm(path, {force: true}).catch(() => {})
  }
}

function planFilePath(file: HarnessConnectFile, stateDir: string): string {
  return isAbsolute(file.path) ? file.path : resolve(stateDir, file.path)
}

function writePlanFiles(plan: HarnessConnectPlan, stateDir: string): void {
  for (const file of plan.files) {
    const path = planFilePath(file, stateDir)
    const mode = file.mode ?? DEFAULT_FILE_MODE
    mkdirSync(dirname(path), {recursive: true})
    writeFileSync(path, file.contents, {mode})
    chmodSync(path, mode)
  }
}

function macTerminalApp(termProgram: string | undefined): string | null {
  switch (termProgram) {
    case 'iTerm.app':
      return 'iTerm'
    case 'Apple_Terminal':
      return 'Terminal'
    case 'WarpTerminal':
      return 'Warp'
    case 'WezTerm':
      return 'WezTerm'
    case 'ghostty':
      return 'Ghostty'
    case 'Hyper':
      return 'Hyper'
    case 'kitty':
      return 'kitty'
    default:
      return null
  }
}

async function openWindows(plan: HarnessConnectPlan, opts: ConnectExecOptions): Promise<ConnectExecResult> {
  const command = renderCmdCommand(plan, opts.cwd)
  if (!opts.open) return {opened: false, command}
  const script = writeScript(opts.stateDir, renderCmdScript(plan, opts.cwd), 'cmd')
  const opened = await opts.openTerminal({bin: 'cmd', args: ['/c', 'start', 'cmd', '/k', script]})
  forgetScript(script)
  return {opened, command}
}

async function openMac(plan: HarnessConnectPlan, opts: ConnectExecOptions): Promise<boolean> {
  const script = writeScript(opts.stateDir, renderBashScript(plan, opts.cwd), 'command')
  const terminalApp = macTerminalApp(process.env.TERM_PROGRAM)
  const opened = await opts.openTerminal({bin: 'open', args: terminalApp ? ['-a', terminalApp, script] : [script]})
  forgetScript(script)
  return opened
}

async function openPosix(plan: HarnessConnectPlan, opts: ConnectExecOptions, os: NodeJS.Platform): Promise<boolean> {
  if (os === 'darwin') return openMac(plan, opts)
  if (os !== 'linux') return false
  const command = renderConnectCommand(plan, opts.cwd)
  return opts.openTerminal({bin: 'x-terminal-emulator', args: ['-e', 'bash', '-lc', `${command}; exec bash`]})
}

export async function executeConnectPlan(
  plan: HarnessConnectPlan,
  opts: ConnectExecOptions,
): Promise<ConnectExecResult> {
  writePlanFiles(plan, opts.stateDir)
  const os = (opts.platform ?? platform)()
  if (os === 'win32') return openWindows(plan, opts)
  const command = renderConnectCommand(plan, opts.cwd)
  if (!opts.open) return {opened: false, command}
  return {opened: await openPosix(plan, opts, os), command}
}
