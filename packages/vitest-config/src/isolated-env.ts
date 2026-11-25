import {join} from 'node:path'

const PROVIDER_PREFIX =
  /^(?:AWS|AZURE|GOOGLE|GCP|GCLOUD|VERTEX|OPENAI|ANTHROPIC|GEMINI|XAI|CLOUDFLARE|CF_AIG|SNOWFLAKE|AICORE|GITLAB|NPM_CONFIG)_/i

const SECRET_SUFFIX = /(?:^|_)(?:API_KEY|AUTHORIZATION|TOKEN|SECRET|PASSWORD|CREDENTIALS?)$/i

const CONCIV_PREFIX = /^CONCIV_/

const AGENT_SHELL_VARIABLES = new Set(['CLAUDECODE', 'CODEX_THREAD_ID', 'GEMINI_CLI', 'OPENCODE'])

const RUNNER_VARIABLES = new Set(['NODE_PATH'])

function kept(name: string): boolean {
  return (
    !PROVIDER_PREFIX.test(name) &&
    !SECRET_SUFFIX.test(name) &&
    !CONCIV_PREFIX.test(name) &&
    !AGENT_SHELL_VARIABLES.has(name) &&
    !RUNNER_VARIABLES.has(name)
  )
}

export function isolatedEnv(
  source: NodeJS.ProcessEnv,
  home: string,
  temporary: string,
): Record<string, string | undefined> {
  return {
    ...Object.fromEntries(Object.entries(source).filter(([name]) => kept(name))),
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_CACHE_HOME: join(home, '.cache'),
    XDG_STATE_HOME: join(home, '.local', 'state'),
    TMPDIR: temporary,
    ...(process.platform === 'win32' ? {USERPROFILE: home, TMP: temporary, TEMP: temporary} : {}),
  }
}
