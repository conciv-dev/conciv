import {isIdentifier, isNode, walk} from './ast-walk.js'

const CAMEL_BOUNDARY = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/
const NON_ALPHANUMERIC = /[^A-Za-z0-9]+/

function splitSegments(name) {
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
  const segments = splitSegments(name)
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

function findViolationTerm(identifier, filename, terms, options) {
  const term = matchedTerm(identifier.name, terms)
  if (term === undefined) return undefined
  return termAllowedAt(term.label, filename, options.allowedTermPaths) ? undefined : term
}

function reportIdentifier(identifier, filename, violation, seen, context) {
  if (seen.has(identifier.name)) return
  const data = violation(identifier, filename)
  if (data === undefined) return
  seen.add(identifier.name)
  context.report({node: identifier, messageId: 'banned', data})
}

function visitDeclarations(program, filename, violation, context) {
  const seen = new Set()
  walk(program, (node) => {
    if (node.type === 'ImportDeclaration' || node.type === 'TSImportEqualsDeclaration') return 'skip'
    for (const identifier of declarationIdentifiers(node)) {
      reportIdentifier(identifier, filename, violation, seen, context)
    }
    return undefined
  })
}

function makeDeclarationRule(options) {
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
          visitDeclarations(program, filename, options.violation, context)
        },
      }
    },
  }
}

function makeVocabularyRule(options) {
  const terms = options.terms.map((label) => ({label, segments: splitSegments(label)}))
  return makeDeclarationRule({
    exemptFiles: options.exemptFiles,
    message: options.message,
    violation: (identifier, filename) => {
      const term = findViolationTerm(identifier, filename, terms, options)
      return term === undefined ? undefined : {name: identifier.name, term: term.label}
    },
  })
}

const REWRITE_BANNED_TERMS = [
  'bridge',
  'pipeline',
  'maintenance',
  'manager',
  'sendWhenAvailable',
  'holdAndFlush',
  'veto',
  'epoch',
  'snapshotKey',
  'externalRev',
  'forceSend',
  'adopt',
  'attach',
  'presence',
]

const PREEXISTING_MODULES = ['packages/harness-init/src/claude/bridge.ts', 'packages/oxlint-plugin/src/']

const DEV_BUNDLER_BRIDGE_PATHS = [
  'packages/core/src/app.ts',
  'packages/core/src/start.ts',
  'packages/plugin-testkit/src/core-kit.ts',
  'packages/unplugin/src/',
]

const NATIVE_AND_REACT_BRIDGE_PATHS = [
  'packages/plugins/ios/src/bridge.ts',
  'packages/plugins/ios/src/client.tsx',
  'packages/publish/src/cli.ts',
  'packages/publish/src/swift-mirror.ts',
  'packages/page/src/',
  'packages/embed/src/mount-impl.tsx',
]

const PRE_REWRITE_BRIDGE_PATHS = ['packages/harness-init/src/']

const HARNESS_CONNECT_ATTACH_PATHS = ['packages/harness/src/codex/history.ts']

const COMPOSER_ATTACHMENT_INGRESS_PATHS = ['apps/conciv/src/pane/chat-pane.tsx']

const PRE_REWRITE_ATTACH_PATHS = [
  'apps/site/src/components/landing/',
  'packages/core/src/pty/pty-sessions.ts',
  'packages/page/src/react-bridge.ts',
  'packages/try/src/cli.ts',
  'packages/vitest-config/src/summary.ts',
]

const PREEXISTING_TERM_SITES = [
  {term: 'bridge', paths: [...DEV_BUNDLER_BRIDGE_PATHS, ...NATIVE_AND_REACT_BRIDGE_PATHS, ...PRE_REWRITE_BRIDGE_PATHS]},
  {
    term: 'epoch',
    paths: ['packages/db/src/chat-tables.ts', 'packages/ai/src/server/chat-stores.ts'],
  },
  {
    term: 'presence',
    paths: ['packages/ui-kit-system/src/', 'packages/plugins/recorder/src/'],
  },
  {
    term: 'manager',
    paths: ['packages/plugins/test-runner/src/', 'packages/cli/src/init/'],
  },
  {
    term: 'pipeline',
    paths: [
      'apps/conciv/uno.config.ts',
      'packages/embed/uno.config.ts',
      'packages/ui-kit-chat/uno.config.ts',
      'packages/ui-kit-chat-tools/uno.config.ts',
      'packages/ui-kit-system/uno.config.ts',
    ],
  },
  {
    term: 'attach',
    paths: [...HARNESS_CONNECT_ATTACH_PATHS, ...COMPOSER_ATTACHMENT_INGRESS_PATHS, ...PRE_REWRITE_ATTACH_PATHS],
  },
]

export const bannedVocabulary = makeVocabularyRule({
  terms: REWRITE_BANNED_TERMS,
  exemptFiles: PREEXISTING_MODULES,
  allowedTermPaths: PREEXISTING_TERM_SITES,
  message:
    "'{{name}}' carries banned rewrite vocabulary '{{term}}' (chat rewrite, map conciv-dev/conciv#177): that domain was deleted; name the thing after its live domain instead.",
})

const CORE_FOREIGN_TERMS = ['terminal', 'verdict']

export const corePurity = makeVocabularyRule({
  terms: CORE_FOREIGN_TERMS,
  exemptFiles: [],
  allowedTermPaths: [],
  message:
    "'{{name}}' drags '{{term}}' vocabulary into @conciv/core (spec conciv-dev/conciv#190): core stays harness- and terminal-agnostic; home it in the owning plugin or rename it.",
})

const OF_SUFFIX = /.Of$/

const LANGUAGE_NAMES = ['valueOf', 'indexOf', 'lastIndexOf', 'getPrototypeOf', 'setPrototypeOf']

const FOREIGN_KEYS = ['allOf', 'anyOf', 'oneOf', 'isPartOf']

const PORTED_FILE_PATTERNS = [
  'packages/plugin-host/src/',
  'packages/plugin/src/',
  'apps/conciv/src/runtime/plugin/',
  'apps/conciv/src/runtime/persistence/',
]

const ALLOWED_NAMES = [...LANGUAGE_NAMES, ...FOREIGN_KEYS]

export const noOfSuffix = makeDeclarationRule({
  exemptFiles: PORTED_FILE_PATTERNS,
  message:
    "'{{name}}' ends in 'Of': name a function with a verb first that says what its body does (readApprovalAsk, not approvalAskOf).",
  violation: (identifier) =>
    OF_SUFFIX.test(identifier.name) && !ALLOWED_NAMES.includes(identifier.name) ? {name: identifier.name} : undefined,
})
