import {parseAsync, transformFromAstAsync, traverse, types as t} from '@babel/core'
import {deadCodeElimination, findReferencedIdentifiers} from 'babel-dead-code-elimination'

const CONTRACT_MARKER = 'defineExtension'

const STRIP_FOR: Record<SplitEnv, ReadonlySet<string>> = {
  browser: new Set(['server']),
  node: new Set(['client', 'render']),
}

export type SplitEnv = 'browser' | 'node'

export async function splitExtension(
  code: string,
  id: string,
  env: SplitEnv,
): Promise<{code: string; map: string | null} | null> {
  if (!code.includes(CONTRACT_MARKER)) return null
  const ast = await parseAsync(code, {
    filename: id,
    babelrc: false,
    configFile: false,
    parserOpts: {plugins: ['typescript', 'jsx']},
  })
  if (!ast) return null

  const referenced = findReferencedIdentifiers(ast)
  const strip = STRIP_FOR[env]
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee
      if (!t.isMemberExpression(callee)) return
      if (!t.isIdentifier(callee.property) || !strip.has(callee.property.name)) return
      if (!t.isExpression(callee.object)) return
      path.replaceWith(callee.object)
    },
  })
  deadCodeElimination(ast, referenced)

  const result = await transformFromAstAsync(ast, code, {
    filename: id,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    cloneInputAst: false,
  })
  if (result?.code == null) return null
  return {code: result.code, map: result.map ? JSON.stringify(result.map) : null}
}
