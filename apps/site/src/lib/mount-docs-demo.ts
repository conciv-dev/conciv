import {mountPlayground} from '@/playground/shell-api'

export function mountDocsDemo(host: HTMLElement): () => void {
  return mountPlayground({
    host,
    script: 'docs/ask',
    editPage: () => undefined,
    onFailure: (error) => console.error('conciv docs demo did not start', error),
  }).stop
}
