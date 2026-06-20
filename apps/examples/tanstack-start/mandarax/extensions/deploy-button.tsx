import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'

// Plain Solid JSX — the mandarax plugin compiles mandarax/extensions/** as a Solid zone, even inside
// this React host app. A composer-action icon is a Solid component the widget renders, authored inline.
const RocketIcon = (props: {class?: string}) => (
  <svg
    class={props.class}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
  >
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
  </svg>
)

// One definition: .server runs it (node), .render draws its card (browser, props inferred from the
// renderer type), promptSnippet documents it.
const deployRun = defineTool({
  name: 'deploy_run',
  description: 'Deploy the current branch',
  inputSchema: z.object({env: z.enum(['staging', 'prod'])}),
  promptSnippet: 'You can deploy with the deploy_run tool.',
})
  .server(({env}) => ({url: `https://${env}.example.com`}))
  .render((props) => <div data-pw-deploy-card>Deploying… ({props.part.name})</div>)

export default defineExtension({id: 'deploy', tools: [deployRun]}).client((mx) => {
  mx.registerComposerAction({
    id: 'deploy',
    label: 'Deploy',
    icon: RocketIcon,
    onClick: (ctx) => ctx.notify('Deploy requested'),
  })
  mx.ui.setStatus('env', 'env: staging')
})
