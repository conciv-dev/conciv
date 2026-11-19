import {useChatDeps} from './context.js'
import {useReportFailure} from '../shell/notice-context.js'
import {makeGrabStaging, type GrabStaging} from '../pane/grab-staging.js'
import {resolveGrabSource} from '../pane/grab-source-resolve.js'

export function useGrabStaging(): GrabStaging {
  const {rpc} = useChatDeps()
  const reportFailure = useReportFailure()
  return makeGrabStaging({
    ground: (grab) => resolveGrabSource(grab, (input) => rpc.page.symbolicate(input)),
    fail: reportFailure,
  })
}
