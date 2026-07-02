import {pipeline, env, type TextGenerationPipeline} from '@huggingface/transformers'
import {DEFAULT_MODEL, type CssPatch, type LoadProgress, type RunResult} from './models'

env.allowLocalModels = false
env.useBrowserCache = true

const ALLOWED = new Set([
  'fontSize',
  'fontWeight',
  'fontStyle',
  'color',
  'backgroundColor',
  'letterSpacing',
  'lineHeight',
  'opacity',
  'borderRadius',
  'boxShadow',
  'padding',
  'paddingLeft',
  'paddingRight',
  'textAlign',
  'textTransform',
  'textDecoration',
  'height',
])

const PX_PROPS = new Set([
  'fontSize',
  'letterSpacing',
  'borderRadius',
  'padding',
  'paddingLeft',
  'paddingRight',
  'height',
])

type ProgressEvent = {status: string; file?: string; progress?: number; loaded?: number; total?: number}

let pipe: Promise<TextGenerationPipeline> | null = null
let activeModel = DEFAULT_MODEL
let device: 'webgpu' | 'wasm' = 'wasm'

const hasWebGpu = () => typeof navigator !== 'undefined' && 'gpu' in navigator

export const getDevice = () => device

export function loadModel(modelId: string, onProgress: (p: LoadProgress) => void): Promise<TextGenerationPipeline> {
  if (pipe && activeModel === modelId) return pipe
  if (pipe) void pipe.then((p) => p.dispose()).catch(() => {})
  activeModel = modelId
  device = hasWebGpu() ? 'webgpu' : 'wasm'
  pipe = pipeline('text-generation', modelId, {
    device,
    dtype: device === 'webgpu' ? 'q4f16' : 'q4',
    progress_callback: (event: ProgressEvent) => {
      if (event.status !== 'progress') return
      onProgress({
        file: event.file ?? '',
        progress: event.progress ?? 0,
        loaded: event.loaded ?? 0,
        total: event.total ?? 0,
      })
    },
  })
  return pipe
}

const SYSTEM =
  'You turn one instruction into the smallest possible change for a single element. ' +
  'Reply with ONLY a compact JSON object. Use camelCase CSS properties for styling, ' +
  'and a "text" key to replace the element\'s visible text. ' +
  'Include ONLY what the instruction explicitly asks to change — never add anything the user did not mention. ' +
  'Sizes are numbers in px. Colors are CSS color names or hex. No prose, no markdown.'

const SHOTS = [
  {role: 'user', content: 'Element: <button>Buy now</button>\nInstruction: make it red'},
  {role: 'assistant', content: '{"backgroundColor":"red"}'},
  {role: 'user', content: 'Element: <h1>Title</h1>\nInstruction: make it much bigger and bold'},
  {role: 'assistant', content: '{"fontSize":48,"fontWeight":700}'},
  {role: 'user', content: 'Element: <p>Hello there</p>\nInstruction: make the text green'},
  {role: 'assistant', content: '{"color":"green"}'},
  {role: 'user', content: 'Element: <span>Save</span>\nInstruction: make it italic'},
  {role: 'assistant', content: '{"fontStyle":"italic"}'},
  {role: 'user', content: 'Element: <a>Home</a>\nInstruction: underline it'},
  {role: 'assistant', content: '{"textDecoration":"underline"}'},
  {role: 'user', content: 'Element: <h2>Welcome</h2>\nInstruction: change the text to "Hi there"'},
  {role: 'assistant', content: '{"text":"Hi there"}'},
  {role: 'user', content: 'Element: <p>Old copy</p>\nInstruction: rename it to Dashboard and make it bold'},
  {role: 'assistant', content: '{"text":"Dashboard","fontWeight":700}'},
]

const buildPrompt = (html: string, instruction: string) => [
  {role: 'system', content: SYSTEM},
  ...SHOTS,
  {role: 'user', content: `Element: ${html}\nInstruction: ${instruction}`},
]

const extractJson = (text: string): unknown => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`no JSON object in output:\n${text}`)
  return JSON.parse(text.slice(start, end + 1))
}

const ENUMS: Record<string, Set<string>> = {
  fontStyle: new Set(['normal', 'italic', 'oblique']),
  textDecoration: new Set(['none', 'underline', 'line-through', 'overline']),
  textAlign: new Set(['left', 'center', 'right', 'justify']),
  textTransform: new Set(['none', 'uppercase', 'lowercase', 'capitalize']),
}

const FONT_WEIGHTS: Record<string, number> = {
  lighter: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  bolder: 800,
}

const repair = (key: string, value: unknown): string | number | null => {
  if (PX_PROPS.has(key)) {
    const numeric = typeof value === 'number' ? value : Number(String(value).replace(/px$/, ''))
    return Number.isFinite(numeric) ? numeric : null
  }
  if (key === 'fontWeight') {
    if (typeof value === 'number') return value
    const name = String(value).toLowerCase()
    return FONT_WEIGHTS[name] ?? (/^\d{3}$/.test(name) ? Number(name) : null)
  }
  if (ENUMS[key]) {
    const name = String(value).toLowerCase()
    return ENUMS[key].has(name) ? name : null
  }
  return String(value)
}

const sanitize = (raw: unknown): CssPatch =>
  Object.entries(raw as Record<string, unknown>)
    .filter(([key]) => ALLOWED.has(key))
    .reduce<CssPatch>((acc, [key, value]) => {
      const fixed = repair(key, value)
      return fixed === null ? acc : {...acc, [key]: fixed}
    }, {})

const extractText = (raw: unknown): string | undefined => {
  const text = (raw as Record<string, unknown>).text
  return typeof text === 'string' && text.trim().length > 0 && text.length <= 120 ? text : undefined
}

const parse = (raw: string): {patch: CssPatch; text?: string} => {
  const parsed = extractJson(raw)
  return {patch: sanitize(parsed), text: extractText(parsed)}
}

const stripThink = (text: string) => text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '')

type ChatTemplateOptions = NonNullable<Parameters<TextGenerationPipeline['tokenizer']['apply_chat_template']>[1]>

const TEMPLATE_OPTIONS: ChatTemplateOptions & {enable_thinking: boolean} = {
  tokenize: false,
  add_generation_prompt: true,
  enable_thinking: false,
}

const generate = async (generator: TextGenerationPipeline, html: string, instruction: string): Promise<string> => {
  const messages = buildPrompt(html, instruction)
  const prompt = generator.tokenizer.apply_chat_template(messages, TEMPLATE_OPTIONS)
  if (typeof prompt !== 'string') throw new Error('chat template did not produce a string prompt')
  const output = await generator(prompt, {max_new_tokens: 160, do_sample: false, return_full_text: false})
  const first = [output].flat(2)[0]
  const generated = first?.generated_text
  if (typeof generated !== 'string') throw new Error('model returned a non-text generation')
  return stripThink(generated)
}

export async function instructionToPatch(html: string, instruction: string): Promise<RunResult> {
  const generator = await loadModel(activeModel, () => {})
  const started = performance.now()
  let raw = await generate(generator, html, instruction)
  let parsed: {patch: CssPatch; text?: string}
  try {
    parsed = parse(raw)
  } catch {
    raw = await generate(generator, html, instruction)
    parsed = parse(raw)
  }
  return {...parsed, raw, ms: performance.now() - started}
}
