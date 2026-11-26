import type {ContractRouterClient} from '@orpc/contract'
import type {contract} from '@conciv/protocol'

type PluginList = Awaited<ReturnType<ContractRouterClient<typeof contract>['plugin']['list']>>

export type PluginInfo = PluginList['data'][number]
