import {execa} from 'execa'
import {createStorage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {z} from 'zod'

export async function projectKey(input: {cwd: string}): Promise<string> {
  const {cwd} = input
  const [remote, prefix, tracked] = await Promise.all([
    execa('git', ['remote', 'get-url', 'origin'], {cwd, reject: false}),
    execa('git', ['rev-parse', '--show-prefix'], {cwd, reject: false}),
    execa('git', ['ls-files', '--error-unmatch', PACKAGE_JSON], {cwd, reject: false}),
  ])
  if (!remote.failed && !prefix.failed && !tracked.failed) return `${remote.stdout}#${prefix.stdout}`
  const disk = createStorage({driver: fsDriver({base: cwd, readOnly: true})})
  return PackageSchema.parse(await disk.getItem(PACKAGE_JSON).catch(() => null)).name ?? cwd
}

const PACKAGE_JSON = 'package.json'

const PackageSchema = z.object({name: z.string().min(1).nullable().catch(null)}).catch({name: null})
