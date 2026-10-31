import {createHash} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

export const CLAUDE_ASK_RULES = [
  'Bash(git push --force*)',
  'Bash(git push * --force*)',
  'Bash(git push -f*)',
  'Bash(git push * -f*)',
  'Bash(git push --delete*)',
  'Bash(git push * --delete*)',
  'Bash(git push -d*)',
  'Bash(git push * -d *)',
  'Bash(git push * :**)',
  'Bash(git reset --hard*)',
  'Bash(git reset * --hard*)',
  'Bash(git clean*)',
  'Bash(git branch -D*)',
  'Bash(git branch * -D*)',
  'Bash(git gc --prune*)',
  'Bash(git gc * --prune*)',
  'Bash(rm -r*)',
  'Bash(rm -fr*)',
  'Bash(rm -R*)',
  'Bash(rm -fR*)',
  'Bash(rm * -r*)',
  'Bash(chmod -R*)',
  'Bash(chown -R*)',
  'Bash(sudo *)',
] as const

export function claudeAskSettingsFile(): string {
  const settings = JSON.stringify({permissions: {ask: CLAUDE_ASK_RULES}})
  const digest = createHash('sha256').update(settings).digest('hex').slice(0, 16)
  const path = join(tmpdir(), `conciv-claude-settings-${digest}.json`)
  writeFileSync(path, settings)
  return path
}
