import {existsSync} from 'node:fs'
import {dirname, join, relative, sep} from 'node:path'

const PLAYWRIGHT_TEST = '@playwright/test'
const WORKSPACE_MARKER = 'pnpm-workspace.yaml'
const E2E_FOLDER = 'e2e'

function findWorkspaceRoot(directory) {
  if (existsSync(join(directory, WORKSPACE_MARKER))) return directory
  const parent = dirname(directory)
  if (parent === directory) return undefined
  return findWorkspaceRoot(parent)
}

function isUnderE2e(filename) {
  const root = findWorkspaceRoot(dirname(filename))
  if (root === undefined) return false
  return relative(root, filename).split(sep)[0] === E2E_FOLDER
}

function importsPlaywrightTest(node) {
  const source = node.source?.value
  if (typeof source !== 'string') return false
  return source === PLAYWRIGHT_TEST || source.startsWith(`${PLAYWRIGHT_TEST}/`)
}

function reportOutsideE2e(node, context) {
  if (importsPlaywrightTest(node) && !isUnderE2e(context.filename)) context.report({node, messageId: 'outsideE2e'})
}

export default {
  meta: {
    type: 'problem',
    messages: {
      outsideE2e:
        "Import @playwright/test only under the workspace's e2e/ apps. Everything else tests with vitest: node, happy-dom or vitest browser mode through @conciv/plugin-testkit.",
    },
    schema: [],
  },
  createOnce(context) {
    return {
      ImportDeclaration(node) {
        reportOutsideE2e(node, context)
      },
      ExportNamedDeclaration(node) {
        reportOutsideE2e(node, context)
      },
      ExportAllDeclaration(node) {
        reportOutsideE2e(node, context)
      },
      ImportExpression(node) {
        reportOutsideE2e(node, context)
      },
    }
  },
}
