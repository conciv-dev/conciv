import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [concivTest()],
    environments: {
      server: {
        entries: [
          'src/adapters/adapters.ts',
          'src/local-sandbox.ts',
          'src/init/registry.ts',
          'src/init/agent-guide.ts',
          'src/init/detect.ts',
          'src/init/hub.ts',
          'src/init/claude/init.ts',
          'src/init/claude/endpoint.ts',
          'src/init/claude/install-state.ts',
          'src/init/claude/names.ts',
          'src/init/claude/plugin-files.ts',
          'src/init/json.ts',
          'src/init/paths.ts',
          'src/registry.ts',
          'src/_shared/cwd.ts',
          'src/_shared/page.ts',
          'src/claude/claude.ts',
          'src/codex/codex.ts',
          'src/opencode/opencode.ts',
          'src/pi/pi.ts',
        ],
        noExternal: [/^@tanstack\/ai-(acp|claude-code|codex|opencode)(\/|$)/],
      },
    },
  }),
)
