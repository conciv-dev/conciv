import {useChatDeps} from './context.js'
import {useNotices} from '../shell/notice-context.js'
import {makeGrabStaging, type GrabStaging} from '../pane/grab-staging.js'
import {resolveGrabSource} from '../pane/grab-source-resolve.js'

export function useGrabStaging(): GrabStaging {
  const {rpc} = useChatDeps()
  const notices = useNotices()
  return makeGrabStaging({
    ground: (grab) => resolveGrabSource(grab, (input) => rpc.page.symbolicate(input)),
    fail: (message, error) => {
      console.error(`[conciv] ${message}`, error)
      notices.notify(message, {tone: 'danger', key: message})
    },
  })
}
