import {Definition} from '@conciv/plugin-page/rpc'
import {useRpc} from './context.js'
import {useReportFailure} from '../shell/notice-context.js'
import {makeGrabStaging, type GrabStaging} from '../pane/grab-staging.js'
import {resolveGrabSource} from '../pane/grab-source-resolve.js'

export function useGrabStaging(): GrabStaging {
  const rpc = useRpc()
  const reportFailure = useReportFailure()
  return makeGrabStaging({
    ground: (grab) =>
      resolveGrabSource(grab, (input) =>
        rpc.plugin
          .call({rpcId: Definition.id, method: 'symbolicate', input})
          .then((answer) => Definition.methods.symbolicate.output.parse(answer)),
      ),
    fail: reportFailure,
  })
}
