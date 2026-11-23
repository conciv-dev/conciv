import type {SessionId, TabOpen} from '@conciv/protocol/chat-types'

type TabsDeps = {
  pageTabs: (sessionId: SessionId) => Promise<{tabs: readonly unknown[]}>
  instructions: string
}

export function createTabs(deps: TabsDeps) {
  return {
    get: async (sessionId: SessionId): Promise<TabOpen> => ({
      open: (await deps.pageTabs(sessionId)).tabs.length > 0,
      instructions: deps.instructions === '' ? null : deps.instructions,
    }),
  }
}
