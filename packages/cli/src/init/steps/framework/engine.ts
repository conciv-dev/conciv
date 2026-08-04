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

function importsFrom(root: SgNode, importFrom: string): boolean {
  return importStatements(root).some((statement) => {
    const specifier = statement.field('source')
    return specifier !== null && specifier.text().slice(1, -1) === importFrom
  })
}

function importEdit(root: SgNode, line: string): Edit {
  const statements = importStatements(root)
  const last = statements[statements.length - 1]
  if (!last) return {startPos: 0, endPos: 0, insertedText: `${line}\n`}
  const at = last.range().end.index
  return {startPos: at, endPos: at, insertedText: `\n${line}`}
}

const functionKinds: ReadonlySet<string | number> = new Set([
  'arrow_function',
  'function_expression',
  'function_declaration',
  'method_definition',
])

function insideFunction(node: SgNode): boolean {
  return node.ancestors().some((ancestor) => functionKinds.has(ancestor.kind()))
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

export function addToPluginsArray(
  source: string,
  importName: string,
  importFrom: string,
  callExpr: string,
  opts: {importStyle: 'default' | 'named'},
): Transform {
  const root = parse(Lang.TypeScript, source).root()
  if (importsFrom(root, importFrom)) return {matched: true, output: source}
  const pairs = root
    .findAll({rule: {kind: 'pair'}})
    .filter((pair) => pair.field('key')?.text() === 'plugins' && pair.field('value')?.kind() === 'array')
  const pair = pairs[0]
  if (!pair || pairs.length > 1 || insideFunction(pair)) return unmatched
  const array = pair.field('value')
  if (!array) return unmatched
  const edits = [
    appendEdit(source, array, callExpr),
    importEdit(root, importLine(importName, importFrom, opts.importStyle)),
  ]
  return {matched: true, output: root.commitEdits(edits)}
}

const wrappableKinds: ReadonlySet<string | number> = new Set(['identifier', 'call_expression', 'member_expression'])

export function wrapDefaultExport(source: string, wrapperName: string, importFrom: string): Transform {
  const root = parse(Lang.TypeScript, source).root()
  if (importsFrom(root, importFrom)) return {matched: true, output: source}
  const defaults = root
    .findAll({rule: {kind: 'export_statement'}})
    .filter((statement) => statement.children().some((child) => child.kind() === 'default'))
  const statement = defaults[0]
  if (!statement || defaults.length > 1) return unmatched
  const expression = statement.children().find((child) => child.isNamed())
  if (!expression || !wrappableKinds.has(expression.kind())) return unmatched
  const edits = [
    expression.replace(`${wrapperName}(${expression.text()})`),
    importEdit(root, importLine(wrapperName, importFrom, 'named')),
  ]
  return {matched: true, output: root.commitEdits(edits)}
}
