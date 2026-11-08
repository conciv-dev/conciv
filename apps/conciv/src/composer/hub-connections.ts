import {useMutation, useMutationState, useQueryClient} from '@tanstack/solid-query'
import {intersectionWith, isEqual} from 'es-toolkit'
import type {ChatModels} from '@conciv/protocol/chat-types'
import {useAppData, useRpc} from '../app/context.js'
import {useSessionModels} from '../data/harness-meta.js'
import {useNotices} from '../shell/notice-context.js'

type HubInstall = ChatModels['hubInstalls'][number]
type HubConnection = ChatModels['hubConnections'][number]

export function useHubConnections(sessionId: () => string) {
  const rpc = useRpc()
  const appData = useAppData()
  const queryClient = useQueryClient()
  const notices = useNotices()
  const models = useSessionModels(sessionId)
  const installs = (): HubInstall[] => (models.isSuccess ? models.data.hubInstalls : [])
  const connections = (): HubConnection[] => (models.isSuccess ? models.data.hubConnections : [])
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
  const refresh = () => queryClient.invalidateQueries({queryKey: appData.utils.meta.models.key()})
  const connect = useMutation(() => ({
    mutationKey: connectKey,
    mutationFn: (input: {harness: HubInstall['harnessId']}) => rpc.meta.connectHub(input),
    onSuccess: async (outcome, input) => {
      if (!outcome.ok) {
        notices.notify(outcome.message, {tone: 'warn'})
        return
      }
      const name = nameOf(installs(), input.harness)
      notices.notify(`${name} connected. Ask any ${name} session for your conciv tab.`)
      await refresh()
    },
    onError: (_error: unknown, input) =>
      notices.notify(`Couldn’t connect ${nameOf(installs(), input.harness)}. Try again.`, {tone: 'warn'}),
  }))
  const disconnect = useMutation(() => ({
    mutationKey: disconnectKey,
    mutationFn: (input: {harness: HubConnection['harnessId']}) => rpc.meta.disconnectHub(input),
    onSuccess: async (outcome, input) => {
      if (!outcome.ok) {
        notices.notify(outcome.message, {tone: 'warn'})
        return
      }
      notices.notify(`${nameOf(connections(), input.harness)} disconnected.`)
      await refresh()
    },
    onError: (_error: unknown, input) =>
      notices.notify(`Couldn’t disconnect ${nameOf(connections(), input.harness)}. Try again.`, {tone: 'warn'}),
  }))
  return {
    installs,
    connections,
    connecting: (): HubInstall[] => intersectionWith(installs(), pendingConnects(), isInputFor),
    disconnecting: (): HubConnection[] => intersectionWith(connections(), pendingDisconnects(), isInputFor),
    connect: (install: HubInstall) => connect.mutate({harness: install.harnessId}),
    disconnect: (connection: HubConnection, onSettled: () => void) =>
      disconnect.mutate({harness: connection.harnessId}, {onSettled}),
  }
}

function isInputFor(agent: {harnessId: string}, variables: unknown): boolean {
  return isEqual(variables, {harness: agent.harnessId})
}

function nameOf(agents: Array<{harnessId: string; name: string}>, harnessId: string): string {
  return agents.find((agent) => agent.harnessId === harnessId)?.name ?? harnessId
}
