import type {RequestOptions} from './domains.js'
import type {Ref} from './model.js'
import type {Json} from './storage.js'

export interface GenerateUsage {
  input?: number
  output?: number
}

export type GenerateNative = {[key: string]: Json}

export interface GenerateTextInput {
  readonly prompt: string
  readonly model?: Ref | null | undefined
}

export interface GenerateImageInput {
  readonly model: Ref
  readonly prompt: string
  readonly images?: ReadonlyArray<{readonly data: string; readonly mime: string; readonly name?: string}> | undefined
  readonly n?: number | undefined
  readonly aspect?: `${number}${':'}${number}` | undefined
  readonly resolution?: ('1K' | '2K' | '4K' | (string & {})) | undefined
}

export interface GenerateImageResult {
  images: Array<{type: 'image'; data: string; mime: string; name?: string}>
  cost?: number
  tokens?: GenerateUsage
  native?: GenerateNative
}

export interface GenerateDecisionsInput {
  readonly model: Ref
  readonly input: ReadonlyArray<
    | {readonly type: 'text'; readonly text: string}
    | {readonly type: 'json'; readonly value: Json}
    | {readonly type: 'file'; readonly data: string; readonly mime: string; readonly name?: string}
  >
  readonly questions: ReadonlyArray<
    | {
        readonly type: 'predicate'
        readonly name: string
        readonly instructions: string
        readonly criteria?: {readonly true?: string; readonly false?: string}
      }
    | {
        readonly type: 'choice'
        readonly name: string
        readonly instructions: string
        readonly choices: ReadonlyArray<{readonly value: string | boolean; readonly description?: string}>
      }
    | {
        readonly type: 'score'
        readonly name: string
        readonly instructions: string
        readonly levels: ReadonlyArray<{readonly label: string; readonly description?: string}>
      }
  >
}

export type GenerateChoiceValue = string | boolean

export type GenerateDecisionAnswer =
  | {type: 'predicate'; name: string; probability: number}
  | {
      type: 'choice'
      name: string
      choice: GenerateChoiceValue
      probabilities: Array<{value: GenerateChoiceValue; probability: number}>
      confidence: number
    }
  | {
      type: 'score'
      name: string
      score: number
      probabilities: Array<{value: number; label: string; probability: number}>
      confidence: number
    }
  | {type: 'error'; name: string; reason: string; message?: string}

export interface GenerateDecisionResult {
  answers: Array<GenerateDecisionAnswer>
  cost?: number
  tokens?: GenerateUsage
  native?: GenerateNative
}

export interface ExperimentalGenerateApi {
  readonly text: (input: GenerateTextInput, requestOptions?: RequestOptions) => Promise<{text: string}>
  readonly image: (input: GenerateImageInput, requestOptions?: RequestOptions) => Promise<GenerateImageResult>
  readonly decisions: (
    input: GenerateDecisionsInput,
    requestOptions?: RequestOptions,
  ) => Promise<GenerateDecisionResult>
}
