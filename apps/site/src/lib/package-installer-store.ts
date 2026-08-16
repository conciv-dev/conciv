import {useSyncExternalStore} from 'react'
import type {PackageCommand} from '@/components/ui/package-installer-tabs'

export type PackageInstaller = 'npm' | 'pnpm' | 'bun' | 'yarn'

export type InstallCommand = PackageCommand & {id: PackageInstaller}

const NPM_INSTALL: InstallCommand = {id: 'npm', label: 'npm', icon: '/icons/npm.svg', command: 'npm i -D @conciv/it'}

export const INSTALL_COMMANDS: InstallCommand[] = [
  NPM_INSTALL,
  {id: 'pnpm', label: 'pnpm', icon: '/icons/pnpm.svg', command: 'pnpm add -D @conciv/it'},
  {id: 'bun', label: 'bun', icon: '/icons/bun.svg', command: 'bun add -d @conciv/it'},
  {id: 'yarn', label: 'yarn', icon: '/icons/yarn.svg', command: 'yarn add -D @conciv/it'},
]

const STORAGE_KEY = 'conciv.pm'
const DEFAULT_INSTALLER: PackageInstaller = 'npm'

const listeners = new Set<() => void>()
let current: PackageInstaller | null = null

function isPackageInstaller(value: string | null): value is PackageInstaller {
  return INSTALL_COMMANDS.some((entry) => entry.id === value)
}

function readStored(): PackageInstaller {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isPackageInstaller(stored) ? stored : DEFAULT_INSTALLER
}

function getSnapshot(): PackageInstaller {
  if (current === null) current = readStored()
  return current
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

export function selectPackageInstaller(value: string): void {
  if (!isPackageInstaller(value)) return
  current = value
  window.localStorage.setItem(STORAGE_KEY, value)
  for (const listener of listeners) listener()
}

export function usePackageInstaller(): PackageInstaller {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_INSTALLER)
}

export function installCommandFor(installer: PackageInstaller): InstallCommand {
  return INSTALL_COMMANDS.find((entry) => entry.id === installer) ?? NPM_INSTALL
}
