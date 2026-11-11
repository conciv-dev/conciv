import type {storeTables} from '../server/runs/store-tables.js'
import type {Ballot, Design, DESIGN_VERDICTS, IdTree, Mapping, Round, TargetRecord, Widget} from './defs.js'
import type {Component, Ranked} from './catalog-defs.js'
import type {ToolReply} from './tool-reply.js'

export type Store = {
  put(input: {
    design: Design
    image: Uint8Array
    session: string
    route?: string
    widget?: Widget
    notes?: string[]
  }): Promise<TargetRecord>
  design(id: string): Promise<Design>
  image(input: {id: string; round?: number; kind?: 'live' | 'diff'}): Promise<Uint8Array | null>
  mapping(id: string): Promise<Mapping>
  sources(id: string): Promise<string[]>
  writeVotes(input: {id: string; round: number; votes: Ballot[]}): Promise<void>
  writeToolCall(input: ToolCall & {session: string; round: number | null}): Promise<void>
  runRound(session: string): Promise<number | null>
  writeLabel(input: Label): Promise<void>
  ids(input: {id: string; round?: number}): Promise<IdTree | null>
  looks(id: string): Promise<Look[]>
  writeRelation(input: {id: string; round: number; tree: IdTree}): Promise<Map<string, Component>>
  relation(input: {id: string; round: number}): Promise<Map<string, Ranked>>
  unsettledCount(id: string): Promise<number>
  writeUnsettledCount(input: {id: string; count: number}): Promise<void>
  writeRound(input: {
    id: string
    round: Round
    live: Uint8Array
    diff: Uint8Array
    notes?: string[]
    ids?: {tree: IdTree; revoted: Record<string, string>}
    artifacts?: {design: Uint8Array; shots: {width: number; png: Uint8Array}[]}
  }): Promise<Round>
  round(input: {id: string; round: number}): Promise<Round | null>
  rounds(id: string): Promise<Round[]>
  current(session: string): Promise<TargetRecord | null>
  variants(session: string): Promise<TargetRecord[]>
  reroute(input: {session: string; route: string}): Promise<void>
  group(ids: string[]): Promise<void>
  list(): Promise<TargetRecord[]>
}

type ToolCall = {
  tool: string
  input: unknown
  reply: ToolReply | null
  replyBytes: number | null
  durationMs: number
  error: string | null
}

type Label = {
  target: string
  round: number
  node: string
  id: string
  verdict: (typeof DESIGN_VERDICTS)[number]
  by: string
}

type Look = Omit<(typeof storeTables)['nodes']['$inferSelect'], 'seq' | 'target_id' | 'run_id'>
