import {makeVocabularyRule} from './vocabulary.js'

const REWRITE_BANNED_TERMS = [
  'bridge',
  'pipeline',
  'maintenance',
  'manager',
  'sendWhenAvailable',
  'holdAndFlush',
  'veto',
  'epoch',
  'snapshotKey',
  'externalRev',
  'forceSend',
  'adopt',
  'attach',
  'presence',
]

const PREEXISTING_DEV_BUNDLER_NAMES = ['BundlerBridge']

const PREEXISTING_MODULES = ['packages/harness-init/src/claude/bridge.ts', 'packages/oxlint-plugin/src/']

const DEV_BUNDLER_BRIDGE_PATHS = [
  'packages/core/src/app.ts',
  'packages/core/src/start.ts',
  'packages/core/src/api/rpc/router.ts',
  'packages/core/src/api/rpc/mount.ts',
  'packages/protocol/src/bundler-types.ts',
  'packages/plugin/src/',
]

const NATIVE_AND_REACT_BRIDGE_PATHS = [
  'packages/extensions/ios/',
  'packages/publish/src/cli.ts',
  'packages/publish/src/swift-mirror.ts',
  'packages/page/src/',
  'packages/embed/src/mount-impl.tsx',
]

const PRE_REWRITE_BRIDGE_PATHS = [
  'packages/harness-init/src/',
  'packages/harness/src/claude/',
  'packages/harness/src/codex/index.ts',
  'packages/core/src/chat/tool-names.ts',
  'packages/extensions/whiteboard/src/client/overlay.tsx',
]

const HARNESS_CONNECT_ATTACH_PATHS = [
  'packages/harness/src/claude/',
  'packages/harness/src/codex/history.ts',
  'packages/harness-testkit/src/create-testkit.ts',
  'packages/protocol/src/harness-types.ts',
]

const COMPOSER_ATTACHMENT_INGRESS_PATHS = [
  'apps/conciv/src/pane/chat-pane.tsx',
  'packages/extension/src/hooks.tsx',
  'packages/extension/src/host-context.ts',
  'packages/extension-testkit/src/host/host-runtime.tsx',
  'packages/extensions/recorder/src/',
]

const PRE_REWRITE_ATTACH_PATHS = [
  'apps/site/src/components/landing/',
  'packages/extensions/terminal/src/server/pty-sessions.ts',
  'packages/page/src/react-bridge.ts',
  'packages/try/src/cli.ts',
  'packages/vitest-config/src/summary.ts',
]

const PREEXISTING_TERM_SITES = [
  {term: 'bridge', paths: [...DEV_BUNDLER_BRIDGE_PATHS, ...NATIVE_AND_REACT_BRIDGE_PATHS, ...PRE_REWRITE_BRIDGE_PATHS]},
  {term: 'epoch', paths: ['packages/db/src/run-schema.ts', 'packages/db/src/run-queries.ts']},
  {
    term: 'presence',
    paths: [
      'packages/ui-kit-system/src/',
      'packages/extensions/recorder/src/',
      'packages/extensions/whiteboard/src/tool/comment/server.ts',
    ],
  },
  {
    term: 'manager',
    paths: [
      'packages/extensions/test-runner/src/',
      'packages/extensions/test-runner/vitest.config.ts',
      'packages/cli/src/init/',
    ],
  },
  {term: 'pipeline', paths: ['packages/extension-testkit/src/test-host-config.ts']},
  {
    term: 'attach',
    paths: [...HARNESS_CONNECT_ATTACH_PATHS, ...COMPOSER_ATTACHMENT_INGRESS_PATHS, ...PRE_REWRITE_ATTACH_PATHS],
  },
]

export default makeVocabularyRule({
  terms: REWRITE_BANNED_TERMS,
  allowedNames: PREEXISTING_DEV_BUNDLER_NAMES,
  exemptFiles: PREEXISTING_MODULES,
  allowedTermPaths: PREEXISTING_TERM_SITES,
  message:
    "'{{name}}' carries banned rewrite vocabulary '{{term}}' (chat rewrite, map conciv-dev/conciv#177): that domain was deleted; name the thing after its live domain instead.",
})
