import {parseAsync, transformFromAstAsync, traverse, types as t} from '@babel/core'
import {deadCodeElimination, findReferencedIdentifiers} from 'babel-dead-code-elimination'

// The marker that makes a module an extension — its content, never a filename.
const CONTRACT_MARKER = 'defineExtension'

// Which chained calls to collapse per build target. The browser keeps .client()/.render() and drops
// the server execute; the node engine keeps .server() and drops the client surface (Solid/cards).
const STRIP_FOR: Record<SplitEnv, ReadonlySet<string>> = {
  browser: new Set(['server']),
  node: new Set(['client', 'render']),
}

export type SplitEnv = 'browser' | 'node'

// Collapse the wrong-side calls in a defineExtension/defineTool chain, then dead-code-eliminate the
// now-orphaned imports — TanStack's pipeline: record referenced identifiers, replace each wrong-side
// `obj.method(...)` with `obj`, then deadCodeElimination over only those original candidates.
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
