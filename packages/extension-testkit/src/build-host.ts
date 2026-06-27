import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build, type Plugin} from 'vite'
import solid from 'vite-plugin-solid'
import {mandaraxBuildPlugin, NO_BUILTINS} from '@mandarax/plugin'

const VIRTUAL_ID = 'virtual:mandarax-extension-under-test'
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`
const hostDir = fileURLToPath(new URL('./host', import.meta.url))

function extensionUnderTestPlugin(clientEntry: string): Plugin {
  return {
    name: 'mandarax-testkit-extension-under-test',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null),
    load: (id) => (id === RESOLVED_VIRTUAL_ID ? `export {default} from ${JSON.stringify(clientEntry)}` : null),
  }
}

export async function buildHost(clientEntry: string): Promise<string> {
  const outDir = await mkdtemp(join(tmpdir(), 'mandarax-testkit-host-'))
  await build({
    root: hostDir,
    configFile: false,
    logLevel: 'silent',
    plugins: [mandaraxBuildPlugin(NO_BUILTINS), extensionUnderTestPlugin(clientEntry), solid()],
    build: {outDir, emptyOutDir: true, rollupOptions: {input: join(hostDir, 'index.html')}},
  })
  return outDir
}
