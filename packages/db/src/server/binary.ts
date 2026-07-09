import {createHash} from 'node:crypto'
import {createWriteStream} from 'node:fs'
import {chmod, mkdir, readFile, rename, rm, stat} from 'node:fs/promises'
import {join} from 'node:path'
import {pipeline} from 'node:stream/promises'
import extract from 'extract-zip'
import {decorateError} from '@conciv/errors'
import {stateError} from '../errors.js'

export const TRAILBASE_VERSION = 'v0.30.0'

export const TRAILBASE_CHECKSUMS: Record<string, string> = {
  'trailbase_v0.30.0_arm64_apple_darwin.zip': '81272c2167330298e30ec66bb67dca4ca3df1625067e8d712d0a5aec558c1bc0',
  'trailbase_v0.30.0_arm64_linux.zip': 'f42adf9f7822d316dabd8b797464ec18590d5815b9e410dd2f0ebdad337ce01f',
  'trailbase_v0.30.0_x86_64_apple_darwin.zip': '6d7a7991cec1b17fb36f129535062709bd37bfe22640ed1711aad7211fc3b858',
  'trailbase_v0.30.0_x86_64_linux.zip': '5283831ff7a85161e75bd09fee9760958457903e8d9e6f09aeb7e069dce1dc54',
  'trailbase_v0.30.0_x86_64_windows.zip': 'c766138c52e1bfdb43d1ef2180f457292d3dda749918dcf8b12bf8980aa824e8',
}

export function assertAssetChecksum(
  asset: string,
  bytes: Uint8Array,
  checksums: Record<string, string> = TRAILBASE_CHECKSUMS,
): void {
  const expected = checksums[asset]
  if (!expected) {
    throw stateError('checksum-mismatch', `trailbase asset ${asset} has no pinned sha-256`, {asset})
  }
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expected) {
    throw stateError('checksum-mismatch', `trailbase asset ${asset} sha-256 mismatch`, {asset, expected, actual})
  }
}

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
    assertAssetChecksum(asset, await readFile(zipPath))
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
