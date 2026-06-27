import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build, type Plugin} from 'vite'
import solid from 'vite-plugin-solid'
import {addSourceToJsx} from '@mandarax/plugin/source-inject'

const VIRTUAL_ID = 'virtual:mandarax-extension-under-test'
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`
const hostDir = fileURLToPath(new URL('./host', import.meta.url))

function sourceInjectPlugin(root: string): Plugin {
  return {
    name: 'mandarax-testkit-source-inject',
    enforce: 'pre',
    transform(code, id) {
      const result = addSourceToJsx(code, id, root)
      return result ? {code: result.code, map: result.map} : null
    },
  }
}

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
    plugins: [sourceInjectPlugin(hostDir), extensionUnderTestPlugin(clientEntry), solid()],
    build: {outDir, emptyOutDir: true, rollupOptions: {input: join(hostDir, 'index.html')}},
  })
  return outDir
}
