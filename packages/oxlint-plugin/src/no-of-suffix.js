import {makeDeclarationRule} from './vocabulary.js'

const OF_SUFFIX = /.Of$/

const LANGUAGE_NAMES = ['valueOf', 'indexOf', 'lastIndexOf', 'getPrototypeOf', 'setPrototypeOf']

const FOREIGN_KEYS = ['allOf', 'anyOf', 'oneOf', 'isPartOf']

const OPENCODE_COPIES = [
  'packages/plugin-host/src/',
  'packages/plugin/src/',
  'apps/conciv/src/runtime/plugin/',
  'apps/conciv/src/runtime/persistence/',
  'apps/conciv/src/runtime/server/',
]

const ALLOWED_NAMES = [...LANGUAGE_NAMES, ...FOREIGN_KEYS]

export default makeDeclarationRule({
  exemptFiles: OPENCODE_COPIES,
  message:
    "'{{name}}' ends in 'Of': name a function with a verb first that says what its body does (readApprovalAsk, not approvalAskOf).",
  violation: (identifier) =>
    OF_SUFFIX.test(identifier.name) && !ALLOWED_NAMES.includes(identifier.name) ? {name: identifier.name} : undefined,
})
