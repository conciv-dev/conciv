import type {ModelOption} from '../src/primitives/model-selector/model-selector.js'

export const HARNESS_MODELS: readonly ModelOption[] = [
  {id: 'claude-opus-4-8', name: 'Claude Opus 4.8', description: 'Most capable'},
  {id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Balanced speed and depth'},
  {id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', description: 'Fastest'},
]
