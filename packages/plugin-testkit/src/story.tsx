import type {JSX} from 'solid-js'
import {Plugin, type PluginOptions} from '@conciv/plugin/experimental'
import {FakeApp} from './shell/app.js'

const EMPTY = Plugin.define({})

export function PluginShell(props: {id: string; options?: PluginOptions; children: JSX.Element}): JSX.Element {
  return (
    <FakeApp plugin={EMPTY} id={props.id} options={props.options ?? {}} engine={undefined} tools={[]}>
      {props.children}
    </FakeApp>
  )
}
