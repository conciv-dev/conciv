import {parseSync, transformFromAstSync, traverse, types as t, type NodePath} from '@babel/core'
import {deadCodeElimination, findReferencedIdentifiers} from 'babel-dead-code-elimination'

export type SplitEnv = 'browser' | 'node'

type DeclarationKind = 'extension' | 'tool' | 'attachment'

const CONTRACT_MARKER = /\bdefine(?:Extension|Tool|Attachment)\b/

const DECLARATION_PACKAGE = '@conciv/extension'

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

const NODE_STRIPPED_PROPERTIES = new Set(['Component', 'Surface', 'views'])

function isDeclarationPackage(source: string): boolean {
  return source === DECLARATION_PACKAGE || source.startsWith(`${DECLARATION_PACKAGE}/`)
}

function declarationKindOfImport(specifier: t.ImportSpecifier, source: t.Node): DeclarationKind | null {
  if (!t.isImportDeclaration(source) || !isDeclarationPackage(source.source.value)) return null
  const imported = specifier.imported
  return DECLARATION_CALLS[t.isIdentifier(imported) ? imported.name : imported.value] ?? null
}

function declarationKindOfBinding(name: string, path: NodePath, seen: Set<t.Node>): DeclarationKind | null {
  const binding = path.scope.getBinding(name)
  if (!binding || !binding.constant) return null
  const declaration = binding.path.node
  if (t.isImportSpecifier(declaration)) return declarationKindOfImport(declaration, binding.path.parent)
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

function propertyKeyName(node: t.Node): string | null {
  if (!t.isObjectProperty(node) && !t.isObjectMethod(node)) return null
  if (node.computed) return null
  if (t.isIdentifier(node.key)) return node.key.name
  return t.isStringLiteral(node.key) ? node.key.value : null
}

function isClientOnlyProperty(node: t.Node): boolean {
  const key = propertyKeyName(node)
  return key !== null && NODE_STRIPPED_PROPERTIES.has(key)
}

function extensionConfigPath(path: NodePath<t.CallExpression>): NodePath<t.ObjectExpression> | null {
  const callee = path.node.callee
  if (!t.isIdentifier(callee)) return null
  if (declarationKindOfBinding(callee.name, path, new Set()) !== 'extension') return null
  const [config] = path.get('arguments')
  return config && config.isObjectExpression() ? config : null
}

function isObjectAssignCallee(callee: t.Node): boolean {
  return (
    t.isMemberExpression(callee) &&
    t.isIdentifier(callee.object) &&
    callee.object.name === 'Object' &&
    t.isIdentifier(callee.property) &&
    callee.property.name === 'assign'
  )
}

function objectAssignConfigPath(path: NodePath<t.CallExpression>): NodePath<t.ObjectExpression> | null {
  if (!isObjectAssignCallee(path.node.callee)) return null
  const [target, config] = path.get('arguments')
  if (!target || !config || !config.isObjectExpression()) return null
  if (declarationKindOf(target.node, path, new Set()) !== 'extension') return null
  return config
}

function stripClientOnlyProperties(path: NodePath<t.CallExpression>): void {
  const config = extensionConfigPath(path) ?? objectAssignConfigPath(path)
  if (config === null) return
  for (const property of config.get('properties')) {
    if (isClientOnlyProperty(property.node)) property.remove()
  }
}

function terminatorName(callee: t.Node): string | null {
  if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.property)) return null
  return TERMINATOR_NAMES.has(callee.property.name) ? callee.property.name : null
}

function terminatorObject(callee: t.Node): t.Expression | null {
  if (!t.isMemberExpression(callee) || !t.isExpression(callee.object)) return null
  return callee.object
}

function collapseTerminator(path: NodePath<t.CallExpression>, stripped: Record<DeclarationKind, string>): void {
  const name = terminatorName(path.node.callee)
  const object = terminatorObject(path.node.callee)
  if (name === null || object === null) return
  const kind = declarationKindOf(object, path, new Set())
  if (kind === null || stripped[kind] !== name) return
  path.replaceWith(object)
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
      if (env === 'node') stripClientOnlyProperties(path)
      collapseTerminator(path, strippedTerminator)
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
