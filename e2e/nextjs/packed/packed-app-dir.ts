import {tmpdir} from 'node:os'
import {join} from 'node:path'

export const PACKED_ROOT = join(tmpdir(), 'conciv-e2e-nextjs-packed')
export const BUNDLERS = ['turbopack', 'webpack'] as const
export type Bundler = (typeof BUNDLERS)[number]

export function packedAppDir(bundler: Bundler): string {
  return join(PACKED_ROOT, 'packages', bundler)
}
