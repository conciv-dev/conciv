import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {chmodSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {platform} from 'node:os'
import {dirname, isAbsolute, join, resolve} from 'node:path'
import type {HarnessConnectFile, HarnessConnectPlan, TerminalOpener} from '@conciv/protocol/harness-types'

const DEFAULT_FILE_MODE = 0o600
const LAUNCH_DIR = 'launch'
const LAUNCH_SCRIPT_MODE = 0o700
const LAUNCH_SCRIPT_LIFETIME_MS = 5_000

export type LaunchOptions = {
  cwd: string
  stateDir: string
  openTerminal?: TerminalOpener
  platform?: () => NodeJS.Platform
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function envPrefix(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${shellQuote(value)} `)
    .join('')
}

function renderShellCommand(plan: HarnessConnectPlan, cwd: string): string {
  return `cd ${shellQuote(cwd)} && ${envPrefix(plan.env)}${plan.argv.map(shellQuote).join(' ')}`
}

function cmdQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function cmdLiteral(value: string): string {
  return value.replaceAll('%', '%%')
}

function renderCmdCommand(plan: HarnessConnectPlan, cwd: string): string {
  const sets = Object.entries(plan.env)
    .map(([key, value]) => `set ${cmdQuote(`${key}=${value}`)} && `)
    .join('')
  return `cd /d ${cmdQuote(cwd)} && ${sets}${plan.argv.map(cmdQuote).join(' ')}`
}

function renderCmdScript(plan: HarnessConnectPlan, cwd: string): string {
  const sets = Object.entries(plan.env).map(([key, value]) => `set "${key}=${cmdLiteral(value)}"`)
  const argv = plan.argv.map((value) => cmdLiteral(cmdQuote(value))).join(' ')
  return ['@echo off', ...sets, `cd /d ${cmdLiteral(cmdQuote(cwd))}`, argv, ''].join('\r\n')
}

function renderBashScript(plan: HarnessConnectPlan, cwd: string): string {
  return ['#!/bin/bash', renderShellCommand(plan, cwd), 'exec $SHELL', ''].join('\n')
}

export function renderConnectCommand(plan: HarnessConnectPlan, cwd: string, os: NodeJS.Platform = platform()): string {
  if (os === 'win32') return renderCmdCommand(plan, cwd)
  return renderShellCommand(plan, cwd)
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
  const timer = setTimeout(() => {
    rmSync(file, {force: true})
  }, LAUNCH_SCRIPT_LIFETIME_MS)
  timer.unref?.()
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

const spawnTerminalOpener: TerminalOpener = ({bin, args}) =>
  new Promise((settle) => {
    const child = spawn(bin, args, {detached: true, stdio: 'ignore'})
    child.once('spawn', () => {
      child.unref()
      settle(true)
    })
    child.once('error', () => settle(false))
  })

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

function openMac(plan: HarnessConnectPlan, opts: LaunchOptions, openTerminal: TerminalOpener): Promise<boolean> {
  const script = writeScript(opts.stateDir, renderBashScript(plan, opts.cwd), 'command')
  const terminalApp = macTerminalApp(process.env.TERM_PROGRAM)
  const opened = openTerminal({bin: 'open', args: terminalApp ? ['-a', terminalApp, script] : [script]})
  forgetScript(script)
  return opened
}

function openWindows(plan: HarnessConnectPlan, opts: LaunchOptions, openTerminal: TerminalOpener): Promise<boolean> {
  const script = writeScript(opts.stateDir, renderCmdScript(plan, opts.cwd), 'cmd')
  const opened = openTerminal({bin: 'cmd', args: ['/c', 'start', 'cmd', '/k', script]})
  forgetScript(script)
  return opened
}

function openLinux(plan: HarnessConnectPlan, opts: LaunchOptions, openTerminal: TerminalOpener): Promise<boolean> {
  const command = renderShellCommand(plan, opts.cwd)
  return openTerminal({bin: 'x-terminal-emulator', args: ['-e', 'bash', '-lc', `${command}; exec bash`]})
}

export async function launchConnectPlan(plan: HarnessConnectPlan, opts: LaunchOptions): Promise<boolean> {
  writePlanFiles(plan, opts.stateDir)
  const os = (opts.platform ?? platform)()
  const openTerminal = opts.openTerminal ?? spawnTerminalOpener
  if (os === 'win32') return openWindows(plan, opts, openTerminal)
  if (os === 'darwin') return openMac(plan, opts, openTerminal)
  if (os === 'linux') return openLinux(plan, opts, openTerminal)
  return false
}
