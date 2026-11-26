import type {JobInfo, JobRecovery, JobWaitInput, JobWaitResult} from '../effect/job.js'

export type JobStartInput = {
  readonly id: string
  readonly type: string
  readonly title?: string
  readonly metadata?: Record<string, unknown>
  readonly recovery?: JobRecovery
  readonly background?: boolean
  readonly run: () => Promise<string>
  readonly cancel?: () => Promise<void>
}

export interface JobDomain {
  readonly start: (input: JobStartInput) => Promise<JobInfo>
  readonly get: (id: string) => Promise<JobInfo | undefined>
  readonly wait: (input: JobWaitInput) => Promise<JobWaitResult>
  readonly cancel: (id: string) => Promise<JobInfo | undefined>
}
