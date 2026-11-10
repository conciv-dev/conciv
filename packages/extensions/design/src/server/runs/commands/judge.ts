import {existsSync} from 'node:fs'
import {copyFile, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execa} from 'execa'
import {maxBy} from 'es-toolkit'
import {z} from 'zod'
import type {ExtensionDb} from '@conciv/extension'
import {designConfig} from '../../../shared/tolerances.js'

export async function judge(input: {
  db: Pick<ExtensionDb<Record<never, never>>, 'read' | 'write'>
  home: string
  wave: string
  judgeModel: string
}): Promise<string> {
  const {db, home, wave, judgeModel} = input
  const runs = RunsSchema.parse(
    await db.read({from: 'stored_runs', where: `wave == ${JSON.stringify(wave)}`, select: ['run']}),
  )
  const lines: string[] = []
  for (const {run} of runs) {
    const artifacts = ArtifactsSchema.parse(
      await db.read({
        from: 'stored_artifacts',
        where: `run == ${run} && (kind == "design" || kind == "screenshot")`,
        select: ['artifact_id', 'kind', 'width', 'path'],
      }),
    )
    const judged = JudgedSchema.parse(
      await db.read({
        from: 'stored_judgements',
        where: `run == ${run} && judge_model == ${JSON.stringify(judgeModel)}`,
        select: ['target', 'width'],
      }),
    )
    const done = new Set(judged.map((row) => `${row.target} ${row.width}`))
    for (const pair of pairsOf(artifacts).filter((entry) => !done.has(`${entry.target} ${entry.width}`))) {
      const named = `run ${run} target ${pair.target} width ${pair.width}`
      const missing = KINDS.filter((kind) => pair[kind] === undefined || !existsSync(join(home, ARTIFACTS, pair[kind])))
      if (missing.length > 0) {
        lines.push(`${named}: ${missing.join(' and ')} missing`)
        continue
      }
      const scored = await scoreOf({home, pair, judgeModel})
      await db.write({
        into: 'stored_judgements',
        values: {run, target: pair.target, width: pair.width, ...scored, judge_model: judgeModel, at: Date.now()},
      })
      lines.push(`${named}: ${scored.score} ${scored.reason}`)
    }
  }
  return lines.join('\n')
}

type Pair = {target: string; width: number; design?: string; screenshot?: string}

const KINDS = ['design', 'screenshot'] as const

const ARTIFACTS = 'artifacts'

const {lowest, highest} = designConfig.runs.score

const PROMPT = [
  'first.png is a design. second.png is a page built from it.',
  'Read both images. Judge only what is visible: how closely the page matches the design.',
  `Answer with JSON only: {"score": <a whole number from ${lowest} to ${highest}>, "reason": "<one line>"}.`,
].join(' ')

const RunsSchema = z.array(z.object({run: z.number()}))

const ArtifactsSchema = z.array(
  z.object({artifact_id: z.number(), kind: z.enum(KINDS), width: z.number(), path: z.string()}),
)

const JudgedSchema = z.array(z.object({target: z.string(), width: z.number()}))

const ReplySchema = z.object({result: z.string()})

const ScoreSchema = z.object({score: z.int().min(lowest).max(highest), reason: z.string()})

function pairsOf(artifacts: z.infer<typeof ArtifactsSchema>): Pair[] {
  const grouped = Object.groupBy(artifacts, (artifact) => `${targetOf(artifact.path)} ${artifact.width}`)
  return Object.values(grouped).flatMap((group) => {
    const [first] = group ?? []
    if (first === undefined) return []
    const latest = (kind: (typeof KINDS)[number]) =>
      maxBy(
        (group ?? []).filter((artifact) => artifact.kind === kind),
        (artifact) => artifact.artifact_id,
      )?.path
    const design = latest('design')
    const screenshot = latest('screenshot')
    return [
      {
        target: targetOf(first.path),
        width: first.width,
        ...(design === undefined ? {} : {design}),
        ...(screenshot === undefined ? {} : {screenshot}),
      },
    ]
  })
}

function targetOf(path: string): string {
  return path.split('/')[1] ?? ''
}

async function scoreOf(input: {home: string; pair: Pair; judgeModel: string}): Promise<z.infer<typeof ScoreSchema>> {
  const {home, pair, judgeModel} = input
  const dir = await mkdtemp(join(tmpdir(), 'conciv-judge-'))
  try {
    await copyFile(join(home, ARTIFACTS, pair.design ?? ''), join(dir, 'first.png'))
    await copyFile(join(home, ARTIFACTS, pair.screenshot ?? ''), join(dir, 'second.png'))
    const {stdout} = await execa(
      'claude',
      ['-p', PROMPT, '--model', judgeModel, '--allowedTools', 'Read', '--output-format', 'json'],
      {cwd: dir, stdin: 'ignore'},
    )
    const {result} = ReplySchema.parse(JSON.parse(stdout))
    return ScoreSchema.parse(JSON.parse(result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1)))
  } finally {
    await rm(dir, {recursive: true, force: true})
  }
}
