import {existsSync, globSync, readFileSync} from 'node:fs'
import {basename, dirname, join, resolve, sep} from 'node:path'

type CitationRange = {
  raw: string
  start: number
  end: number
}

type Citation = {
  raw: string
  path: string
  ranges: Array<CitationRange>
}

type FindingKind =
  | 'dead-source'
  | 'dead-citation'
  | 'unmatchable-citation'
  | 'out-of-range-citation'
  | 'empty-glob'
  | 'missing-sources'
  | 'escaping-citation'

type SkillFinding = {
  file: string
  kind: FindingKind
  detail: string
}

type SkillCheckResult = {
  findings: Array<SkillFinding>
  fileCount: number
  citationCount: number
}

export type CheckOutcome = {
  findings: Array<SkillFinding>
  skillCount: number
  checkedFiles: number
  checkedCitations: number
}

const skillGlobs = [
  'packages/skills/skills/*/SKILL.md',
  'packages/client/skills/*/*/SKILL.md',
  'packages/harness/plugins/claude/skills/*/SKILL.md',
]

const identifierWindow = 30

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

const citationPattern = /`([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|json|md|mdx|yaml|yml)):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)`/g

function skillMarkdownPaths(repoRoot: string): {paths: Array<string>; findings: Array<SkillFinding>} {
  const matchesByGlob = skillGlobs.map((pattern) => ({pattern, matches: globSync(pattern, {cwd: repoRoot})}))
  const findings = matchesByGlob.flatMap(({pattern, matches}) =>
    matches.length === 0 ? [emptyGlobFinding(pattern)] : [],
  )
  const paths = [...new Set(matchesByGlob.flatMap(({matches}) => matches))].toSorted()
  return {paths, findings}
}

function emptyGlobFinding(pattern: string): SkillFinding {
  return {file: pattern, kind: 'empty-glob', detail: `glob matched zero files: ${pattern}`}
}

function referenceMarkdownPaths(repoRoot: string, skillMarkdownRelative: string) {
  const skillDir = dirname(skillMarkdownRelative)
  return globSync(join(skillDir, 'references', '*.md').replaceAll('\\', '/'), {cwd: repoRoot}).toSorted()
}

const sourcesHeadingPattern = /^##\s+sources\b/i

function sourcesHeadingIndex(lines: Array<string>) {
  return lines.findIndex((line) => sourcesHeadingPattern.test(line.trim()))
}

function sourcesSectionLines(lines: Array<string>) {
  const sourcesIndex = sourcesHeadingIndex(lines)
  if (sourcesIndex === -1) return []
  const nextHeadingOffset = lines.slice(sourcesIndex + 1).findIndex((line) => line.startsWith('## '))
  const end = nextHeadingOffset === -1 ? lines.length : sourcesIndex + 1 + nextHeadingOffset
  return lines.slice(sourcesIndex + 1, end)
}

function extractSourcesPaths(text: string) {
  return sourcesSectionLines(text.split('\n')).flatMap((line) => {
    const match = line.match(/^- `([^`]+)`\s*$/)
    const sourcePath = match?.[1]
    return sourcePath ? [sourcePath] : []
  })
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

function parseRange(segment: string): CitationRange | null {
  const rangeMatch = segment.match(/^(\d+)(?:-(\d+))?$/)
  const start = rangeMatch?.[1]
  if (!rangeMatch || !start) return null
  const end = rangeMatch[2] ?? start
  return {raw: segment, start: Number(start), end: Number(end)}
}

function toCitation(match: RegExpMatchArray): Citation | null {
  const [raw, path, rangesText] = match
  if (!path || !rangesText) return null
  const ranges = rangesText.split(',').flatMap((segment) => {
    const range = parseRange(segment)
    return range ? [range] : []
  })
  if (ranges.length === 0) return null
  return {raw, path, ranges}
}

function extractCitations(paragraph: string) {
  return [...paragraph.matchAll(citationPattern)].flatMap((match) => {
    const citation = toCitation(match)
    return citation ? [citation] : []
  })
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

function fileLines(content: string): Array<string> {
  const trimmed = content.endsWith('\n') ? content.slice(0, -1) : content
  return trimmed.split('\n')
}

function resolveCitationPath(citationPath: string, basenameMap: Map<string, string>) {
  if (citationPath.includes('/')) return citationPath
  return basenameMap.get(citationPath) ?? null
}

function withinRepoRoot(repoRoot: string, relativePath: string): string | null {
  const resolvedRoot = resolve(repoRoot)
  const absolute = resolve(repoRoot, relativePath)
  if (absolute === resolvedRoot || absolute.startsWith(resolvedRoot + sep)) return absolute
  return null
}

function unresolvedFinding(fileRelative: string, citation: Citation): SkillFinding {
  return {
    file: fileRelative,
    kind: 'unmatchable-citation',
    detail: `${citation.raw}: cannot resolve bare filename "${citation.path}" against this skill's Sources`,
  }
}

function escapingFinding(fileRelative: string, citation: Citation, resolved: string): SkillFinding {
  return {
    file: fileRelative,
    kind: 'escaping-citation',
    detail: `${citation.raw}: resolved path "${resolved}" escapes the repository root`,
  }
}

function deadCitationFinding(fileRelative: string, citation: Citation, resolved: string): SkillFinding {
  return {file: fileRelative, kind: 'dead-citation', detail: `${citation.raw}: ${resolved} does not exist`}
}

function outOfRangeFinding(
  fileRelative: string,
  citation: Citation,
  range: CitationRange,
  resolved: string,
  lineCount: number,
): Array<SkillFinding> {
  const inBounds = range.start >= 1 && range.start <= range.end && range.end <= lineCount
  if (inBounds) return []
  return [
    {
      file: fileRelative,
      kind: 'out-of-range-citation',
      detail: `${citation.raw} segment ${range.raw}: ${resolved} has ${lineCount} line(s)`,
    },
  ]
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
    detail: `${citation.raw}: none of [${[...identifiers].join(', ')}] found within +/-${identifierWindow} lines of ${resolved}`,
  }
}

function windowContent(lines: Array<string>, range: CitationRange): string {
  const from = Math.max(1, range.start - identifierWindow)
  const to = Math.min(lines.length, range.end + identifierWindow)
  return lines.slice(from - 1, to).join('\n')
}

function identifiersMatch(paragraph: string, citationPath: string, content: string, validRanges: Array<CitationRange>) {
  const excludeTokens = excludeTokensFor(citationPath)
  const identifiers = extractIdentifiers(paragraph, excludeTokens)
  if (identifiers.size === 0) return {ok: true, identifiers}
  const lines = fileLines(content)
  const windowText = validRanges.map((range) => windowContent(lines, range)).join('\n')
  const ok = [...identifiers].some((identifier) => windowText.includes(identifier))
  return {ok, identifiers}
}

function checkCitation(
  repoRoot: string,
  fileRelative: string,
  paragraph: string,
  citation: Citation,
  basenameMap: Map<string, string>,
): Array<SkillFinding> {
  const resolved = resolveCitationPath(citation.path, basenameMap)
  if (!resolved) return [unresolvedFinding(fileRelative, citation)]
  const absolute = withinRepoRoot(repoRoot, resolved)
  if (!absolute) return [escapingFinding(fileRelative, citation, resolved)]
  if (!existsSync(absolute)) return [deadCitationFinding(fileRelative, citation, resolved)]
  const content = readFileSync(absolute, 'utf8')
  const lineCount = fileLines(content).length
  const rangeFindings = citation.ranges.flatMap((range) =>
    outOfRangeFinding(fileRelative, citation, range, resolved, lineCount),
  )
  const validRanges = citation.ranges.filter(
    (range) => range.start >= 1 && range.start <= range.end && range.end <= lineCount,
  )
  if (validRanges.length === 0) return rangeFindings
  const match = identifiersMatch(paragraph, citation.path, content, validRanges)
  if (match.ok) return rangeFindings
  return [...rangeFindings, unmatchedIdentifiersFinding(fileRelative, citation, match.identifiers, resolved)]
}

function checkCitationsSection(repoRoot: string, fileRelative: string, text: string, basenameMap: Map<string, string>) {
  return splitParagraphs(text).flatMap((paragraph) =>
    extractCitations(paragraph).flatMap((citation) =>
      checkCitation(repoRoot, fileRelative, paragraph, citation, basenameMap),
    ),
  )
}

function missingSourcesFinding(fileRelative: string): Array<SkillFinding> {
  if (!fileRelative.startsWith('packages/skills/skills/')) return []
  return [{file: fileRelative, kind: 'missing-sources', detail: 'no "## Sources" section found'}]
}

function checkSourcesSection(repoRoot: string, fileRelative: string, text: string): Array<SkillFinding> {
  if (!fileRelative.endsWith('SKILL.md')) return []
  if (sourcesHeadingIndex(text.split('\n')) === -1) return missingSourcesFinding(fileRelative)
  return extractSourcesPaths(text)
    .filter((sourcePath) => !existsSync(join(repoRoot, sourcePath)))
    .map((sourcePath): SkillFinding => ({file: fileRelative, kind: 'dead-source', detail: sourcePath}))
}

function checkFile(repoRoot: string, fileRelative: string, text: string, basenameMap: Map<string, string>) {
  return [
    ...checkSourcesSection(repoRoot, fileRelative, text),
    ...checkCitationsSection(repoRoot, fileRelative, text, basenameMap),
  ]
}

function readMarkdownFiles(repoRoot: string, files: Array<string>) {
  return new Map(files.map((fileRelative) => [fileRelative, readFileSync(join(repoRoot, fileRelative), 'utf8')]))
}

function checkSkill(repoRoot: string, skillMarkdownRelative: string): SkillCheckResult {
  const files = [skillMarkdownRelative, ...referenceMarkdownPaths(repoRoot, skillMarkdownRelative)]
  const fileTexts = readMarkdownFiles(repoRoot, files)
  const skillText = fileTexts.get(skillMarkdownRelative)
  if (skillText === undefined) return {findings: [], fileCount: 0, citationCount: 0}
  const basenameMap = buildBasenameMap(extractSourcesPaths(skillText))
  const findings = files.flatMap((fileRelative) => {
    const text = fileTexts.get(fileRelative)
    return text === undefined ? [] : checkFile(repoRoot, fileRelative, text, basenameMap)
  })
  const citationCount = files.reduce((sum, fileRelative) => {
    const text = fileTexts.get(fileRelative)
    return sum + (text === undefined ? 0 : extractCitations(text).length)
  }, 0)
  return {findings, fileCount: files.length, citationCount}
}

export function runCheck(repoRoot: string): CheckOutcome {
  const {paths: skillFiles, findings: globFindings} = skillMarkdownPaths(repoRoot)
  const results = skillFiles.map((skillMarkdownRelative) => checkSkill(repoRoot, skillMarkdownRelative))
  const findings = [...globFindings, ...results.flatMap((result) => result.findings)]
  const checkedFiles = results.reduce((sum, result) => sum + result.fileCount, 0)
  const checkedCitations = results.reduce((sum, result) => sum + result.citationCount, 0)
  return {findings, skillCount: skillFiles.length, checkedFiles, checkedCitations}
}

export function formatReport(outcome: CheckOutcome): string {
  if (outcome.findings.length === 0) {
    return `skills check:refs: ${outcome.skillCount} skill(s), ${outcome.checkedFiles} file(s), ${outcome.checkedCitations} citation(s) - all clean`
  }
  const lines = outcome.findings.map((finding) => `  [${finding.kind}] ${finding.file}: ${finding.detail}`)
  return [
    `skills check:refs found ${outcome.findings.length} problem(s) across ${outcome.skillCount} skill(s):`,
    '',
    ...lines,
  ].join('\n')
}
