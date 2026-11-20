import type {TaskMeta} from 'vitest'

type ExpectedLogPattern = {source: string; flags: string}

declare module 'vitest' {
  interface TaskMeta {
    expectedLogPatterns?: ExpectedLogPattern[]
  }
}

export function declareExpectedLog(task: {readonly meta: TaskMeta}, pattern: RegExp): void {
  task.meta.expectedLogPatterns = [
    ...(task.meta.expectedLogPatterns ?? []),
    {source: pattern.source, flags: pattern.flags},
  ]
}

export function readExpectedLog(task: {readonly meta: TaskMeta}): RegExp[] {
  return (task.meta.expectedLogPatterns ?? []).map(({source, flags}) => new RegExp(source, flags))
}
