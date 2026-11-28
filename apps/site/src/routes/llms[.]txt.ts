import {createFileRoute} from '@tanstack/react-router'
import {getLlmsIndex} from '@/lib/docs.functions'
import {SITE} from '@/lib/site-urls'

const details = [
  'conciv is an open-source (MIT) dev-only AI agent that lives inside the web app you are already running. Add it to your Vite, Next.js, webpack or Rspack config and a conciv button appears in your dev preview. The agent sees the page you are building, drives it, edits your source and runs your tests, in the same window, through a real coding CLI (Claude Code by default, or Codex, OpenCode, Gemini CLI or Pi). It never ships to production.',
  '',
  'Reach for conciv when:',
  '',
  '- You want your coding agent to see and click the running page instead of guessing from source.',
  '- You build a web app with Vite, Next.js, webpack or Rspack and want the agent one click away in the dev preview.',
  '- You want test runs, approvals and agent tool results as cards inside the app, not in a second terminal.',
  '- You want to teach the agent new tools with a plugin that adds its own cards and panels.',
  '',
  `Set it up with \`npx @conciv/cli@latest init\` in your app folder, then follow [Getting started](${SITE}/docs/getting-started).`,
].join('\n')

function withDetails(index: string) {
  const firstSection = index.indexOf('\n- ')
  if (firstSection === -1) return `${index}\n\n${details}\n`
  return `${index.slice(0, firstSection)}\n${details}\n${index.slice(firstSection)}`
}

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      async GET() {
        return new Response(withDetails(await getLlmsIndex()))
      },
    },
  },
})
