import type {PageQueueResult} from '@conciv/protocol/page-types'

export function queueNotice(result: PageQueueResult): string {
  return `queue ${result.queueId} ${result.status}: ${result.played} played, ${result.failed} failed\n${JSON.stringify(result)}`
}
