import {defineConfig} from 'tsdown'

const entry = [
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
]

export default defineConfig([
  {
    entry,
    platform: 'node',
    tsconfig: 'tsconfig.build.json',
    dts: false,
    fixedExtension: false,
    deps: {
      alwaysBundle: ['@tanstack/ai-acp', '@tanstack/ai-claude-code', '@tanstack/ai-codex', '@tanstack/ai-opencode'],
    },
  },
  {
    entry,
    platform: 'node',
    tsconfig: 'tsconfig.build.json',
    dts: {dtsOnly: true},
    unbundle: true,
    clean: false,
    fixedExtension: false,
  },
])
