import {Panel, Plugin, ToolRegistry, type PanelTab} from '@conciv/frontend-plugin-api'
import {z} from 'zod'

const Manifest = z.object({name: z.string(), version: z.string()})

function readManifest(output: string | undefined) {
  try {
    return Manifest.safeParse(JSON.parse(output ?? 'null')).data
  } catch {
    return undefined
  }
}

export const projectVersion = Plugin.define({
  setup(ctx) {
    ctx.add(ToolRegistry, {
      name: 'project_version',
      render: (props) => {
        const manifest = () => readManifest(props.output)
        return (
          <p>
            <ctx.ui.Icon name="box" size="small" />
            {manifest() ? `${manifest()?.name} ${manifest()?.version}` : 'Reading package.json'}
          </p>
        )
      },
    })
  },
})

export const shelf = Plugin.define({
  setup(ctx) {
    const tab: PanelTab = {
      id: 'shelf',
      title: 'Shelf',
      pinned: true,
      label: () => (
        <>
          <ctx.ui.Icon name="box" size="small" />
          Shelf
        </>
      ),
    }
    ctx.add(Panel, {
      id: 'shelf',
      region: 'pane',
      list: () => [tab],
      render: (props) => <p>Plants in {props.session.directory}</p>,
    })
  },
})
