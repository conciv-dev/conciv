import {z} from 'zod'
import {codeDiscoverReply, codeExecuteReply, type CodeReply} from '@conciv/protocol'
import {makeRpcClient, type EngineClient} from '@conciv/client'
import {CONCIV_CLIENT_HEADER, CONCIV_ORIGIN_HEADER, SessionId} from '@conciv/types/chat-types'
import {externalCallProgram} from './call-tool.js'

const TERMINAL_CLIENT = 'terminal'

const AnsweredErrorSchema = z.object({defined: z.boolean(), code: z.string(), status: z.number(), message: z.string()})

export type OutsideAgent = {client?: string; tab?: string}

export type OutsideReply = CodeReply

export type Outside = {
  describe: () => Promise<{execute: string; discover: string | null}>
  discover: (toolNames: string[]) => Promise<OutsideReply>
  call: (name: string, input?: unknown) => Promise<OutsideReply>
}

function failedReply(error: unknown): OutsideReply {
  const answered = AnsweredErrorSchema.safeParse(error)
  if (!answered.success) throw error
  return {content: [{type: 'text', text: answered.data.message}], isError: true}
}

function replied(sent: Promise<CodeReply>): Promise<OutsideReply> {
  return sent.catch(failedReply)
}

function sessionInput(tab: string | undefined): {sessionId?: SessionId} {
  return tab === undefined ? {} : {sessionId: SessionId.parse(tab)}
}

export function outsideAgent(apiBase: string, token: string, agent: OutsideAgent = {}): Outside {
  const rpc: EngineClient = makeRpcClient(apiBase, {
    token,
    headers: {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: agent.client ?? TERMINAL_CLIENT},
  })
  const session = sessionInput(agent.tab)
  return {
    describe: () => rpc.code.describe(undefined),
    discover: (toolNames) => replied(rpc.code.discover({...session, toolNames}).then(codeDiscoverReply)),
    call: (name, input) =>
      Promise.try(() => externalCallProgram(name, input)).then((typescriptCode) =>
        replied(rpc.code.execute({...session, typescriptCode}).then(codeExecuteReply)),
      ),
  }
}
