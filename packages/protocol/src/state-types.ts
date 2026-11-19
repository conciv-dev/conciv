import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

export const CONCIV_STATE_DIR = '.conciv'

export function concivStateDir(root: string): string {
  return join(root, CONCIV_STATE_DIR)
}

const CONCIV_STATE_GITIGNORE = ['*', '!.gitignore', '!settings/', '!settings/**', ''].join('\n')

export function createConcivStateDir(stateDir: string): string {
  mkdirSync(stateDir, {recursive: true})
  const ignoreFile = join(stateDir, '.gitignore')
  if (existsSync(ignoreFile)) return stateDir
  try {
    writeFileSync(ignoreFile, CONCIV_STATE_GITIGNORE, {flag: 'wx'})
  } catch (error) {
    console.error('conciv: could not write', ignoreFile, error)
  }
  return stateDir
}
