type CiReporterEntry = 'default' | ['github-actions', {jobSummary: {enabled: boolean}}] | ['json', {outputFile: string}]

export function ciReporters(): CiReporterEntry[] {
  if (!process.env.GITHUB_ACTIONS) return ['default']
  return ['default', ['github-actions', {jobSummary: {enabled: false}}], ['json', {outputFile: 'test-results.json'}]]
}
