import {builtinModules} from 'node:module'
import {transformAsync} from '@babel/core'
import type {NodePath, PluginObj, types as BabelTypes} from '@babel/core'

const nodeBuiltins = new Set(builtinModules)

function isNodeBuiltin(source: string): boolean {
  return source.startsWith('node:') || nodeBuiltins.has(source)
}

function localName(specifier: BabelTypes.ImportDeclaration['specifiers'][number]): string {
  return specifier.local.name
}

function stripServerHalfPlugin({types}: {types: typeof BabelTypes}): PluginObj {
  return {
    name: 'mandarax-strip-server-half',
    visitor: {
      CallExpression(path: NodePath<BabelTypes.CallExpression>) {
        const callee = path.node.callee
        if (!types.isMemberExpression(callee)) return
        const property = callee.property
        if (!types.isIdentifier(property) || property.name !== 'server') return
        if (path.node.arguments.length === 0) return
        path.node.arguments = [types.identifier('undefined')]
      },
      Program: {
        exit(path: NodePath<BabelTypes.Program>) {
          path.scope.crawl()
          for (const declaration of path.get('body')) {
            if (!declaration.isImportDeclaration()) continue
            const source = declaration.node.source.value
            const specifiers = declaration.get('specifiers')
            if (specifiers.length === 0) {
              if (isNodeBuiltin(source)) {
                throw declaration.buildCodeFrameError(
                  `node-only import "${source}" survives in the client view; import it inside .server() instead`,
                )
              }
              continue
            }
            for (const specifier of specifiers) {
              const binding = declaration.scope.getBinding(localName(specifier.node))
              if (binding && !binding.referenced) specifier.remove()
            }
            if (declaration.node.specifiers.length === 0) {
              declaration.remove()
              continue
            }
            if (isNodeBuiltin(source)) {
              throw declaration.buildCodeFrameError(
                `node-only import "${source}" survives in the client view; import it inside .server() instead`,
              )
            }
          }
        },
      },
    },
  }
}

export async function stripServerHalf(code: string, filename: string): Promise<{code: string; map: string | null}> {
  const result = await transformAsync(code, {
    filename,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    parserOpts: {plugins: ['typescript', 'jsx']},
    plugins: [stripServerHalfPlugin],
  })
  if (result?.code == null) throw new Error(`stripServerHalf produced no output for ${filename}`)
  return {code: result.code, map: result.map ? JSON.stringify(result.map) : null}
}
