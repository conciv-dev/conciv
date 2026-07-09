import {chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
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

export async function ensureTrailBinary(opts: {cacheDir: string; version?: string}): Promise<string> {
  const version = opts.version ?? TRAILBASE_VERSION
  const dir = join(opts.cacheDir, version)
  const binaryName = process.platform === 'win32' ? 'trail.exe' : 'trail'
  const executable = join(dir, binaryName)
  if (existsSync(executable)) return executable
  const staging = `${dir}.staging-${process.pid}`
  mkdirSync(staging, {recursive: true})
  const asset = assetName(version)
  const url = `https://github.com/trailbaseio/trailbase/releases/download/${version}/${asset}`
  const response = await fetch(url)
  if (!response.ok) {
    throw stateError('download-failed', `trailbase download failed: ${response.status}`, {status: response.status, url})
  }
  const zipPath = join(staging, asset)
  writeFileSync(zipPath, new Uint8Array(await response.arrayBuffer()))
  const unzip = spawnSync('unzip', ['-o', '-q', zipPath, '-d', staging])
  if (unzip.status !== 0) {
    const tar = spawnSync('tar', ['-xf', zipPath, '-C', staging])
    if (tar.status !== 0) {
      throw stateError('unpack-failed', 'trailbase: could not unpack (need unzip or bsdtar)', {
        unzip: String(unzip.stderr ?? ''),
        tar: String(tar.stderr ?? ''),
        zipPath,
      })
    }
  }
  rmSync(zipPath)
  chmodSync(join(staging, binaryName), 0o755)
  try {
    renameSync(staging, dir)
  } catch {
    rmSync(staging, {recursive: true, force: true})
    if (!existsSync(executable)) {
      throw stateError('install-raced', 'trailbase: install race lost and binary still missing', {executable})
    }
  }
  return executable
}
