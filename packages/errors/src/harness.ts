import {defineErrorCatalog} from 'evlog'

export const harnessErrors = defineErrorCatalog('harness', {
  CLAUDE_PATH_HAS_WHITESPACE: {
    message: ({flag, path}: {flag: string; path: string}) =>
      `claudeExecutable: ${flag} path "${path}" contains whitespace. The claude harness cannot pass a path containing whitespace because @tanstack/ai-claude-code splits its executable string on plain spaces before spawning. Move it to a space-free path.`,
    fix: 'Move the project or the conciv state folder to a path with no spaces.',
  },
  CLAUDE_NOT_INSTALLED: {
    message: 'Claude Code is not installed. Install it, then run `claude auth login`.',
    fix: 'Install Claude Code, then run `claude auth login`.',
  },
  CLAUDE_NO_MODELS: {message: 'the Agent SDK listed no Claude models'},
  OPENCODE_MODELS_FAILED: {
    message: ({exit, stderr}: {exit: string; stderr: string}) => `opencode models failed (${exit}): ${stderr}`,
    fix: 'Run `opencode models --verbose` in a terminal to see what goes wrong.',
  },
  FILE_SHRANK: {message: ({path}: {path: string}) => `${path} shrank while it was read`},
  NO_STRUCTURED_OUTPUT: {
    message: ({name}: {name: string}) => `harness '${name}' does not support structured output`,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    harness: typeof harnessErrors
  }
}
