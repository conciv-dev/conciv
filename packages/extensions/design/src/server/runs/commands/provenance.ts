import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {execa} from 'execa'
import {z} from 'zod'
import {projectKey} from '../../catalog/project-key.js'
import {projectFingerprint} from '../../catalog/fingerprint.js'

export async function provenanceOf(input: {cwd: string; extensionDir: string}) {
  const {cwd, extensionDir} = input
  const [project_key, own, branch, head, tracked, tools_head, pkg, tools_fingerprint] = await Promise.all([
    projectKey({cwd}),
    gitOut({cwd, args: ['ls-files', '--error-unmatch', PACKAGE_JSON]}),
    gitOut({cwd, args: ['rev-parse', '--abbrev-ref', 'HEAD']}),
    gitOut({cwd, args: ['rev-parse', 'HEAD']}),
    gitOut({cwd: extensionDir, args: ['ls-files', '--error-unmatch', PACKAGE_JSON]}),
    gitOut({cwd: extensionDir, args: ['rev-parse', 'HEAD']}),
    readFile(join(extensionDir, PACKAGE_JSON), 'utf8'),
    projectFingerprint({cwd: extensionDir, modules: []}),
  ])
  return {
    project_key,
    branch: own === null ? null : branch,
    head: own === null ? null : head,
    tools_head: tracked === null ? null : tools_head,
    tools_version: VersionSchema.parse(JSON.parse(pkg)).version,
    tools_fingerprint,
  }
}

const PACKAGE_JSON = 'package.json'

const VersionSchema = z.object({version: z.string().nullable().catch(null)})

async function gitOut(input: {cwd: string; args: string[]}): Promise<string | null> {
  const result = await execa('git', input.args, {cwd: input.cwd, reject: false})
  return result.failed ? null : result.stdout
}
