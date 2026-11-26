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

const PATTERN_HANDLERS = {
  Identifier: (pattern) => [pattern],
  AssignmentPattern: (pattern) => patternNames(pattern.left),
  RestElement: (pattern) => patternNames(pattern.argument),
  ArrayPattern: (pattern) => pattern.elements.flatMap((element) => patternNames(element)),
  ObjectPattern: (pattern) => pattern.properties.flatMap((property) => propertyPatternNames(property)),
}

function patternNames(pattern) {
  if (!isNode(pattern)) return []
  const handler = Object.hasOwn(PATTERN_HANDLERS, pattern.type) ? PATTERN_HANDLERS[pattern.type] : undefined
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

const DECLARATION_HANDLERS = {
  VariableDeclarator: (node) => patternNames(node.id),
  FunctionDeclaration: functionIdentifiers,
  FunctionExpression: functionIdentifiers,
  ArrowFunctionExpression: functionIdentifiers,
  ClassDeclaration: ownIdentifier,
  ClassExpression: ownIdentifier,
  TSTypeAliasDeclaration: ownIdentifier,
  TSInterfaceDeclaration: ownIdentifier,
  TSEnumDeclaration: ownIdentifier,
  TSModuleDeclaration: ownIdentifier,
  TSEnumMember: ownIdentifier,
  Property: keyIdentifier,
  PropertyDefinition: keyIdentifier,
  MethodDefinition: keyIdentifier,
  TSPropertySignature: keyIdentifier,
  TSMethodSignature: keyIdentifier,
  ExportSpecifier: exportedIdentifier,
}

function declarationIdentifiers(node) {
  const handler = Object.hasOwn(DECLARATION_HANDLERS, node.type) ? DECLARATION_HANDLERS[node.type] : undefined
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

const PREEXISTING_MODULES = ['packages/harness/src/init/claude/bridge.ts', 'packages/oxlint-plugin/src/']

const DEV_BUNDLER_BRIDGE_PATHS = [
  'packages/backend-defaults/src/engine/app.ts',
  'packages/backend-defaults/src/engine/start.ts',
  'packages/unplugin/src/',
]

const NATIVE_AND_REACT_BRIDGE_PATHS = [
  'packages/plugins/ios/src/rpc.ts',
  'packages/plugins/ios/src/client.tsx',
  'packages/publish/src/cli.ts',
  'packages/publish/src/swift-mirror.ts',
  'packages/plugins/page/src/react.ts',
  'packages/plugins/page/src/client.ts',
  'packages/plugins/page/src/renderer.tsx',
  'packages/plugins/page/src/operations.ts',
  'packages/plugins/page/src/grab.ts',
  'packages/app/src/mount-impl.tsx',
]

const PRE_REWRITE_BRIDGE_PATHS = ['packages/harness/src/init/']

const HARNESS_CONNECT_ATTACH_PATHS = ['packages/harness/src/codex/history.ts']

const COMPOSER_ATTACHMENT_INGRESS_PATHS = ['packages/frontend-defaults/src/pane/chat-pane.tsx']

const EXTERNAL_API_ATTACH_PATHS = [
  'packages/vitest-config/src/conciv-test.ts',
  'packages/frontend-test-utils/src/frontend-test-utils.tsx',
]

const PRE_REWRITE_ATTACH_PATHS = [
  'apps/site/src/components/landing/',
  'packages/backend-defaults/src/engine/pty/pty-sessions.ts',
  'packages/plugins/page/src/react.ts',
  'packages/try/src/cli.ts',
  'packages/publish/src/summary.ts',
]

const PREEXISTING_TERM_SITES = [
  {term: 'bridge', paths: [...DEV_BUNDLER_BRIDGE_PATHS, ...NATIVE_AND_REACT_BRIDGE_PATHS, ...PRE_REWRITE_BRIDGE_PATHS]},
  {
    term: 'epoch',
    paths: [
      'packages/backend-defaults/src/db/run-schema.ts',
      'packages/backend-defaults/src/ai/chat-stores.ts',
      'packages/backend-app-api/src/core/session/sql.ts',
    ],
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
      'packages/frontend-defaults/uno.config.ts',
      'packages/app/uno.config.ts',
      'packages/ui-kit-chat/uno.config.ts',
      'packages/ui-kit-chat-tools/uno.config.ts',
      'packages/ui-kit-system/uno.config.ts',
      'packages/uno-preset/src/uno-preset.ts',
    ],
  },
  {
    term: 'attach',
    paths: [
      ...HARNESS_CONNECT_ATTACH_PATHS,
      ...COMPOSER_ATTACHMENT_INGRESS_PATHS,
      ...EXTERNAL_API_ATTACH_PATHS,
      ...PRE_REWRITE_ATTACH_PATHS,
    ],
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
    "'{{name}}' drags '{{term}}' vocabulary into @conciv/backend (spec conciv-dev/conciv#190): core stays harness- and terminal-agnostic; home it in the owning plugin or rename it.",
})

const OF_SUFFIX = /.Of$/

const LANGUAGE_NAMES = ['valueOf', 'indexOf', 'lastIndexOf', 'getPrototypeOf', 'setPrototypeOf']

const FOREIGN_KEYS = ['allOf', 'anyOf', 'oneOf', 'isPartOf']

const PORTED_FILE_PATTERNS = [
  'packages/backend-app-api/src/',
  'packages/backend-plugin-api/src/',
  'packages/frontend-plugin-api/src/',
  'packages/protocol/src/schema/',
  'packages/frontend-defaults/src/runtime/plugin/',
  'packages/frontend-defaults/src/runtime/persistence/',
  'packages/frontend-app-api/src/plugin/',
  'packages/frontend-app-api/src/persistence/',
]

const ALLOWED_NAMES = [...LANGUAGE_NAMES, ...FOREIGN_KEYS]

export const noOfSuffix = makeDeclarationRule({
  exemptFiles: PORTED_FILE_PATTERNS,
  message:
    "'{{name}}' ends in 'Of': name a function with a verb first that says what its body does (readApprovalAsk, not approvalAskOf).",
  violation: (identifier) =>
    OF_SUFFIX.test(identifier.name) && !ALLOWED_NAMES.includes(identifier.name) ? {name: identifier.name} : undefined,
})
