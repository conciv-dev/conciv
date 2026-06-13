import {writeFileSync, mkdirSync, rmSync, symlinkSync} from 'node:fs'
import {join, delimiter} from 'node:path'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import type {AddressInfo} from 'node:net'
import type {HtmlTagDescriptor, Plugin, ViteDevServer} from 'vite'
import launchEditor from 'launch-editor'
import {makeChatRoute} from './chat-route.js'
import {makeToolsRoute, type ToolsServer} from './tools-route.js'
import {makeEditorOpener} from './tools-layer.js'
import {makeUiBus} from './ui-bus.js'
import {makeVitestManager} from './vitest-manager.js'
import {makeVitestRoute} from './vitest-route.js'
import {resolveConfig, type DevgentConfig} from './config.js'
import {DEFAULT_WIDGET_ROUTE, makeWidgetInject, makeWidgetServe} from './widget-middleware.js'

const require = createRequire(import.meta.url)

// The <head> tags the widget needs: an empty api-base (⇒ same-origin, handled by /__pw),
// the preview id, and the widget bundle itself. Injected only when a widgetUrl is set.
function headTags(previewId: string, widgetUrl: string | undefined): HtmlTagDescriptor[] {
  const tags: HtmlTagDescriptor[] = [
    {tag: 'meta', attrs: {name: 'pw-api-base', content: ''}, injectTo: 'head'},
    {tag: 'meta', attrs: {name: 'pw-preview-id', content: previewId}, injectTo: 'head'},
  ]
  // `defer`: the widget mounts onto document.body on load, so it must run after the DOM is
  // parsed — without it the script executes in <head> while document.body is null.
  if (widgetUrl) tags.push({tag: 'script', attrs: {src: widgetUrl, defer: true}, injectTo: 'head'})
  return tags
}

// Resolve the bundled @devgent/widget global so the plugin can serve it itself — a host app
// then needs only the plugin (no widgetUrl, no static-serve wiring). Returns null if the
// widget isn't installed; callers fall back to an explicit config.widgetUrl (e.g. a CDN).
function resolveWidgetFile(): string | null {
  try {
    return require.resolve('@devgent/widget/global')
  } catch {
    return null
  }
}

function serverPort(server: ViteDevServer): number {
  const addr = server.httpServer?.address() as AddressInfo | string | null | undefined
  if (addr && typeof addr === 'object') return addr.port
  return server.config.server.port ?? 5173
}

// The devgent dev agent, as a vite plugin. Spawns a headless `claude -p` loop behind the
// /__pw/* HTTP surface and (optionally) injects the widget into the page. Only applies in
// `serve` (dev); it is a no-op for production builds.
export function devgent(options: DevgentConfig = {}): Plugin {
  const widgetFile = resolveWidgetFile()
  // What we inject + serve. An explicit config.widgetUrl (e.g. a CDN) wins and is injected
  // as-is; otherwise we serve the bundled widget ourselves at DEFAULT_WIDGET_ROUTE. If neither
  // is available, no UI is injected (the /__pw surface still works headless).
  const effectiveWidgetUrl = options.widgetUrl ?? (widgetFile ? DEFAULT_WIDGET_ROUTE : undefined)
  const serveBundledWidget = !options.widgetUrl && widgetFile !== null
  return {
    name: 'devgent',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        const cfg = resolveConfig(options, ctx.server?.config.root ?? process.cwd())
        if (!cfg.enabled) return []
        return headTags(cfg.previewId, effectiveWidgetUrl)
      },
    },
    configureServer(server) {
      const root = server.config.root
      const cfg = resolveConfig(options, root)
      if (!cfg.enabled) return

      // Inject the widget into every html response — works for SSR frameworks (TanStack Start,
      // no static index.html) AND plain index.html (where transformIndexHtml already injected,
      // so the inject middleware sees the marker and skips). Unshifted onto the connect stack so
      // it wraps the response BEFORE the framework's html middleware writes it, regardless of
      // plugin order. Serve the bundled widget too, so the host app needs only the plugin.
      if (effectiveWidgetUrl) {
        server.middlewares.stack.unshift({route: '', handle: makeWidgetInject(effectiveWidgetUrl, cfg.previewId)})
      }
      if (serveBundledWidget && widgetFile) server.middlewares.use(makeWidgetServe(widgetFile))

      // Write the agent system prompt once; the chat route appends it to each turn.
      const stateDir = join(cfg.lockDir, '.devgent')
      mkdirSync(stateDir, {recursive: true})
      const appendSystemPromptFile = join(stateDir, 'chat-system-prompt.txt')
      writeFileSync(appendSystemPromptFile, cfg.systemPrompt)

      // The agent calls `devgent tools …` from Bash, but `devgent` isn't on PATH. Drop a
      // shim on the spawned agent's PATH → the @devgent/cli bin, so `devgent tools` resolves.
      const binDir = join(stateDir, 'bin')
      mkdirSync(binDir, {recursive: true})
      const shim = join(binDir, 'devgent')
      try {
        const binPath = require.resolve('@devgent/cli/bin')
        rmSync(shim, {force: true})
        symlinkSync(binPath, shim)
      } catch {
        // best effort — without the shim (e.g. @devgent/cli not installed) the agent falls
        // back to whatever `devgent` is already on PATH.
      }
      const agentPath = `${binDir}${delimiter}${process.env.PATH ?? ''}`

      // One shared uiBus lets the vitest route inject its card onto the live chat turn.
      const uiBus = makeUiBus()
      server.middlewares.use(
        makeChatRoute({
          cwd: root,
          lockDir: cfg.lockDir,
          previewId: cfg.previewId,
          initialSessionId: cfg.claudeSessionId,
          appendSystemPromptFile,
          uiBus,
          spawnClaude: (args, cwd) => {
            const child = spawn(cfg.claudePath, args, {
              cwd,
              stdio: ['ignore', 'pipe', 'pipe'],
              env: {...process.env, PATH: agentPath, DEVGENT_PORT: String(serverPort(server))},
            })
            return {
              pid: child.pid ?? -1,
              stdout: child.stdout!,
              stderr: child.stderr!,
              kill: () => {
                child.kill('SIGTERM')
              },
            }
          },
        }),
      )

      const openInEditor = makeEditorOpener(
        (file, line) => launchEditor(`${file}:${line}`),
        4000,
        () => Date.now(),
      )
      server.middlewares.use(makeToolsRoute(server as unknown as ToolsServer, openInEditor))

      // Results are rendered from the agent's `devgent tools vitest run` tool-result in the
      // chat transcript and streamed live over /__pw/vitest/stream while a run is active.
      const vitest = makeVitestManager(root)
      server.middlewares.use(makeVitestRoute(vitest))
      server.httpServer?.on('close', () => void vitest.stop())
    },
  }
}
