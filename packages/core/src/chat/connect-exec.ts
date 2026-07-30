import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {chmodSync, mkdirSync, writeFileSync} from 'node:fs'
import {platform, tmpdir} from 'node:os'
import {dirname, isAbsolute, join, resolve} from 'node:path'
import type {HarnessConnectFile, HarnessConnectPlan} from '@conciv/protocol/harness-types'

const DEFAULT_FILE_MODE = 0o600

export type ConnectExecOptions = {cwd: string; stateDir: string; open: boolean}

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

function renderCmdScript(plan: HarnessConnectPlan, cwd: string): string {
  const sets = Object.entries(plan.env).map(([key, value]) => `set "${key}=${value}"`)
  return ['@echo off', ...sets, `cd /d ${cmdQuote(cwd)}`, plan.argv.map(cmdQuote).join(' '), ''].join('\r\n')
}

function renderBashScript(plan: HarnessConnectPlan, cwd: string): string {
  const exports = Object.entries(plan.env).map(([key, value]) => `export ${key}=${shellQuote(value)}`)
  return ['#!/bin/bash', ...exports, renderConnectCommand(plan, cwd), 'exec $SHELL', ''].join('\n')
}

function writeScript(contents: string, extension: string, mode: number): string {
  const file = join(tmpdir(), `conciv-launch-${randomUUID()}.${extension}`)
  writeFileSync(file, contents)
  chmodSync(file, mode)
  return file
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

function spawnDetached(bin: string, args: string[]): Promise<boolean> {
  return new Promise((settle) => {
    const child = spawn(bin, args, {detached: true, stdio: 'ignore'})
    child.once('spawn', () => {
      child.unref()
      settle(true)
    })
    child.once('error', () => settle(false))
  })
}

async function openWindows(plan: HarnessConnectPlan, cwd: string, open: boolean): Promise<ConnectExecResult> {
  const script = writeScript(renderCmdScript(plan, cwd), 'cmd', 0o700)
  const command = `cmd /c ${cmdQuote(script)}`
  if (!open) return {opened: false, command}
  return {opened: await spawnDetached('cmd', ['/c', 'start', 'cmd', '/k', script]), command}
}

async function openPosix(plan: HarnessConnectPlan, cwd: string): Promise<boolean> {
  const command = renderConnectCommand(plan, cwd)
  if (platform() === 'darwin') {
    const script = writeScript(renderBashScript(plan, cwd), 'command', 0o755)
    const terminalApp = macTerminalApp(process.env.TERM_PROGRAM)
    return spawnDetached('open', terminalApp ? ['-a', terminalApp, script] : [script])
  }
  if (platform() === 'linux') {
    return spawnDetached('x-terminal-emulator', ['-e', 'bash', '-lc', `${command}; exec bash`])
  }
  return false
}

export async function executeConnectPlan(
  plan: HarnessConnectPlan,
  opts: ConnectExecOptions,
): Promise<ConnectExecResult> {
  writePlanFiles(plan, opts.stateDir)
  if (platform() === 'win32') return openWindows(plan, opts.cwd, opts.open)
  const command = renderConnectCommand(plan, opts.cwd)
  if (!opts.open) return {opened: false, command}
  return {opened: await openPosix(plan, opts.cwd), command}
}
