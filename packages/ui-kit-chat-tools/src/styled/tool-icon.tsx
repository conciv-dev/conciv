import type {JSX} from 'solid-js'
import {CircleHelp, Clock, Code, Component, Keyboard, MousePointerClick, ScanSearch, Wand2} from 'lucide-solid'
import {TOOL_ICON_KEYS, type ToolIconKey} from '@conciv/extension/tool'

type IconRender = (props: {size: number}) => JSX.Element

const TOOL_ICON: Record<ToolIconKey, IconRender> = {
  read: (props) => <ScanSearch size={props.size} />,
  pointer: (props) => <MousePointerClick size={props.size} />,
  keyboard: (props) => <Keyboard size={props.size} />,
  react: (props) => <Component size={props.size} />,
  edit: (props) => <Wand2 size={props.size} />,
  script: (props) => <Code size={props.size} />,
  wait: (props) => <Clock size={props.size} />,
}

export const GENERIC_TOOL_ICON: IconRender = (props) => <CircleHelp size={props.size} />

function isIconKey(key: string): key is ToolIconKey {
  return TOOL_ICON_KEYS.some((known) => known === key)
}

export function toolIconRender(key: string | undefined): IconRender {
  if (key === undefined || !isIconKey(key)) return GENERIC_TOOL_ICON
  return TOOL_ICON[key]
}
