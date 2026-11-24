import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {execa} from 'execa'
import {parseSync, Visitor, type CallExpression, type Expression, type Super} from 'oxc-parser'
import {z} from 'zod'
import {findOwner, readWorkspacePackages} from './workspace.ts'

const BUDGET_FILE = 'test-budget.json'
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/
const FIXTURE_SEGMENT = /(^|\/)fixtures\//
const TEST_FUNCTIONS = ['test', 'it']
const EFFECT_TEST_FACTORY = 'testEffect'
const EFFECT_RUNNERS = new Set(['live', 'effect'])
const CASE_MODIFIERS = new Set([
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
])

const budgetSchema = z.record(z.string(), z.number().int().nonnegative())

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

function countTestCases(filename: string, source: string): number {
  const parsed = parseSync(filename, source)
  const [error] = parsed.errors
  if (error) throw new Error(`${filename}: cannot parse - ${error.message}`)
  const testNames = new Set(TEST_FUNCTIONS)
  const effectTests = new Set<string>()
  const curried = new Set<CallExpression>()
  let count = 0
  const visitor = new Visitor({
    VariableDeclarator(node) {
      if (node.id.type !== 'Identifier' || node.init?.type !== 'CallExpression') return
      if (node.init.callee.type === 'Identifier' && node.init.callee.name === EFFECT_TEST_FACTORY)
        effectTests.add(node.id.name)
      const chain = readTestChain(node.init.callee)
      if (chain && testNames.has(chain.name) && chain.members.includes('extend')) testNames.add(node.id.name)
    },
    CallExpression(node) {
      if (node.callee.type === 'CallExpression') curried.add(node.callee)
      if (curried.has(node)) return
      const chain = readTestChain(node.callee)
      if (!chain) return
      if (effectTests.has(chain.name)) {
        const [runner, ...modifiers] = chain.members.toReversed()
        if (runner && EFFECT_RUNNERS.has(runner) && modifiers.every((member) => CASE_MODIFIERS.has(member))) count++
        return
      }
      if (testNames.has(chain.name) && chain.members.every((member) => CASE_MODIFIERS.has(member))) count++
    },
  })
  visitor.visit(parsed.program)
  return count
}

async function trackedTestFiles(cwd: string): Promise<string[]> {
  const {stdout} = await execa('git', ['ls-files', '-z'], {cwd})
  return stdout.split('\0').filter((path) => TEST_FILE.test(path) && !FIXTURE_SEGMENT.test(path))
}

async function countTestCasesByPackage(cwd: string): Promise<Map<string, number>> {
  const [packages, files] = await Promise.all([readWorkspacePackages(cwd), trackedTestFiles(cwd)])
  const counts = new Map<string, number>()
  for (const path of files) {
    const owner = findOwner(packages, path)
    if (!owner) continue
    const name = owner.manifest.name ?? owner.relativeDir
    const cases = countTestCases(path, await readFile(join(cwd, path), 'utf8'))
    counts.set(name, (counts.get(name) ?? 0) + cases)
  }
  return new Map([...counts].filter(([, cases]) => cases > 0).toSorted(([a], [b]) => a.localeCompare(b)))
}

async function readBudget(cwd: string): Promise<Record<string, number>> {
  const path = join(cwd, BUDGET_FILE)
  const result = budgetSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
  if (!result.success) throw new Error(`${path}: expected {"<package name>": <test count>}\n${result.error.message}`)
  return result.data
}

export async function assertTestsWithinBudget(cwd: string): Promise<string[]> {
  const [counts, budget] = await Promise.all([countTestCasesByPackage(cwd), readBudget(cwd)])
  const names = [...new Set([...counts.keys(), ...Object.keys(budget)])].toSorted()
  const over = names.flatMap((name) => {
    const cases = counts.get(name) ?? 0
    const allowed = budget[name] ?? 0
    return cases > allowed ? [`${name}: ${cases} tests, budget ${allowed}`] : []
  })
  if (over.length > 0) {
    throw new Error(
      [
        `a package has more tests than ${BUDGET_FILE} allows:`,
        ...over,
        '',
        'The budget is a review gate, not a counter to bump. Before you raise any number:',
        '1. List every new test case in the package over its budget: file and test name.',
        '2. For each one, name the existing test or suite you checked and say why it does not already cover this.',
        '3. Fold it into an existing journey test when one fits: one journey, not one test per behaviour.',
        `4. Only a test that survives this gets a raised number in ${BUDGET_FILE}, and the PR body carries this account, test by test, for the maintainer to approve.`,
      ].join('\n'),
    )
  }
  return names.flatMap((name) => {
    const cases = counts.get(name) ?? 0
    const allowed = budget[name] ?? 0
    return cases < allowed ? [`${name}: ${cases} tests, budget ${allowed}: lower it to ${cases} in ${BUDGET_FILE}`] : []
  })
}
