import {CONCIV_CLAUDE_SESSION_HEADER} from '@conciv/protocol/chat-types'

export const CLAUDE_CONNECT_BRIDGE_FILE = 'conciv-mcp-bridge.mjs'

export const CLAUDE_CONNECT_BRIDGE_URL_VAR = 'CONCIV_MCP_URL'

const CLAUDE_SESSION_VAR = 'CLAUDE_CODE_SESSION_ID'

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

function unwrap(contentType, text) {
  if (!contentType.includes('text/event-stream')) return text
  return text
    .split('\\n')
    .filter((row) => row.startsWith('data:'))
    .map((row) => row.slice(5).trim())
    .join('')
}

async function forward(line) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      '${CONCIV_CLAUDE_SESSION_HEADER}': claudeSessionId,
    },
    body: line,
  })
  const text = unwrap(response.headers.get('content-type') ?? '', await response.text()).trim()
  if (text.length > 0) process.stdout.write(\`\${text}\\n\`)
}

createInterface({input: process.stdin}).on('line', (line) => {
  if (line.trim().length === 0) return
  void forward(line).catch((error) => failed(line, String(error)))
})
`
}
