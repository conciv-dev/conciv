export type ModelOption = {id: string; label: string; size: string; note?: string}

const SMOL_135: ModelOption = {
  id: 'HuggingFaceTB/SmolLM2-135M-Instruct',
  label: 'SmolLM2 135M',
  size: '~118MB',
  note: 'tiny',
}

export const MODELS: ModelOption[] = [
  SMOL_135,
  {id: 'HuggingFaceTB/SmolLM2-360M-Instruct', label: 'SmolLM2 360M', size: '~250MB'},
  {id: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct', label: 'Qwen2.5-Coder 0.5B', size: '~350MB', note: 'code-tuned'},
  {id: 'onnx-community/Qwen2.5-0.5B-Instruct', label: 'Qwen2.5 0.5B', size: '~350MB', note: 'baseline'},
  {id: 'onnx-community/Qwen3-0.6B-ONNX', label: 'Qwen3 0.6B', size: '~400MB', note: 'newest'},
  {id: 'onnx-community/Llama-3.2-1B-Instruct', label: 'Llama-3.2 1B', size: '~800MB', note: 'heavy'},
]

export const DEFAULT_MODEL = SMOL_135.id

export type CssPatch = Record<string, string | number>

export type LoadProgress = {file: string; progress: number; loaded: number; total: number}

export type RunResult = {patch: CssPatch; text?: string; raw: string; ms: number}

export type ModelWorkerRequest =
  | {type: 'load'; modelId: string}
  | {type: 'run'; id: number; html: string; instruction: string}

export type ModelWorkerResponse =
  | ({type: 'progress'} & LoadProgress)
  | {type: 'ready'; device: string; modelId: string}
  | {type: 'load-error'; error: string}
  | ({type: 'result'; id: number} & RunResult)
  | {type: 'run-error'; id: number; error: string}
