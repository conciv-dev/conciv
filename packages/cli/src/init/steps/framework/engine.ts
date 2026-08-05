import type {Edit, SgNode} from '@ast-grep/napi'
import {Lang, parse} from '@ast-grep/napi'

export type Transform = {matched: boolean; output: string | null}

const unmatched: Transform = {matched: false, output: null}

function importLine(importName: string, importFrom: string, importStyle: 'default' | 'named'): string {
  if (importStyle === 'default') return `import ${importName} from '${importFrom}'`
  return `import {${importName}} from '${importFrom}'`
}

function importStatements(root: SgNode): SgNode[] {
  return root.findAll({rule: {kind: 'import_statement'}})
}

type BindingStyle = 'default' | 'named' | 'require'

type BindingState = 'bound' | 'conflict' | 'absent'

function moduleSpecifierOf(statement: SgNode): string | null {
  const specifier = statement.field('source')
  if (specifier === null) return null
  return specifier.text().slice(1, -1)
}

function isTypeOnly(node: SgNode): boolean {
  return node.children().some((child) => child.kind() === 'type')
}

function valueImportsOf(root: SgNode, importFrom: string): SgNode[] {
  return importStatements(root).filter(
    (statement) => !isTypeOnly(statement) && moduleSpecifierOf(statement) === importFrom,
  )
}

function importClauseOf(statement: SgNode): SgNode | null {
  return statement.children().find((child) => child.kind() === 'import_clause') ?? null
}

function bindsDefaultAs(statement: SgNode, name: string): boolean {
  const clause = importClauseOf(statement)
  if (clause === null) return false
  return clause.children().some((child) => child.kind() === 'identifier' && child.text() === name)
}

function bindsNamedAs(statement: SgNode, name: string): boolean {
  const clause = importClauseOf(statement)
  if (clause === null) return false
  return clause
    .children()
    .filter((child) => child.kind() === 'named_imports')
    .flatMap((named) => named.children().filter((child) => child.kind() === 'import_specifier'))
    .some((specifier) => {
      if (isTypeOnly(specifier)) return false
      const imported = specifier.field('name')?.text()
      const local = specifier.field('alias')?.text() ?? imported
      return imported === name && local === name
    })
}

function requiredModuleOf(declarator: SgNode): string | null {
  const value = declarator.field('value')
  if (value === null || value.kind() !== 'call_expression') return null
  if (value.field('function')?.text() !== 'require') return null
  const argument = value
    .field('arguments')
    ?.children()
    .find((child) => child.isNamed())
  if (argument === undefined) return null
  return argument.text().slice(1, -1)
}

const declarationKinds: ReadonlySet<string | number> = new Set(['lexical_declaration', 'variable_declaration'])

function isTopLevel(declarator: SgNode): boolean {
  const declaration = declarator.parent()
  if (declaration === null || !declarationKinds.has(declaration.kind())) return false
  const enclosing = declaration.parent()
  if (enclosing === null) return false
  if (enclosing.kind() === 'program') return true
  return enclosing.kind() === 'export_statement' && enclosing.parent()?.kind() === 'program'
}

function tokensOf(node: SgNode): SgNode[] {
  const children = node.children()
  if (children.length === 0) return [node]
  return children.flatMap(tokensOf)
}

function fillsField(node: SgNode, parentKind: string, field: string): boolean {
  const parent = node.parent()
  if (parent === null || parent.kind() !== parentKind) return false
  return parent.field(field)?.range().start.index === node.range().start.index
}

function isRequireRead(token: SgNode): boolean {
  if (fillsField(token, 'call_expression', 'function')) return true
  return fillsField(token, 'member_expression', 'object')
}

function requireIsShadowed(root: SgNode): boolean {
  return tokensOf(root)
    .filter((token) => token.text() === 'require')
    .some((token) => !isRequireRead(token))
}

function bindsRequireAs(root: SgNode, requireFrom: string, name: string): boolean {
  return root.findAll({rule: {kind: 'variable_declarator'}}).some((declarator) => {
    if (!isTopLevel(declarator)) return false
    if (requiredModuleOf(declarator) !== requireFrom) return false
    const target = declarator.field('name')
    return target !== null && target.kind() === 'identifier' && target.text() === name
  })
}

function boundToModule(root: SgNode, moduleFrom: string, name: string, style: BindingStyle): boolean {
  if (style === 'require') return bindsRequireAs(root, moduleFrom, name)
  if (style === 'default') return valueImportsOf(root, moduleFrom).some((statement) => bindsDefaultAs(statement, name))
  return valueImportsOf(root, moduleFrom).some((statement) => bindsNamedAs(statement, name))
}

function referencesModule(root: SgNode, moduleFrom: string, style: BindingStyle): boolean {
  if (style === 'require') return requiresFrom(root, moduleFrom)
  return valueImportsOf(root, moduleFrom).length > 0
}

function usesIdentifier(root: SgNode, name: string): boolean {
  return root.findAll({rule: {kind: 'identifier'}}).some((node) => node.text() === name)
}

function bindingState(root: SgNode, moduleFrom: string, name: string, style: BindingStyle): BindingState {
  if (style === 'require' && requireIsShadowed(root)) return 'conflict'
  if (boundToModule(root, moduleFrom, name, style)) return 'bound'
  if (referencesModule(root, moduleFrom, style)) return 'conflict'
  if (usesIdentifier(root, name)) return 'conflict'
  return 'absent'
}

function importEdit(root: SgNode, line: string): Edit {
  const statements = importStatements(root)
  const last = statements[statements.length - 1]
  if (!last) return {startPos: 0, endPos: 0, insertedText: `${line}\n`}
  const at = last.range().end.index
  return {startPos: at, endPos: at, insertedText: `\n${line}`}
}

function appendEdit(source: string, array: SgNode, callExpr: string): Edit {
  const closing = array.range().end.index - 1
  const elements = array.children().filter((child) => child.isNamed())
  const last = elements[elements.length - 1]
  if (!last) return {startPos: closing, endPos: closing, insertedText: callExpr}
  const lastEnd = last.range().end.index
  const tail = source.slice(lastEnd, closing)
  if (!tail.includes('\n')) return {startPos: lastEnd, endPos: lastEnd, insertedText: `, ${callExpr}`}
  const indent = ' '.repeat(last.range().start.column)
  const comma = tail.indexOf(',')
  if (comma === -1) return {startPos: lastEnd, endPos: lastEnd, insertedText: `,\n${indent}${callExpr}`}
  const at = lastEnd + comma + 1
  return {startPos: at, endPos: at, insertedText: `\n${indent}${callExpr},`}
}

function defaultExportExpression(root: SgNode): SgNode | null {
  const statements = root
    .findAll({rule: {kind: 'export_statement'}})
    .filter((statement) => statement.children().some((child) => child.kind() === 'default'))
  const statement = statements[0]
  if (!statement || statements.length > 1) return null
  return statement.children().find((child) => child.isNamed()) ?? null
}

function moduleExportsExpression(root: SgNode): SgNode | null {
  const assignments = root
    .findAll({rule: {kind: 'assignment_expression'}})
    .filter((assignment) => assignment.field('left')?.text() === 'module.exports')
  const assignment = assignments[0]
  if (!assignment || assignments.length > 1) return null
  return assignment.field('right')
}

function exportedExpression(root: SgNode): SgNode | null {
  return defaultExportExpression(root) ?? moduleExportsExpression(root)
}

const configWrapperNames: ReadonlySet<string> = new Set(['defineConfig'])

function wrapperArgument(call: SgNode): SgNode | null {
  if (!configWrapperNames.has(call.field('function')?.text() ?? '')) return null
  const args =
    call
      .field('arguments')
      ?.children()
      .filter((child) => child.isNamed()) ?? []
  const first = args[0]
  if (!first || args.length > 1) return null
  return first
}

function declaredValue(root: SgNode, name: string): SgNode | null {
  const declarators = root
    .findAll({rule: {kind: 'variable_declarator'}})
    .filter((declarator) => declarator.field('name')?.text() === name)
  const declarator = declarators[0]
  if (!declarator || declarators.length > 1) return null
  return declarator.field('value')
}

function resolvedExpression(root: SgNode, expression: SgNode): SgNode | null {
  if (expression.kind() !== 'identifier') return expression
  return declaredValue(root, expression.text())
}

function exportedConfigObject(root: SgNode): SgNode | null {
  const exported = exportedExpression(root)
  if (exported === null) return null
  const expression = resolvedExpression(root, exported)
  if (expression === null) return null
  const object = expression.kind() === 'call_expression' ? wrapperArgument(expression) : expression
  if (object === null || object.kind() !== 'object') return null
  return object
}

function objectPairs(object: SgNode): SgNode[] {
  return object.children().filter((child) => child.kind() === 'pair')
}

function nestedObjects(object: SgNode): SgNode[] {
  return objectPairs(object).flatMap((pair) => {
    const value = pair.field('value')
    if (value === null || value.kind() !== 'object') return []
    return [value]
  })
}

function pluginsArray(root: SgNode): SgNode | null {
  const object = exportedConfigObject(root)
  if (object === null) return null
  const pairs = [object, ...nestedObjects(object)]
    .flatMap(objectPairs)
    .filter((pair) => pair.field('key')?.text() === 'plugins' && pair.field('value')?.kind() === 'array')
  const pair = pairs[0]
  if (!pair || pairs.length > 1) return null
  return pair.field('value')
}

function calleeOf(callExpr: string): string {
  return callExpr.slice(0, callExpr.indexOf('('))
}

function bindingOf(callExpr: string): string {
  const callee = calleeOf(callExpr)
  const dot = callee.indexOf('.')
  if (dot === -1) return callee
  return callee.slice(0, dot)
}

function callsPlugin(array: SgNode, callExpr: string): boolean {
  return array
    .children()
    .filter((child) => child.isNamed())
    .some((element) => element.kind() === 'call_expression' && element.field('function')?.text() === calleeOf(callExpr))
}

function commit(root: SgNode, source: string, edits: Edit[]): Transform {
  if (edits.length === 0) return {matched: true, output: source}
  return {matched: true, output: root.commitEdits(edits)}
}

export function pluginCallWired(
  source: string,
  importFrom: string,
  callExpr: string,
  opts: {importStyle: 'default' | 'require'},
): boolean {
  const root = parse(Lang.TypeScript, source).root()
  if (bindingState(root, importFrom, bindingOf(callExpr), opts.importStyle) !== 'bound') return false
  const array = pluginsArray(root)
  if (array === null) return false
  return callsPlugin(array, callExpr)
}

export function defaultExportWrapped(source: string, wrapperName: string, importFrom: string): boolean {
  const root = parse(Lang.TypeScript, source).root()
  if (bindingState(root, importFrom, wrapperName, 'named') !== 'bound') return false
  const expression = defaultExportExpression(root)
  if (expression === null || expression.kind() !== 'call_expression') return false
  return expression.field('function')?.text() === wrapperName
}

export function addToPluginsArray(
  source: string,
  importName: string,
  importFrom: string,
  callExpr: string,
  opts: {importStyle: 'default' | 'named'},
): Transform {
  const root = parse(Lang.TypeScript, source).root()
  const array = pluginsArray(root)
  if (!array) return unmatched
  const state = bindingState(root, importFrom, importName, opts.importStyle)
  if (state === 'conflict') return unmatched
  const callEdits = callsPlugin(array, callExpr) ? [] : [appendEdit(source, array, callExpr)]
  if (state === 'bound') return commit(root, source, callEdits)
  return commit(root, source, [...callEdits, importEdit(root, importLine(importName, importFrom, opts.importStyle))])
}

function requiresFrom(root: SgNode, requireFrom: string): boolean {
  return root.findAll({rule: {kind: 'call_expression'}}).some((call) => {
    if (call.field('function')?.text() !== 'require') return false
    const argument = call
      .field('arguments')
      ?.children()
      .find((child) => child.isNamed())
    return argument !== undefined && argument.text().slice(1, -1) === requireFrom
  })
}

export function addToPluginsArrayRequire(
  source: string,
  bindingName: string,
  requireFrom: string,
  callExpr: string,
): Transform {
  const root = parse(Lang.TypeScript, source).root()
  if (importStatements(root).length > 0) return unmatched
  const array = pluginsArray(root)
  if (!array) return unmatched
  const state = bindingState(root, requireFrom, bindingName, 'require')
  if (state === 'conflict') return unmatched
  const callEdits = callsPlugin(array, callExpr) ? [] : [appendEdit(source, array, callExpr)]
  if (state === 'bound') return commit(root, source, callEdits)
  const requireEdit = {startPos: 0, endPos: 0, insertedText: `const ${bindingName} = require('${requireFrom}')\n`}
  return commit(root, source, [...callEdits, requireEdit])
}

const wrappableKinds: ReadonlySet<string | number> = new Set(['identifier', 'call_expression', 'member_expression'])

export function wrapDefaultExport(source: string, wrapperName: string, importFrom: string): Transform {
  const root = parse(Lang.TypeScript, source).root()
  const expression = defaultExportExpression(root)
  if (!expression || !wrappableKinds.has(expression.kind())) return unmatched
  const state = bindingState(root, importFrom, wrapperName, 'named')
  if (state === 'conflict') return unmatched
  const wrapped = expression.kind() === 'call_expression' && expression.field('function')?.text() === wrapperName
  const wrapEdits = wrapped ? [] : [expression.replace(`${wrapperName}(${expression.text()})`)]
  if (state === 'bound') return commit(root, source, wrapEdits)
  return commit(root, source, [...wrapEdits, importEdit(root, importLine(wrapperName, importFrom, 'named'))])
}
