import {createHash} from 'node:crypto'
import {join, resolve} from 'node:path'
import {execa} from 'execa'
import {createStorage, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

export async function projectFingerprint(input: {cwd: string; modules: string[]}): Promise<string> {
  const {cwd, modules} = input
  const disk = createStorage({driver: fsDriver({base: DISK_ROOT, readOnly: true})})
  const tree = await execa('git', ['rev-parse', 'HEAD^{tree}'], {cwd, reject: false})
  if (tree.failed) return hashed(await stamped({disk, files: modules.map((module) => resolve(cwd, module))}))
  const [top, status] = await Promise.all([
    execa('git', ['rev-parse', '--show-toplevel'], {cwd, reject: false}),
    execa('git', ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all'], {cwd, reject: false}),
  ])
  const dirty = status.stdout
    .split(NUL)
    .filter((entry) => entry !== '')
    .map((entry) => join(top.stdout, entry.slice(STATUS_WIDTH)))
  return hashed([tree.stdout, ...(await stamped({disk, files: dirty}))])
}

const DISK_ROOT = '/'
const NUL = '\0'
const STATUS_WIDTH = 3
const GONE = 'gone'

async function stamped(input: {disk: Storage; files: string[]}): Promise<string[]> {
  const stamps = await Promise.all(
    input.files.map(async (file) => `${file}\t${(await input.disk.getMeta(file)).mtime?.valueOf() ?? GONE}`),
  )
  return stamps.toSorted()
}

function hashed(lines: string[]): string {
  return createHash('sha256').update(lines.join('\n')).digest('hex')
}
