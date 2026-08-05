import {CONCIV_CLAUDE_SESSION_HEADER} from '@conciv/protocol/chat-types'

export const CLAUDE_CONNECT_BRIDGE_FILE = 'conciv-mcp-bridge.mjs'

export const CLAUDE_CONNECT_BRIDGE_URL_VAR = 'CONCIV_MCP_URL'

export const CLAUDE_CONNECT_BRIDGE_TIMEOUT_VAR = 'CONCIV_MCP_TIMEOUT_MS'

const CLAUDE_SESSION_VAR = 'CLAUDE_CODE_SESSION_ID'

const BRIDGE_TIMEOUT_MS = 180_000

export function claudeConnectBridgeSource(): string {
  return `import {createInterface} from 'node:readline'

const url = process.env.${CLAUDE_CONNECT_BRIDGE_URL_VAR} ?? ''
const claudeSessionId = process.env.${CLAUDE_SESSION_VAR} ?? ''

function idOf(line) {
  try {
    const parsed = JSON.parse(line)
    return parsed.id ?? null
  } catch {
    return null
  }
}

function reply(payload) {
  process.stdout.write(\`\${JSON.stringify(payload)}\\n\`)
}

function failed(line, reason) {
  const id = idOf(line)
  if (id === null) return
  reply({jsonrpc: '2.0', id, error: {code: -32000, message: \`conciv bridge: \${reason}\`}})
}

function timeoutMs() {
  const configured = Number(process.env.${CLAUDE_CONNECT_BRIDGE_TIMEOUT_VAR})
  if (Number.isFinite(configured) && configured > 0) return configured
  return ${BRIDGE_TIMEOUT_MS}
}

function eventsOf(text) {
  return text
    .replace(/\\r\\n/g, '\\n')
    .split(/\\n\\n+/)
    .flatMap((block) => {
      const data = block
        .split('\\n')
        .filter((row) => row.startsWith('data:'))
        .map((row) => row.slice(5).replace(/^ /, ''))
      return data.length === 0 ? [] : [data.join('\\n')]
    })
}

function framesOf(contentType, body) {
  if (contentType.includes('text/event-stream')) return eventsOf(body)
  const text = body.trim()
  return text.length === 0 ? [] : [text]
}

function parsed(text) {
  try {
    return {ok: true, value: JSON.parse(text)}
  } catch {
    return {ok: false, value: null}
  }
}

async function send(line) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      '${CONCIV_CLAUDE_SESSION_HEADER}': claudeSessionId,
    },
    body: line,
    signal: AbortSignal.timeout(timeoutMs()),
  })
  if (!response.ok) return failed(line, \`http \${response.status}\`)
  const body = await response.text()
  const texts = framesOf(response.headers.get('content-type') ?? '', body)
  if (texts.length === 0) return failed(line, 'empty response')
  for (const text of texts) {
    const frame = parsed(text)
    if (!frame.ok) return failed(line, 'non-json response')
    reply(frame.value)
  }
}

async function forward(line) {
  try {
    await send(line)
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    failed(line, timedOut ? 'timed out' : String(error))
  }
}

createInterface({input: process.stdin}).on('line', (line) => {
  if (line.trim().length === 0) return
  void forward(line)
})
`
}
