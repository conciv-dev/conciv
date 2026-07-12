import {transformAsync} from '@babel/core'
import solid from 'babel-preset-solid'
import typescript from '@babel/preset-typescript'

const EXTENSION_MODULE_RE = /[\\/]conciv[\\/]extensions[\\/][^?]*\.(?:ts|tsx|js|jsx)(?:\?|$)/

export function isExtensionModule(id: string): boolean {
  return EXTENSION_MODULE_RE.test(id)
}

export async function compileExtensionSolid(
  code: string,
  id: string,
  ssr: boolean,
): Promise<{code: string; map: string | null} | null> {
  const filename = id.split('?')[0]
  const result = await transformAsync(code, {
    filename,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    presets: [
      [solid, {generate: ssr ? 'ssr' : 'dom'}],
      [typescript, {}],
    ],
  })
  return result?.code == null ? null : {code: result.code, map: result.map ? JSON.stringify(result.map) : null}
}
