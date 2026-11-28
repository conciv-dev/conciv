import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {execa} from 'execa'
import {parseSync, Visitor, type CallExpression, type Expression, type Super} from 'oxc-parser'
import {findOwner, readWorkspacePackages, type WorkspacePackage} from './workspace.ts'
import {publishErrors} from './errors/errors.ts'

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/
const FIXTURE_SEGMENT = /(^|\/)fixtures\//
const TEST_FUNCTIONS = ['test', 'it']
const CASE_MODIFIERS = [
  'concurrent',
  'sequential',
  'skip',
  'only',
  'todo',
  'fails',
  'fail',
  'fixme',
  'each',
  'for',
  'skipIf',
  'runIf',
  'effect',
  'live',
  'scoped',
  'scopedLive',
  'prop',
]

type TestChain = {name: string; members: string[]}

function readTestChain(callee: Expression | Super): TestChain | undefined {
  const members: string[] = []
  let node: Expression | Super = callee
  while (node.type === 'MemberExpression' || node.type === 'CallExpression') {
    if (node.type === 'CallExpression') {
      node = node.callee
      continue
    }
    if (node.computed || node.property.type !== 'Identifier') return undefined
    members.push(node.property.name)
    node = node.object
  }
  return node.type === 'Identifier' ? {name: node.name, members} : undefined
}

function wrapsTest(call: CallExpression, testNames: Set<string>): boolean {
  const [wrapped] = call.arguments
  if (!wrapped || wrapped.type === 'SpreadElement') return false
  const chain = readTestChain(wrapped)
  return chain !== undefined && testNames.has(chain.name)
}

function makesTest(call: CallExpression, testNames: Set<string>): boolean {
  const chain = readTestChain(call.callee)
  if (chain === undefined) return false
  if (chain.name === 'makeMethods') return wrapsTest(call, testNames)
  return testNames.has(chain.name) && chain.members.includes('extend')
}

function countTestCases(filename: string, source: string): number {
  const parsed = parseSync(filename, source)
  const [error] = parsed.errors
  if (error) throw publishErrors.TEST_FILE_UNPARSABLE({filename, reason: error.message})
  const testNames = new Set(TEST_FUNCTIONS)
  const curried = new Set<CallExpression>()
  let count = 0
  const visitor = new Visitor({
    ImportSpecifier(node) {
      if (node.imported.type === 'Identifier' && TEST_FUNCTIONS.includes(node.imported.name))
        testNames.add(node.local.name)
    },
    VariableDeclarator(node) {
      if (node.id.type !== 'Identifier' || node.init?.type !== 'CallExpression') return
      if (makesTest(node.init, testNames)) testNames.add(node.id.name)
    },
    CallExpression(node) {
      if (node.callee.type === 'CallExpression') curried.add(node.callee)
      if (curried.has(node)) return
      const chain = readTestChain(node.callee)
      if (chain && testNames.has(chain.name) && chain.members.every((member) => CASE_MODIFIERS.includes(member)))
        count++
    },
  })
  visitor.visit(parsed.program)
  return count
}

async function trackedTestFiles(cwd: string): Promise<string[]> {
  const {stdout} = await execa('git', ['ls-files', '-z'], {cwd})
  return stdout.split('\0').filter((path) => TEST_FILE.test(path) && !FIXTURE_SEGMENT.test(path))
}

type PackageBudget = {name: string; manifest: string; cases: number; budget: number}

async function readPackageBudgets(cwd: string): Promise<PackageBudget[]> {
  const [packages, files] = await Promise.all([readWorkspacePackages(cwd), trackedTestFiles(cwd)])
  const counts = new Map<WorkspacePackage, number>()
  for (const path of files) {
    const owner = findOwner(packages, path)
    if (!owner) continue
    const cases = countTestCases(path, await readFile(join(cwd, path), 'utf8'))
    counts.set(owner, (counts.get(owner) ?? 0) + cases)
  }
  return packages
    .map((pkg) => ({
      name: pkg.manifest.name ?? pkg.relativeDir,
      manifest: join(pkg.relativeDir, 'package.json'),
      cases: counts.get(pkg) ?? 0,
      budget: pkg.manifest.conciv?.testBudget ?? 0,
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name))
}

export async function assertTestsWithinBudget(cwd: string): Promise<string[]> {
  const budgets = await readPackageBudgets(cwd)
  const over = budgets.filter(({cases, budget}) => cases > budget)
  if (over.length > 0) {
    throw publishErrors.OVER_BUDGET({
      lines: [
        'a package has more tests than its package.json "conciv.testBudget" allows:',
        ...over.map(({name, manifest, cases, budget}) => `${name}: ${cases} tests, budget ${budget} (${manifest})`),
        '',
        'The budget is a review gate, not a counter to bump. Before you raise any number:',
        '1. List every new test case in the package over its budget: file and test name.',
        '2. For each one, name the existing test or suite you checked and say why it does not already cover this.',
        '3. Fold it into an existing journey test when one fits: one journey, not one test per behaviour.',
        '4. Only a test that survives this gets a raised "conciv.testBudget" in its package.json, and the PR body carries this account, test by test, for the maintainer to approve.',
      ],
    })
  }
  return budgets
    .filter(({cases, budget}) => cases < budget)
    .map(
      ({name, manifest, cases, budget}) =>
        `${name}: ${cases} tests, budget ${budget}: lower "conciv.testBudget" to ${cases} in ${manifest}`,
    )
}
