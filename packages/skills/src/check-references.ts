import {existsSync, globSync, readFileSync} from 'node:fs'
import {basename, dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

type Citation = {
  raw: string
  path: string
  line: string
}

type SkillFinding = {
  file: string
  kind: 'dead-source' | 'dead-citation' | 'unmatchable-citation'
  detail: string
}

type SkillCheckResult = {
  findings: Array<SkillFinding>
  fileCount: number
  citationCount: number
}

const currentDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(currentDir, '..', '..', '..')

const skillGlobs = [
  'packages/skills/skills/*/SKILL.md',
  'packages/client/skills/*/*/SKILL.md',
  'packages/harness/plugins/claude/skills/*/SKILL.md',
]

const stopwords = new Set([
  'this',
  'that',
  'these',
  'those',
  'with',
  'from',
  'when',
  'then',
  'than',
  'into',
  'only',
  'once',
  'over',
  'more',
  'most',
  'such',
  'some',
  'each',
  'before',
  'after',
  'while',
  'where',
  'which',
  'about',
  'using',
  'calls',
  'called',
  'first',
  'never',
  'always',
  'still',
  'exact',
  'valid',
  'files',
  'based',
  'means',
  'mean',
  'does',
  'doesn',
  'have',
  'has',
  'had',
  'the',
  'and',
  'for',
  'not',
  'you',
  'your',
  'its',
  'was',
  'were',
  'been',
  'being',
  'they',
  'them',
  'their',
  'here',
  'there',
  'what',
  'who',
  'whom',
  'why',
  'how',
  'all',
  'any',
  'both',
  'same',
  'other',
  'another',
  'either',
  'neither',
  'without',
  'between',
  'through',
  'against',
  'during',
  'above',
  'below',
  'under',
  'again',
  'further',
  'because',
  'until',
  'unless',
  'instead',
  'rather',
  'even',
  'also',
  'just',
  'like',
  'itself',
  'gets',
  'get',
  'give',
  'given',
  'gives',
  'goes',
  'going',
  'went',
  'come',
  'comes',
  'coming',
  'make',
  'makes',
  'making',
  'made',
  'takes',
  'take',
  'took',
  'taken',
  'runs',
  'run',
  'running',
  'conciv',
])

const citationPattern = /`([A-Za-z0-9_./-]+\.(?:ts|tsx|md|mdx)):(\d+)(?:-(\d+))?`/g

function skillMdPaths() {
  const paths = skillGlobs.flatMap((pattern) => globSync(pattern, {cwd: repoRoot}))
  return [...new Set(paths)].toSorted()
}

function referenceMdPaths(skillMdRelative: string) {
  const skillDir = dirname(skillMdRelative)
  return globSync(join(skillDir, 'references', '*.md').replaceAll('\\', '/'), {cwd: repoRoot}).toSorted()
}

function sourcesSectionLines(lines: Array<string>) {
  const sourcesIndex = lines.findIndex((line) => line.trim() === '## Sources')
  if (sourcesIndex === -1) return []
  const nextHeadingOffset = lines.slice(sourcesIndex + 1).findIndex((line) => line.startsWith('## '))
  const end = nextHeadingOffset === -1 ? lines.length : sourcesIndex + 1 + nextHeadingOffset
  return lines.slice(sourcesIndex + 1, end)
}

function extractSourcesPaths(text: string) {
  const sourcePaths: Array<string> = []
  for (const line of sourcesSectionLines(text.split('\n'))) {
    const bulletMatch = line.match(/^- `([^`]+)`\s*$/)
    if (bulletMatch?.[1]) sourcePaths.push(bulletMatch[1])
  }
  return sourcePaths
}

function buildBasenameMap(sourcesPaths: Array<string>) {
  const map = new Map<string, string>()
  for (const sourcePath of sourcesPaths) {
    const key = basename(sourcePath)
    if (!map.has(key)) map.set(key, sourcePath)
  }
  return map
}

type ParagraphRole = 'break-solo' | 'break-start' | 'blank' | 'continue'

function lineParagraphRole(line: string): ParagraphRole {
  if (line.trim().startsWith('|')) return 'break-solo'
  if (/^(-\s|\d+\.\s|#)/.test(line)) return 'break-start'
  if (line.trim() === '') return 'blank'
  return 'continue'
}

function splitParagraphs(text: string) {
  const paragraphs: Array<string> = []
  let buffer: Array<string> = []
  const flush = () => {
    if (buffer.length > 0) paragraphs.push(buffer.join('\n'))
    buffer = []
  }
  const handlers: Record<ParagraphRole, (line: string) => void> = {
    'break-solo': (line) => {
      flush()
      paragraphs.push(line)
    },
    'break-start': (line) => {
      flush()
      buffer.push(line)
    },
    blank: () => flush(),
    continue: (line) => buffer.push(line),
  }
  for (const line of text.split('\n')) {
    handlers[lineParagraphRole(line)](line)
  }
  flush()
  return paragraphs
}

function toCitation(match: RegExpMatchArray): Citation | null {
  const [raw, path, start, end] = match
  if (!path) return null
  if (!start) return null
  const line = end ? `${start}-${end}` : start
  return {raw, path, line}
}

function extractCitations(paragraph: string) {
  const citations: Array<Citation> = []
  for (const match of paragraph.matchAll(citationPattern)) {
    const citation = toCitation(match)
    if (citation) citations.push(citation)
  }
  return citations
}

function excludeTokensFor(citationPath: string) {
  return citationPath
    .split(/[^A-Za-z0-9]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.toLowerCase())
}

function isIdentifierCandidate(token: string, excludeSet: Set<string>) {
  if (token.length < 4) return false
  const lowered = token.toLowerCase()
  if (stopwords.has(lowered)) return false
  return !excludeSet.has(lowered)
}

function extractIdentifiers(paragraph: string, excludeTokens: Array<string>) {
  const excludeSet = new Set(excludeTokens)
  const tokens = paragraph.match(/[A-Za-z_$][\w$]*/g) ?? []
  return new Set(tokens.filter((token) => isIdentifierCandidate(token, excludeSet)))
}

function resolveCitationPath(citationPath: string, basenameMap: Map<string, string>) {
  if (citationPath.includes('/')) return citationPath
  return basenameMap.get(citationPath) ?? null
}

function unresolvedFinding(fileRelative: string, citation: Citation): SkillFinding {
  return {
    file: fileRelative,
    kind: 'unmatchable-citation',
    detail: `${citation.raw} — cannot resolve bare filename "${citation.path}" against this skill's Sources`,
  }
}

function deadCitationFinding(fileRelative: string, citation: Citation, resolved: string): SkillFinding {
  return {file: fileRelative, kind: 'dead-citation', detail: `${citation.raw} — ${resolved} does not exist`}
}

function unmatchedIdentifiersFinding(
  fileRelative: string,
  citation: Citation,
  identifiers: Set<string>,
  resolved: string,
): SkillFinding {
  return {
    file: fileRelative,
    kind: 'unmatchable-citation',
    detail: `${citation.raw} — none of [${[...identifiers].join(', ')}] found in ${resolved}`,
  }
}

function identifiersMatch(paragraph: string, citationPath: string, resolved: string) {
  const excludeTokens = excludeTokensFor(citationPath)
  const identifiers = extractIdentifiers(paragraph, excludeTokens)
  if (identifiers.size === 0) return {ok: true, identifiers}
  const citedContent = readFileSync(join(repoRoot, resolved), 'utf8')
  const ok = [...identifiers].some((identifier) => citedContent.includes(identifier))
  return {ok, identifiers}
}

function checkCitation(
  fileRelative: string,
  paragraph: string,
  citation: Citation,
  basenameMap: Map<string, string>,
): SkillFinding | null {
  const resolved = resolveCitationPath(citation.path, basenameMap)
  if (!resolved) return unresolvedFinding(fileRelative, citation)
  if (!existsSync(join(repoRoot, resolved))) return deadCitationFinding(fileRelative, citation, resolved)
  const match = identifiersMatch(paragraph, citation.path, resolved)
  if (match.ok) return null
  return unmatchedIdentifiersFinding(fileRelative, citation, match.identifiers, resolved)
}

function checkSourcesSection(fileRelative: string, text: string) {
  if (!fileRelative.endsWith('SKILL.md')) return []
  return extractSourcesPaths(text)
    .filter((sourcePath) => !existsSync(join(repoRoot, sourcePath)))
    .map((sourcePath): SkillFinding => ({file: fileRelative, kind: 'dead-source', detail: sourcePath}))
}

function checkCitationsSection(fileRelative: string, text: string, basenameMap: Map<string, string>) {
  const findings: Array<SkillFinding> = []
  for (const paragraph of splitParagraphs(text)) {
    for (const citation of extractCitations(paragraph)) {
      const finding = checkCitation(fileRelative, paragraph, citation, basenameMap)
      if (finding) findings.push(finding)
    }
  }
  return findings
}

function checkFile(fileRelative: string, basenameMap: Map<string, string>) {
  const text = readFileSync(join(repoRoot, fileRelative), 'utf8')
  return [...checkSourcesSection(fileRelative, text), ...checkCitationsSection(fileRelative, text, basenameMap)]
}

function checkSkill(skillMdRelative: string): SkillCheckResult {
  const skillText = readFileSync(join(repoRoot, skillMdRelative), 'utf8')
  const basenameMap = buildBasenameMap(extractSourcesPaths(skillText))
  const files = [skillMdRelative, ...referenceMdPaths(skillMdRelative)]
  const findings = files.flatMap((fileRelative) => checkFile(fileRelative, basenameMap))
  const citationCount = files.reduce((sum, fileRelative) => {
    const fileText = readFileSync(join(repoRoot, fileRelative), 'utf8')
    return sum + extractCitations(fileText).length
  }, 0)
  return {findings, fileCount: files.length, citationCount}
}

function reportResult(
  skillCount: number,
  checkedFiles: number,
  checkedCitations: number,
  allFindings: Array<SkillFinding>,
) {
  if (allFindings.length === 0) {
    console.log(
      `skills check:refs: ${skillCount} skill(s), ${checkedFiles} file(s), ${checkedCitations} citation(s) — all clean`,
    )
    return
  }
  console.error(`skills check:refs found ${allFindings.length} problem(s) across ${skillCount} skill(s):\n`)
  for (const finding of allFindings) {
    console.error(`  [${finding.kind}] ${finding.file}: ${finding.detail}`)
  }
  process.exit(1)
}

function main() {
  const skillFiles = skillMdPaths()
  const results = skillFiles.map(checkSkill)
  const allFindings = results.flatMap((result) => result.findings)
  const checkedFiles = results.reduce((sum, result) => sum + result.fileCount, 0)
  const checkedCitations = results.reduce((sum, result) => sum + result.citationCount, 0)
  reportResult(skillFiles.length, checkedFiles, checkedCitations, allFindings)
}

main()
