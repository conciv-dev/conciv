import {parseSync, transformFromAstSync, traverse, types as t, type NodePath} from '@babel/core'
import {deadCodeElimination, findReferencedIdentifiers} from 'babel-dead-code-elimination'

export type SplitEnv = 'browser' | 'node'

type DeclarationKind = 'extension' | 'tool' | 'attachment'

const CONTRACT_MARKER = /\bdefine(?:Extension|Tool|Attachment)\b/

const DECLARATION_CALLS: Record<string, DeclarationKind> = {
  defineExtension: 'extension',
  defineTool: 'tool',
  defineAttachment: 'attachment',
}

const STRIPPED_TERMINATOR: Record<SplitEnv, Record<DeclarationKind, string>> = {
  browser: {extension: 'server', tool: 'server', attachment: 'server'},
  node: {extension: 'client', tool: 'render', attachment: 'card'},
}

const TERMINATOR_NAMES = new Set(
  Object.values(STRIPPED_TERMINATOR).flatMap((terminatorOf) => Object.values(terminatorOf)),
)

function declarationKindOfBinding(name: string, path: NodePath, seen: Set<t.Node>): DeclarationKind | null {
  const binding = path.scope.getBinding(name)
  if (!binding) return DECLARATION_CALLS[name] ?? null
  const declaration = binding.path.node
  if (t.isImportSpecifier(declaration)) {
    const imported = declaration.imported
    return DECLARATION_CALLS[t.isIdentifier(imported) ? imported.name : imported.value] ?? null
  }
  if (t.isVariableDeclarator(declaration) && declaration.init) return declarationKindOf(declaration.init, path, seen)
  return null
}

function declarationKindOf(node: t.Node, path: NodePath, seen: Set<t.Node>): DeclarationKind | null {
  if (seen.has(node)) return null
  seen.add(node)
  if (t.isIdentifier(node)) return declarationKindOfBinding(node.name, path, seen)
  if (!t.isCallExpression(node)) return null
  const callee = node.callee
  if (t.isIdentifier(callee)) return declarationKindOfBinding(callee.name, path, seen)
  if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && TERMINATOR_NAMES.has(callee.property.name))
    return declarationKindOf(callee.object, path, seen)
  return null
}

export function splitExtension(code: string, id: string, env: SplitEnv): {code: string; map: string | null} | null {
  if (!CONTRACT_MARKER.test(code)) return null
  const ast = parseSync(code, {
    filename: id,
    babelrc: false,
    configFile: false,
    parserOpts: {plugins: ['typescript', 'jsx']},
  })
  if (!ast) return null

  const referenced = findReferencedIdentifiers(ast)
  const strippedTerminator = STRIPPED_TERMINATOR[env]
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee
      if (!t.isMemberExpression(callee)) return
      if (!t.isIdentifier(callee.property) || !TERMINATOR_NAMES.has(callee.property.name)) return
      if (!t.isExpression(callee.object)) return
      const kind = declarationKindOf(callee.object, path, new Set())
      if (kind === null || strippedTerminator[kind] !== callee.property.name) return
      path.replaceWith(callee.object)
    },
  })
  deadCodeElimination(ast, referenced)

  const result = transformFromAstSync(ast, code, {
    filename: id,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    cloneInputAst: false,
  })
  if (result?.code == null) return null
  return {code: result.code, map: result.map ? JSON.stringify(result.map) : null}
}
