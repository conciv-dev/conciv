import {
  parseSync,
  Visitor,
  type Comment,
  type Declaration,
  type ExportDefaultDeclarationKind,
  type Expression,
  type JSXElementName,
  type ModuleExportName,
  type ParamPattern,
  type Program,
  type PropertyKey,
  type Span,
  type TSSignature,
  type TSType,
  type TSTypeName,
} from 'oxc-parser'
import type {PropSketch} from '../../shared/catalog-defs.js'

export function parseModule(input: {file: string; source: string}): ParsedModule {
  const {file, source} = input
  const parsed = parseSync(file, source, {sourceType: 'module'})
  const program = parsed.program
  const marks = collectMarks({program, source, declarations: file.endsWith('.d.ts') || file.endsWith('.d.mts')})
  const statements = program.body.flatMap((statement) => topLevel({statement, source}))
  const values = statements.flatMap((statement) => statement.values)
  const rendering = spread({
    values,
    marks,
    rendering: new Set(values.filter((value) => marked(value, marks)).map((value) => value.name)),
  })
  const imports = program.body.flatMap((statement) => requests(statement))
  return {
    imports: [...imports.filter((request) => !request.reexport).map((request) => request.value), ...marks.dynamic],
    reexports: imports.filter((request) => request.reexport).map((request) => request.value),
    bindings: program.body.flatMap((statement) => bindings(statement)),
    exports: program.body.flatMap((statement) => exportFacts(statement)),
    renders: rendering,
    docs: new Map(values.flatMap((value) => docOf({value, comments: parsed.comments, source}))),
    props: new Map(values.map((value) => [value.name, value.props])),
    types: new Map(statements.flatMap((statement) => statement.types)),
    elements: marks.elements,
    title: marks.title,
  }
}

type PropsFact = {kind: 'members'; members: PropSketch[]} | {kind: 'ref'; name: string} | {kind: 'unknown'}

type ParsedModule = {
  imports: string[]
  reexports: string[]
  bindings: Binding[]
  exports: ExportFact[]
  renders: Set<string>
  docs: Map<string, string>
  props: Map<string, PropsFact>
  types: Map<string, PropSketch[]>
  elements: JsxUse[]
  title: string | null
}

type Binding = {local: string; imported: string; request: string}

type ExportFact = {name: string; local: string | null; request: string | null; imported: string | null}

type JsxUse = {tag: string; start: number; end: number; text: string}

type Marks = {
  markup: number[]
  refs: {name: string; at: number}[]
  elements: JsxUse[]
  dynamic: string[]
  title: string | null
}

type Value = {name: string; statement: Span; function: boolean; props: PropsFact}

type TopLevel = {values: Value[]; types: [string, PropSketch[]][]}

type Statement = Program['body'][number]

const MARKUP_CALLS = new Set(['createElement', 'h', 'jsx', 'jsxs', 'jsxDEV', '_jsx', '_jsxs'])
const MARKUP_TAGS = new Set(['html', 'svg'])
const MARKUP_TYPE_SUFFIXES = ['Element', 'Component']
const DEFAULT_EXPORT = 'default'
const ALL_EXPORTS = '*'

function collectMarks(input: {program: Program; source: string; declarations: boolean}): Marks {
  const marks: Marks = {markup: [], refs: [], elements: [], dynamic: [], title: null}
  new Visitor({
    JSXElement: (node) => {
      marks.markup.push(node.start)
      const tag = tagRoot(node.openingElement.name)
      if (tag !== null)
        marks.elements.push({tag, start: node.start, end: node.end, text: input.source.slice(node.start, node.end)})
    },
    JSXFragment: (node) => {
      marks.markup.push(node.start)
    },
    CallExpression: (node) => {
      if (MARKUP_CALLS.has(calleeName(node.callee) ?? '')) marks.markup.push(node.start)
    },
    TaggedTemplateExpression: (node) => {
      if (node.tag.type === 'Identifier' && MARKUP_TAGS.has(node.tag.name)) marks.markup.push(node.start)
    },
    TSTypeReference: (node) => {
      if (input.declarations && MARKUP_TYPE_SUFFIXES.some((suffix) => typeName(node.typeName).endsWith(suffix))) {
        marks.markup.push(node.start)
      }
    },
    Identifier: (node) => {
      marks.refs.push({name: node.name, at: node.start})
    },
    ImportExpression: (node) => {
      if (node.source.type === 'Literal' && typeof node.source.value === 'string') marks.dynamic.push(node.source.value)
    },
    Property: (node) => {
      if (marks.title !== null || keyName(node.key) !== 'title') return
      if (node.value.type === 'Literal' && typeof node.value.value === 'string') marks.title = node.value.value
    },
  }).visit(input.program)
  return marks
}

function topLevel(input: {statement: Statement; source: string}): TopLevel[] {
  const {statement, source} = input
  const declaration = declarationOf(statement)
  if (declaration === null) return []
  if (declaration.type === 'TSTypeAliasDeclaration') {
    return declaration.typeAnnotation.type === 'TSTypeLiteral'
      ? [{values: [], types: [[declaration.id.name, sketches({members: declaration.typeAnnotation.members, source})]]}]
      : []
  }
  if (declaration.type === 'TSInterfaceDeclaration') {
    return [{values: [], types: [[declaration.id.name, sketches({members: declaration.body.body, source})]]}]
  }
  if (declaration.type === 'VariableDeclaration') {
    return [
      {
        values: declaration.declarations.flatMap((declarator) =>
          declarator.id.type === 'Identifier'
            ? [variableValue({name: declarator.id.name, init: declarator.init, statement, source})]
            : [],
        ),
        types: [],
      },
    ]
  }
  if (declaration.type === 'FunctionDeclaration' || declaration.type === 'TSDeclareFunction') {
    const name = declaration.id?.name ?? DEFAULT_EXPORT
    return [
      {values: [{name, statement, function: true, props: propsOf({params: declaration.params, source})}], types: []},
    ]
  }
  if (declaration.type === 'ClassDeclaration') {
    return [
      {
        values: [{name: declaration.id?.name ?? DEFAULT_EXPORT, statement, function: false, props: {kind: 'unknown'}}],
        types: [],
      },
    ]
  }
  if (declaration.type === 'ArrowFunctionExpression' || declaration.type === 'FunctionExpression') {
    return [
      {
        values: [
          {name: DEFAULT_EXPORT, statement, function: true, props: propsOf({params: declaration.params, source})},
        ],
        types: [],
      },
    ]
  }
  return []
}

function declarationOf(statement: Statement): Declaration | ExportDefaultDeclarationKind | null {
  if (statement.type === 'ExportNamedDeclaration') return statement.declaration
  if (statement.type === 'ExportDefaultDeclaration') return statement.declaration
  if (
    statement.type === 'VariableDeclaration' ||
    statement.type === 'FunctionDeclaration' ||
    statement.type === 'TSDeclareFunction' ||
    statement.type === 'ClassDeclaration' ||
    statement.type === 'TSTypeAliasDeclaration' ||
    statement.type === 'TSInterfaceDeclaration'
  ) {
    return statement
  }
  return null
}

function variableValue(input: {
  name: string
  init: Declaration | ExportDefaultDeclarationKind | null
  statement: Span
  source: string
}): Value {
  const {name, init, statement, source} = input
  if (init !== null && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
    return {name, statement, function: true, props: propsOf({params: init.params, source})}
  }
  return {name, statement, function: false, props: {kind: 'unknown'}}
}

function propsOf(input: {params: ParamPattern[]; source: string}): PropsFact {
  const [first] = input.params
  if (first === undefined) return {kind: 'members', members: []}
  const annotated = paramType(first)
  if (annotated === null) return {kind: 'unknown'}
  if (annotated.type === 'TSTypeLiteral')
    return {kind: 'members', members: sketches({members: annotated.members, source: input.source})}
  if (
    annotated.type === 'TSTypeReference' &&
    annotated.typeName.type === 'Identifier' &&
    annotated.typeArguments === null
  ) {
    return {kind: 'ref', name: annotated.typeName.name}
  }
  return {kind: 'unknown'}
}

function paramType(param: ParamPattern): TSType | null {
  if (param.type === 'Identifier' || param.type === 'ObjectPattern' || param.type === 'ArrayPattern') {
    return param.typeAnnotation?.typeAnnotation ?? null
  }
  return null
}

function sketches(input: {members: TSSignature[]; source: string}): PropSketch[] {
  return input.members.flatMap((member) => {
    if (member.type !== 'TSPropertySignature' || member.typeAnnotation === null) return []
    const name = keyName(member.key)
    if (name === null) return []
    const type = member.typeAnnotation.typeAnnotation
    return [{name, type: input.source.slice(type.start, type.end), required: !member.optional, values: literals(type)}]
  })
}

function literals(type: TSType): string[] {
  if (type.type === 'TSLiteralType' && type.literal.type === 'Literal') return [String(type.literal.value)]
  if (type.type !== 'TSUnionType') return []
  const members = type.types.map((member) => literals(member))
  return members.every((member) => member.length === 1) ? members.flat() : []
}

function spread(input: {values: Value[]; marks: Marks; rendering: Set<string>}): Set<string> {
  const {values, marks, rendering} = input
  const next = new Set([
    ...rendering,
    ...values
      .filter((value) => !value.function && !rendering.has(value.name))
      .filter((value) => marks.refs.some((ref) => within(ref.at, value.statement) && rendering.has(ref.name)))
      .map((value) => value.name),
  ])
  return next.size === rendering.size ? rendering : spread({values, marks, rendering: next})
}

function marked(value: Value, marks: Marks): boolean {
  return marks.markup.some((at) => within(at, value.statement))
}

function within(at: number, span: Span): boolean {
  return at >= span.start && at < span.end
}

function docOf(input: {value: Value; comments: Comment[]; source: string}): [string, string][] {
  const {value, comments, source} = input
  const leading = comments.find(
    (comment) =>
      comment.type === 'Block' &&
      comment.value.startsWith('*') &&
      comment.end <= value.statement.start &&
      source.slice(comment.end, value.statement.start).trim() === '',
  )
  if (leading === undefined) return []
  const text = leading.value
    .split('\n')
    .map((line) => line.trim())
    .map((line) => (line.startsWith('*') ? line.slice(1).trim() : line))
    .filter((line) => line !== '')
    .join(' ')
  const stop = text.indexOf('. ')
  return text === '' ? [] : [[value.name, stop === -1 ? text : text.slice(0, stop + 1)]]
}

function requests(statement: Statement): {value: string; reexport: boolean}[] {
  if (statement.type === 'ImportDeclaration') {
    const typeOnly =
      statement.importKind === 'type' ||
      (statement.specifiers.length > 0 &&
        statement.specifiers.every(
          (specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
        ))
    return typeOnly ? [] : [{value: statement.source.value, reexport: false}]
  }
  if (statement.type === 'ExportNamedDeclaration' && statement.source !== null && statement.exportKind !== 'type') {
    return [{value: statement.source.value, reexport: true}]
  }
  if (statement.type === 'ExportAllDeclaration' && statement.exportKind !== 'type') {
    return [{value: statement.source.value, reexport: true}]
  }
  return []
}

function bindings(statement: Statement): Binding[] {
  if (statement.type !== 'ImportDeclaration') return []
  return statement.specifiers.map((specifier) => ({
    local: specifier.local.name,
    imported:
      specifier.type === 'ImportSpecifier'
        ? exportName(specifier.imported)
        : specifier.type === 'ImportDefaultSpecifier'
          ? DEFAULT_EXPORT
          : ALL_EXPORTS,
    request: statement.source.value,
  }))
}

function exportFacts(statement: Statement): ExportFact[] {
  if (statement.type === 'ExportAllDeclaration') {
    return statement.exportKind === 'type'
      ? []
      : [
          {
            name: statement.exported === null ? ALL_EXPORTS : exportName(statement.exported),
            local: null,
            request: statement.source.value,
            imported: statement.exported === null ? null : ALL_EXPORTS,
          },
        ]
  }
  if (statement.type === 'ExportDefaultDeclaration') {
    return [{name: DEFAULT_EXPORT, local: defaultLocal(statement.declaration), request: null, imported: null}]
  }
  if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') return []
  const declared = declaredNames(statement.declaration).map((name) => ({
    name,
    local: name,
    request: null,
    imported: null,
  }))
  const listed = statement.specifiers
    .filter((specifier) => specifier.exportKind !== 'type')
    .map((specifier) =>
      statement.source === null
        ? {name: exportName(specifier.exported), local: exportName(specifier.local), request: null, imported: null}
        : {
            name: exportName(specifier.exported),
            local: null,
            request: statement.source.value,
            imported: exportName(specifier.local),
          },
    )
  return [...declared, ...listed]
}

function declaredNames(declaration: Declaration | null): string[] {
  if (declaration === null) return []
  if (declaration.type === 'VariableDeclaration') {
    return declaration.declarations.flatMap((declarator) =>
      declarator.id.type === 'Identifier' ? [declarator.id.name] : [],
    )
  }
  if (
    declaration.type === 'FunctionDeclaration' ||
    declaration.type === 'TSDeclareFunction' ||
    declaration.type === 'ClassDeclaration'
  ) {
    return declaration.id === null ? [] : [declaration.id.name]
  }
  return []
}

function defaultLocal(declaration: ExportDefaultDeclarationKind): string {
  if (declaration.type === 'Identifier') return declaration.name
  if (
    (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') &&
    declaration.id !== null
  ) {
    return declaration.id.name
  }
  return DEFAULT_EXPORT
}

function exportName(name: ModuleExportName): string {
  return name.type === 'Literal' ? name.value : name.name
}

function keyName(key: PropertyKey): string | null {
  if (key.type === 'Identifier') return key.name
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value
  return null
}

function tagRoot(name: JSXElementName): string | null {
  if (name.type === 'JSXIdentifier') return name.name.at(0)?.toUpperCase() === name.name.at(0) ? name.name : null
  if (name.type === 'JSXMemberExpression') return tagRoot(name.object)
  return null
}

function calleeName(callee: Expression): string | null {
  if (callee.type === 'Identifier') return callee.name
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') return callee.property.name
  return null
}

function typeName(name: TSTypeName): string {
  if (name.type === 'Identifier') return name.name
  if (name.type === 'TSQualifiedName') return name.right.name
  return ''
}
