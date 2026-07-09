import {createWriteStream} from 'node:fs'
import {chmod, mkdir, rename, rm, stat} from 'node:fs/promises'
import {join} from 'node:path'
import {pipeline} from 'node:stream/promises'
import extract from 'extract-zip'
import {decorateError} from '@conciv/errors'
import {stateError} from '../errors.js'

export const TRAILBASE_VERSION = 'v0.30.0'

const ASSETS: Record<string, string> = {
  'darwin-arm64': 'arm64_apple_darwin',
  'darwin-x64': 'x86_64_apple_darwin',
  'linux-arm64': 'arm64_linux',
  'linux-x64': 'x86_64_linux',
  'win32-x64': 'x86_64_windows',
}

function assetName(version: string): string {
  const key = `${process.platform}-${process.arch}`
  const asset = ASSETS[key]
  if (!asset) throw stateError('unsupported-platform', `trailbase has no ${key} build`, {platform: key, version})
  return `trailbase_${version}_${asset}.zip`
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}

async function download(url: string, to: string): Promise<void> {
  const response = await fetch(url).catch((error: Error) => {
    throw decorateError({error, code: 'download-failed', userCode: 'state.download-failed', details: {url}})
  })
  if (!response.ok || !response.body) {
    throw stateError('download-failed', `trailbase download failed: ${response.status}`, {status: response.status, url})
  }
  await pipeline(response.body, createWriteStream(to))
}

async function promote(staging: string, dir: string, executable: string): Promise<void> {
  const won = await rename(staging, dir).then(
    () => true,
    () => false,
  )
  if (won) return
  await rm(staging, {recursive: true, force: true})
  if (!(await pathExists(executable))) {
    throw stateError('install-raced', 'trailbase: install race lost and binary still missing', {executable})
  }
}

export async function ensureTrailBinary(opts: {cacheDir: string; version?: string}): Promise<string> {
  const version = opts.version ?? TRAILBASE_VERSION
  const dir = join(opts.cacheDir, version)
  const binaryName = process.platform === 'win32' ? 'trail.exe' : 'trail'
  const executable = join(dir, binaryName)
  if (await pathExists(executable)) return executable
  const staging = `${dir}.staging-${process.pid}`
  await mkdir(staging, {recursive: true})
  try {
    const asset = assetName(version)
    const zipPath = join(staging, asset)
    await download(`https://github.com/trailbaseio/trailbase/releases/download/${version}/${asset}`, zipPath)
    await extract(zipPath, {dir: staging}).catch((error: Error) => {
      throw decorateError({error, code: 'unpack-failed', userCode: 'state.unpack-failed', details: {zipPath}})
    })
    await rm(zipPath)
    await chmod(join(staging, binaryName), 0o755)
  } catch (error) {
    await rm(staging, {recursive: true, force: true})
    throw error
  }
  await promote(staging, dir, executable)
  return executable
}
