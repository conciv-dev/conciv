import {transformAsync} from '@babel/core'
import solid from 'babel-preset-solid'
import typescript from '@babel/preset-typescript'

// Extension files live in the consumer's repo and are compiled by the consumer's bundler — which may
// be a React app. Their tool renderers / UI factories are Solid, so the mandarax plugin owns a "Solid
// zone": it compiles mandarax/extensions/*.{tsx,jsx} with babel-preset-solid (matching the widget's
// compiler) at enforce:'pre', so the host's React transform afterward sees JSX-free Solid output.

const EXTENSION_MODULE_RE = /[\\/]mandarax[\\/]extensions[\\/][^?]*\.(?:ts|tsx|js|jsx)(?:\?|$)/

export function isExtensionModule(id: string): boolean {
  return EXTENSION_MODULE_RE.test(id)
}

// Compile one extension JSX file to Solid. generate:'ssr' for the server load (the .server() half
// runs in node), 'dom' for the browser bundle (the .render()/ui factories paint in the widget).
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
