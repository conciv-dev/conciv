import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: [
    'src/registry.ts',
    'src/agent-guide.ts',
    'src/detect.ts',
    'src/hub.ts',
    'src/claude/init.ts',
    'src/claude/endpoint.ts',
    'src/claude/install-state.ts',
    'src/claude/names.ts',
    'src/claude/plugin-files.ts',
    'src/json.ts',
    'src/paths.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
