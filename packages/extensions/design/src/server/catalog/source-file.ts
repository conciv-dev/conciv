import {createRequire} from 'node:module'
import {dirname, isAbsolute, relative, resolve} from 'node:path'
import {designConfig} from '../../shared/tolerances.js'

export function sameFile(input: {walked: string; source: string; cwd: string}): boolean {
  return input.walked === projectPath({cwd: input.cwd, file: stampedFile(input)})
}

const PACKAGE_DIR = dirname(createRequire(import.meta.url).resolve('@conciv/extension-design/package.json'))

const STAMP_ROOT = resolve(PACKAGE_DIR, designConfig.stampRoot)

function stampedFile(input: {source: string; cwd: string}): string {
  const {source, cwd} = input
  if (isAbsolute(source)) return source
  const own = resolve(STAMP_ROOT, source)
  return inside({dir: PACKAGE_DIR, file: own}) ? own : resolve(cwd, source)
}

function projectPath(input: {cwd: string; file: string}): string {
  return inside({dir: input.cwd, file: input.file}) ? relative(input.cwd, input.file) : input.file
}

function inside(input: {dir: string; file: string}): boolean {
  const path = relative(input.dir, input.file)
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}
