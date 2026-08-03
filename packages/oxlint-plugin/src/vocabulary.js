import {isIdentifier, isNode, walk} from './ast-walk.js'

const CAMEL_BOUNDARY = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/
const NON_ALPHANUMERIC = /[^A-Za-z0-9]+/

function segmentsOf(name) {
  return name
    .split(NON_ALPHANUMERIC)
    .flatMap((part) => part.split(CAMEL_BOUNDARY))
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase())
}

function segmentMatches(segment, expected, last) {
  if (segment === expected) return true
  if (!last) return false
  return segment === `${expected}s` || segment === `${expected}es`
}

function termAt(segments, term, start) {
  return term.every((expected, offset) =>
    segmentMatches(segments[start + offset], expected, offset === term.length - 1),
  )
}

function containsTerm(segments, term) {
  const starts = segments.length - term.length + 1
  for (let start = 0; start < starts; start++) {
    if (termAt(segments, term, start)) return true
  }
  return false
}

function matchedTerm(name, terms) {
  const segments = segmentsOf(name)
  return terms.find((term) => containsTerm(segments, term.segments))
}

const PATTERN_HANDLERS = new Map([
  ['Identifier', (pattern) => [pattern]],
  ['AssignmentPattern', (pattern) => patternNames(pattern.left)],
  ['RestElement', (pattern) => patternNames(pattern.argument)],
  ['ArrayPattern', (pattern) => pattern.elements.flatMap((element) => patternNames(element))],
  ['ObjectPattern', (pattern) => pattern.properties.flatMap((property) => propertyPatternNames(property))],
])

function patternNames(pattern) {
  if (!isNode(pattern)) return []
  const handler = PATTERN_HANDLERS.get(pattern.type)
  return handler === undefined ? [] : handler(pattern)
}

function propertyPatternNames(property) {
  if (property.type === 'RestElement') return patternNames(property.argument)
  if (property.type === 'Property') return patternNames(property.value)
  return []
}

function keyIdentifier(node) {
  if (node.computed === true) return []
  return isIdentifier(node.key) ? [node.key] : []
}

function ownIdentifier(node) {
  return isIdentifier(node.id) ? [node.id] : []
}

function functionIdentifiers(node) {
  return [...ownIdentifier(node), ...node.params.flatMap((param) => patternNames(param))]
}

function exportedIdentifier(node) {
  return isIdentifier(node.exported) ? [node.exported] : []
}

const DECLARATION_HANDLERS = new Map([
  ['VariableDeclarator', (node) => patternNames(node.id)],
  ['FunctionDeclaration', functionIdentifiers],
  ['FunctionExpression', functionIdentifiers],
  ['ArrowFunctionExpression', functionIdentifiers],
  ['ClassDeclaration', ownIdentifier],
  ['ClassExpression', ownIdentifier],
  ['TSTypeAliasDeclaration', ownIdentifier],
  ['TSInterfaceDeclaration', ownIdentifier],
  ['TSEnumDeclaration', ownIdentifier],
  ['TSModuleDeclaration', ownIdentifier],
  ['TSEnumMember', ownIdentifier],
  ['Property', keyIdentifier],
  ['PropertyDefinition', keyIdentifier],
  ['MethodDefinition', keyIdentifier],
  ['TSPropertySignature', keyIdentifier],
  ['TSMethodSignature', keyIdentifier],
  ['ExportSpecifier', exportedIdentifier],
])

function declarationIdentifiers(node) {
  const handler = DECLARATION_HANDLERS.get(node.type)
  return handler === undefined ? [] : handler(node)
}

function normalizedFilename(context) {
  return context.filename.split('\\').join('/')
}

function termAllowedAt(label, filename, allowedTermPaths) {
  return allowedTermPaths.some((entry) => entry.term === label && entry.paths.some((path) => filename.includes(path)))
}

function violationTerm(identifier, filename, terms, options) {
  if (options.allowedNames.includes(identifier.name)) return undefined
  const term = matchedTerm(identifier.name, terms)
  if (term === undefined) return undefined
  return termAllowedAt(term.label, filename, options.allowedTermPaths) ? undefined : term
}

function reportIdentifier(identifier, filename, terms, options, seen, context) {
  if (seen.has(identifier.name)) return
  const term = violationTerm(identifier, filename, terms, options)
  if (term === undefined) return
  seen.add(identifier.name)
  context.report({node: identifier, messageId: 'banned', data: {name: identifier.name, term: term.label}})
}

function visitDeclarations(program, filename, terms, options, context) {
  const seen = new Set()
  walk(program, (node) => {
    if (node.type === 'ImportDeclaration' || node.type === 'TSImportEqualsDeclaration') return 'skip'
    for (const identifier of declarationIdentifiers(node)) {
      reportIdentifier(identifier, filename, terms, options, seen, context)
    }
    return undefined
  })
}

export function makeVocabularyRule(options) {
  const terms = options.terms.map((label) => ({label, segments: segmentsOf(label)}))
  return {
    meta: {
      type: 'problem',
      messages: {banned: options.message},
      schema: [],
    },
    createOnce(context) {
      return {
        Program(program) {
          const filename = normalizedFilename(context)
          if (options.exemptFiles.some((path) => filename.includes(path))) return
          visitDeclarations(program, filename, terms, options, context)
        },
      }
    },
  }
}
