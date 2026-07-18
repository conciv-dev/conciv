import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('nextjs-component', {
  command: (port) =>
    [
      'DEPLOY_DIR="$(mktemp -d)/app"',
      `pnpm --filter conciv-e2e-nextjs-component deploy --legacy --prod=false "$DEPLOY_DIR"`,
      `cd "$DEPLOY_DIR"`,
      `pnpm exec next dev --port ${port}`,
    ].join(' && '),
})
