import type {PageQueueResult} from './rpc.js'

export function queueNotice(result: PageQueueResult): string {
  return `queue ${result.queueId} ${result.status}: ${result.played} played, ${result.failed} failed\n${JSON.stringify(result)}`
}
