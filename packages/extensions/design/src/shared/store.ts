import type {designTables} from '../server/tables.js'
import type {Ballot, Design, IdTree, Mapping, Round, TargetRecord} from './defs.js'

export type Store = {
  put(input: {
    design: Design
    image: Uint8Array
    session: string
    route?: string
    notes?: string[]
  }): Promise<TargetRecord>
  design(id: string): Promise<Design>
  image(input: {id: string; round?: number; kind?: 'live' | 'diff'}): Promise<Uint8Array | null>
  mapping(id: string): Promise<Mapping>
  writeVotes(input: {id: string; round: number; votes: Ballot[]}): Promise<void>
  writeToolCall(input: ToolCall & {session: string; round: number | null}): Promise<void>
  ids(input: {id: string; round?: number}): Promise<IdTree | null>
  looks(id: string): Promise<Look[]>
  unsettledCount(id: string): Promise<number>
  writeUnsettledCount(input: {id: string; count: number}): Promise<void>
  writeRound(input: {
    id: string
    round: Round
    live: Uint8Array
    diff: Uint8Array
    notes?: string[]
    ids?: {tree: IdTree; revoted: Record<string, string>}
  }): Promise<Round>
  round(input: {id: string; round: number}): Promise<Round | null>
  rounds(id: string): Promise<Round[]>
  clear(id: string): Promise<void>
  current(session: string): Promise<TargetRecord | null>
  list(): Promise<TargetRecord[]>
}

type ToolCall = {tool: string; input: unknown; replyBytes: number | null; durationMs: number; error: string | null}

type Look = Omit<ReturnType<typeof designTables>['nodes']['$inferSelect'], 'seq' | 'target_id' | 'run_id'>
