import {until, type Kit} from '@conciv/harness-testkit'

export async function untilRunSettled(kit: Kit, sessionId: string): Promise<void> {
  await until(
    async () => {
      const metas = await kit.rpc.sessions.list(undefined)
      return (metas.find((meta) => meta.id === sessionId)?.status ?? 'idle') !== 'running'
    },
    {hangGuardMs: 5000},
  )
}
