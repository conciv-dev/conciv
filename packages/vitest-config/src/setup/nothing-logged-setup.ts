import {aroundAll, beforeEach, expect} from 'vitest'
import {readExpectedLog} from '../expected-log.ts'
import {isNewLayerTestFile} from '../new-layer.ts'

type LogLevel = 'error' | 'warn'

const loggedLines: string[] = []

function describeArgument(argument: unknown): string {
  if (argument instanceof Error) return argument.message
  if (typeof argument === 'object' && argument !== null) return Object.prototype.toString.call(argument)
  return String(argument)
}

function recordLevel(level: LogLevel): void {
  const write = console[level]
  console[level] = (...data: unknown[]) => {
    loggedLines.push(`console.${level}: ${data.map(describeArgument).join(' ')}`)
    write(...data)
  }
}

recordLevel('error')
recordLevel('warn')

function failOnUnexpected(lines: string[], expected: RegExp[], heading: string): void {
  const unexpected = lines.filter((line) => !expected.some((pattern) => pattern.test(line)))
  if (unexpected.length === 0) return
  throw new Error(
    [
      heading,
      ...unexpected.map((line) => `  ${line}`),
      'Declare each expected line with the expectLog(pattern) fixture from @conciv/plugin-testkit.',
    ].join('\n'),
  )
}

beforeEach(({task, onTestFinished}) => {
  loggedLines.length = 0
  onTestFinished(() => {
    const lines = loggedLines.splice(0)
    if (!isNewLayerTestFile(task.file.filepath)) return
    failOnUnexpected(lines, readExpectedLog(task), 'This test printed console lines it did not declare:')
  })
})

aroundAll(async (runSuite) => {
  await runSuite()
  const lines = loggedLines.splice(0)
  const {testPath} = expect.getState()
  if (testPath === undefined) throw new Error('the nothing-logged guard ran after a file without knowing its path')
  if (!isNewLayerTestFile(testPath)) return
  failOnUnexpected(lines, [], 'This file printed console lines outside its tests, after its last test checked:')
})
