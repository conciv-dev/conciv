import {createHash} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const GIT_RISKS = [
  'push --force*',
  'push * --force*',
  'push -f*',
  'push * -f*',
  'push --delete*',
  'push * --delete*',
  'push -d*',
  'push * -d *',
  'push * :**',
  'reset --hard*',
  'reset * --hard*',
  'clean*',
  'branch -D*',
  'branch * -D*',
  'gc --prune*',
  'gc * --prune*',
]

export const CLAUDE_ASK_RULES = [
  ...GIT_RISKS.flatMap((risk) => [`Bash(git ${risk})`, `Bash(git * ${risk})`]),
  'Bash(rm -r*)',
  'Bash(rm -fr*)',
  'Bash(rm -R*)',
  'Bash(rm -fR*)',
  'Bash(rm * -r*)',
  'Bash(chmod -R*)',
  'Bash(chown -R*)',
  'Bash(sudo *)',
]

export function claudeAskSettingsFile(): string {
  const settings = JSON.stringify({permissions: {ask: CLAUDE_ASK_RULES}})
  const digest = createHash('sha256').update(settings).digest('hex').slice(0, 16)
  const path = join(tmpdir(), `conciv-claude-settings-${digest}.json`)
  writeFileSync(path, settings)
  return path
}
