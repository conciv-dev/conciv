import type {ConcivConfig} from '@conciv/protocol/config-types'

type BootModule = {bootConcivEngine: (options: ConcivConfig, root: string) => Promise<void>}

async function loadWorkspaceBootModule(bootUrl: string): Promise<BootModule> {
  try {
    return await import(bootUrl)
  } catch {
    const [{createRequire}, {fileURLToPath}] = await Promise.all([import('node:module'), import('node:url')])
    const bootFile = fileURLToPath(bootUrl)
    const loaded: BootModule = createRequire(bootFile)(bootFile)
    return loaded
  }
}

export async function registerNode(): Promise<void> {
  const options = JSON.parse(process.env.CONCIV_OPTIONS ?? '{}') as ConcivConfig
  if (options.enabled === false) return
  const workspaceUrl = process.env.CONCIV_BOOT_URL
  if (workspaceUrl === undefined) {
    const {makeEngineBooter} = await import('./boot.js')
    const {NO_BUILTINS} = await import('@conciv/extension-compiler/extensions')
    await makeEngineBooter(options, process.cwd(), NO_BUILTINS)()
    return
  }
  const boot = await loadWorkspaceBootModule(workspaceUrl)
  await boot.bootConcivEngine(options, process.cwd())
}
