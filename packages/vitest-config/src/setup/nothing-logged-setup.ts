import {afterEach, beforeEach} from 'vitest'
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

beforeEach(() => {
  loggedLines.length = 0
})

afterEach(({task}) => {
  if (!isNewLayerTestFile(task.file.filepath)) return
  const expected = readExpectedLog(task)
  const unexpected = loggedLines.filter((line) => !expected.some((pattern) => pattern.test(line)))
  if (unexpected.length === 0) return
  throw new Error(
    [
      'This test printed console lines it did not declare:',
      ...unexpected.map((line) => `  ${line}`),
      'Declare each expected line with the expectLog(pattern) fixture from @conciv/plugin-testkit.',
    ].join('\n'),
  )
})
