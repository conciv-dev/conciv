import type {Framework} from './detect.js'
import type {FoundHarness, HarnessId} from './harness-detect.js'

export type FoundSelections = {framework: Framework; harnesses: FoundHarness[]}
export type ConfirmedSelections = {framework: boolean; harnesses: HarnessId[]}

export type PromptSelections = (found: FoundSelections) => Promise<ConfirmedSelections | 'cancelled'>

export async function confirmSelections(
  found: FoundSelections,
  yes: boolean,
  prompts: PromptSelections = promptSelections,
): Promise<ConfirmedSelections | 'cancelled'> {
  if (yes) return {framework: true, harnesses: found.harnesses.map((harness) => harness.id)}
  return prompts(found)
}

export async function promptSelections(found: FoundSelections): Promise<ConfirmedSelections | 'cancelled'> {
  const clack = await import('@clack/prompts')
  clack.intro('conciv init')
  const harnesses = await pickHarnesses(clack, found.harnesses)
  if (harnesses === 'cancelled') return 'cancelled'
  const framework = await clack.confirm({message: frameworkQuestion(found.framework)})
  if (clack.isCancel(framework)) return 'cancelled'
  return {framework, harnesses}
}

type Clack = typeof import('@clack/prompts')

async function pickHarnesses(clack: Clack, found: FoundHarness[]): Promise<HarnessId[] | 'cancelled'> {
  if (found.length === 0) return []
  const picked = await clack.multiselect({
    message: 'Teach these agent harnesses about conciv?',
    options: found.map((harness) => ({value: harness.id, label: harness.id, hint: `found via ${harness.via}`})),
    initialValues: found.map((harness) => harness.id),
    required: false,
  })
  if (clack.isCancel(picked)) return 'cancelled'
  return picked
}

function frameworkQuestion(framework: Framework): string {
  if (framework === 'unknown') return 'No known framework detected — show manual wiring instructions?'
  return `Wire the detected ${framework} config for conciv?`
}
