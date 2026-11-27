import type {RouterContractClient} from '@orpc/contract'
import type {contract} from '@conciv/protocol'

type PluginList = Awaited<ReturnType<RouterContractClient<typeof contract>['plugin']['list']>>

export type PluginInfo = PluginList['data'][number]
