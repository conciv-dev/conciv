import {useMutation, useMutationState, useQuery, useQueryClient} from '@tanstack/solid-query'
import {z} from 'zod'
import type {HubAgents} from '@conciv/protocol/chat-types'
import {useAppData, useRpc} from '../app/context.js'
import {useNotices} from '../shell/notice-context.js'

type HubInstall = HubAgents['installs'][number]
type HubConnection = HubAgents['connections'][number]

const HUB_AGENTS_REFRESH_MS = 3000

const PendingAgentSchema = z.object({harnessId: z.string(), name: z.string()})

type PendingAgent = z.infer<typeof PendingAgentSchema>

export function useHubConnections() {
  const rpc = useRpc()
  const appData = useAppData()
  const queryClient = useQueryClient()
  const notices = useNotices()
  const agents = useQuery(() =>
    appData.utils.meta.hubAgents.queryOptions({refetchInterval: HUB_AGENTS_REFRESH_MS, refetchOnWindowFocus: true}),
  )
  const installs = (): HubInstall[] => (agents.isSuccess ? agents.data.installs : [])
  const connections = (): HubConnection[] => (agents.isSuccess ? agents.data.connections : [])
  const connectKey = appData.utils.meta.connectHub.mutationKey()
  const disconnectKey = appData.utils.meta.disconnectHub.mutationKey()
  const pendingConnects = useMutationState(() => ({
    filters: {mutationKey: connectKey, status: 'pending'},
    select: (mutation) => mutation.state.variables,
  }))
  const pendingDisconnects = useMutationState(() => ({
    filters: {mutationKey: disconnectKey, status: 'pending'},
    select: (mutation) => mutation.state.variables,
  }))
  const refresh = () => queryClient.invalidateQueries({queryKey: appData.utils.meta.hubAgents.key()})
  const connect = useMutation(() => ({
    mutationKey: connectKey,
    mutationFn: (agent: HubInstall) => rpc.meta.connectHub({harness: agent.harnessId}),
    onSuccess: async (outcome, agent) => {
      if (!outcome.ok) {
        notices.notify(outcome.message, {tone: 'warn'})
        return
      }
      notices.notify(`${agent.name} connected. Ask any ${agent.name} session for your conciv tab.`)
      await refresh()
    },
    onError: (_error: unknown, agent) => notices.notify(`Couldn’t connect ${agent.name}. Try again.`, {tone: 'warn'}),
  }))
  const disconnect = useMutation(() => ({
    mutationKey: disconnectKey,
    mutationFn: (agent: HubConnection) => rpc.meta.disconnectHub({harness: agent.harnessId}),
    onSuccess: async (outcome, agent) => {
      if (!outcome.ok) {
        notices.notify(outcome.message, {tone: 'warn'})
        return
      }
      const disconnected = `${agent.name} disconnected.`
      notices.notify(outcome.note === undefined ? disconnected : `${disconnected} ${outcome.note}`)
      await refresh()
    },
    onError: (_error: unknown, agent) =>
      notices.notify(`Couldn’t disconnect ${agent.name}. Try again.`, {tone: 'warn'}),
  }))
  const connecting = (): PendingAgent[] => pendingAgents(pendingConnects())
  const disconnecting = (): PendingAgent[] => pendingAgents(pendingDisconnects())
  return {
    installs,
    connections,
    connecting,
    disconnecting,
    busy: (harnessId: string): boolean =>
      [...connecting(), ...disconnecting()].some((agent) => agent.harnessId === harnessId),
    connect: (install: HubInstall) => connect.mutate(install),
    disconnect: (connection: HubConnection, onSettled: () => void) => disconnect.mutate(connection, {onSettled}),
  }
}

function pendingAgents(variables: unknown[]): PendingAgent[] {
  return variables.flatMap((value) => {
    const parsed = PendingAgentSchema.safeParse(value)
    return parsed.success ? [parsed.data] : []
  })
}
