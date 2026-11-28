const FULL_RUN_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  'packages/publish/src/ci-shards.ts',
]

const FULL_RUN_DIRECTORIES = ['.github/workflows/']

export type AffectedEvent = {name: string | undefined; baseSha: string | undefined; headSha: string | undefined}

export type AffectedProbe = {
  mergeBase: (baseSha: string, headSha: string) => string
  changedFiles: (fromSha: string, toSha: string) => string[]
  affectedPackages: (fromSha: string, toSha: string) => string[]
}

export type AffectedSelection = {packages: string[] | null; reason: string}

function readMessage(error: unknown): string {
  return error instanceof Error ? (error.message.split('\n', 1)[0] ?? error.name) : String(error)
}

export function findFullRunFile(changedFiles: string[]): string | undefined {
  return changedFiles.find(
    (file) => FULL_RUN_FILES.includes(file) || FULL_RUN_DIRECTORIES.some((directory) => file.startsWith(directory)),
  )
}

function selectSince(mergeBase: string, headSha: string, probe: AffectedProbe): AffectedSelection {
  const changedFiles = probe.changedFiles(mergeBase, headSha)
  const fullRunFile = findFullRunFile(changedFiles)
  if (fullRunFile !== undefined) return {packages: null, reason: `${fullRunFile} changed, so everything runs`}
  try {
    const packages = probe.affectedPackages(mergeBase, headSha)
    return {packages, reason: `turbo --affected since the merge base ${mergeBase.slice(0, 12)}`}
  } catch (error) {
    return {packages: null, reason: `the turbo --affected query failed (${readMessage(error)}), so everything runs`}
  }
}

export function selectAffected(event: AffectedEvent, probe: AffectedProbe): AffectedSelection {
  if (event.name !== 'pull_request')
    return {packages: null, reason: `a ${event.name ?? 'local'} run (main push or release call) runs everything`}
  if (!event.baseSha || !event.headSha)
    return {packages: null, reason: 'the pull request base or head SHA is missing, so everything runs'}
  const {baseSha, headSha} = event
  try {
    const mergeBase = probe.mergeBase(baseSha, headSha)
    return selectSince(mergeBase, headSha, probe)
  } catch (error) {
    return {packages: null, reason: `the base ref is missing (${readMessage(error)}), so everything runs`}
  }
}

export function readTurboVersion(lockfile: string): string {
  const version = /^ {2}turbo@(\d+\.\d+\.\d+):$/m.exec(lockfile)?.[1]
  if (version === undefined) throw new Error('pnpm-lock.yaml resolves no turbo version')
  return version
}

export function readDryRunPackages(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw)
  const packages = typeof parsed === 'object' && parsed !== null && 'packages' in parsed ? parsed.packages : undefined
  if (!Array.isArray(packages)) throw new Error('the turbo dry run has no .packages array')
  return packages.filter((name): name is string => typeof name === 'string' && name !== '//')
}

export function renderPlanSummary(
  title: string,
  selection: AffectedSelection,
  selected: string[],
  total: number,
): string {
  const lines = [
    `### ${title} plan`,
    '',
    `${selected.length} of ${total} packages run, ${total - selected.length} skipped: ${selection.reason}.`,
    '',
    ...selected.map((name) => `- ${name}`),
    '',
  ]
  return `${lines.join('\n')}\n`
}
