const AGENT_PATH = /\/t\/[^/\s?#'"]+/g
const AUTH_QUERY = /devframe_auth_token=[^&\s#'"]+/g

function redactSecrets(line: string): string {
  return line.replace(AGENT_PATH, '/t/<redacted>').replace(AUTH_QUERY, 'devframe_auth_token=<redacted>')
}

export const logError = (message: string): void => void process.stderr.write(`${redactSecrets(message)}\n`)
