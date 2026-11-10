import {execFile} from 'node:child_process'
import {copyFile, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {parseArgs, promisify} from 'node:util'
import {z} from 'zod'
import {concivHome, homeCatalog} from '@conciv/db'
import {designConfig} from '../../../extensions/design/src/shared/tolerances.js'

export async function judge(argv: string[]): Promise<void> {
  const {values, positionals} = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {model: {type: 'string', default: 'opus'}},
  })
  const [wave] = positionals
  if (wave === undefined) throw new Error('trial judge takes the wave name')
  const home = concivHome({env: process.env})
  const {sources} = homeCatalog(home)
  const judged = JudgedSchema.parse(
    await sources.read({
      from: 'design_judged',
      where: `wave == ${JSON.stringify(wave)}`,
      select: ['run', 'target', 'width'],
    }),
  )
  const done = new Set(
    JudgedSchema.parse(
      await sources.read({
        from: 'design_stored_judgements',
        where: `judge_model == ${JSON.stringify(values.model)}`,
        select: ['run', 'target', 'width'],
      }),
    ).map(keyOf),
  )
  const pending = [...new Map(judged.map((row) => [keyOf(row), row])).values()].filter((row) => !done.has(keyOf(row)))
  for (const row of pending) {
    const artifacts = ArtifactsSchema.parse(
      await sources.read({
        from: 'design_stored_artifacts',
        where: `run == ${row.run} && width == ${row.width}`,
        select: ['kind', 'path'],
      }),
    )
    const design = artifacts.find((artifact) => artifact.kind === 'design')
    const page = artifacts.find((artifact) => artifact.kind === 'screenshot')
    if (design === undefined || page === undefined) {
      const missing = [design === undefined ? ['design'] : [], page === undefined ? ['screenshot'] : []].flat()
      print(`run ${row.run} ${row.target} width ${row.width}: no ${missing.join(' and no ')} artifact; not judged`)
      continue
    }
    const answer = await verdict({
      design: join(home, 'artifacts', design.path),
      page: join(home, 'artifacts', page.path),
      model: values.model,
    })
    await sources.write({
      into: 'design_stored_judgements',
      values: {...row, score: answer.score, reason: answer.line, judge_model: values.model, at: Date.now()},
    })
    print(`run ${row.run} ${row.target} width ${row.width}: ${answer.score} ${answer.line}`)
  }
}

const PROMPT = [
  'Read the two images design.png and page.png in the current directory with the Read tool.',
  'design.png is a design. page.png is a web page built from it, screenshotted at the same width.',
  'Score how close the page is to the design, judging only what you see: layout, sizes, spacing, colors, type, images, icons.',
  '5 means you cannot tell them apart; 4 close, small differences; 3 the same page with clear differences;',
  '2 recognisably the same page but much is wrong; 1 a different page.',
  'Answer with only one JSON object and nothing else: {"score": <1 to 5>, "line": "<one sentence naming the largest differences>"}',
].join(' ')

const JudgedSchema = z.array(z.object({run: z.number(), target: z.string(), width: z.number()}))

const ArtifactsSchema = z.array(z.object({kind: z.string(), path: z.string()}))

const EnvelopeSchema = z.object({result: z.string()})

const AnswerSchema = z.object({
  score: z.int().min(designConfig.runs.score.lowest).max(designConfig.runs.score.highest),
  line: z.string(),
})

function keyOf(row: {run: number; target: string; width: number}): string {
  return `${row.run} ${row.target} ${row.width}`
}

async function verdict(input: {design: string; page: string; model: string}): Promise<z.output<typeof AnswerSchema>> {
  const dir = await mkdtemp(join(tmpdir(), 'conciv-judge-'))
  try {
    await Promise.all([copyFile(input.design, join(dir, 'design.png')), copyFile(input.page, join(dir, 'page.png'))])
    const {stdout} = await promisify(execFile)(
      'claude',
      ['-p', PROMPT, '--model', input.model, '--allowedTools', 'Read', '--output-format', 'json', '--max-turns', '4'],
      {cwd: dir},
    )
    const text = EnvelopeSchema.parse(JSON.parse(stdout)).result
    return AnswerSchema.parse(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)))
  } finally {
    await rm(dir, {recursive: true, force: true})
  }
}

function print(text: string): void {
  process.stdout.write(`${text}\n`)
}
