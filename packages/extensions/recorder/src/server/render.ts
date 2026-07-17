import type {Keyframe, RrwebEvent} from '../shared/protocol.js'

export type KeyframeRenderer = {
  render(events: RrwebEvent[], timestamps: number[]): Promise<Keyframe[]>
  dispose(): Promise<void>
}

export async function createChromiumRenderer(): Promise<KeyframeRenderer | null> {
  return null
}
