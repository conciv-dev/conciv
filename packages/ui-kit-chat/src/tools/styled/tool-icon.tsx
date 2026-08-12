import type {JSX} from 'solid-js'
import CircleHelp from 'lucide-solid/icons/circle-question-mark'
import Clock from 'lucide-solid/icons/clock'
import Code from 'lucide-solid/icons/code'
import Component from 'lucide-solid/icons/component'
import Keyboard from 'lucide-solid/icons/keyboard'
import MousePointerClick from 'lucide-solid/icons/mouse-pointer-click'
import ScanSearch from 'lucide-solid/icons/scan-search'
import Wand2 from 'lucide-solid/icons/wand-sparkles'
import {TOOL_ICON_KEYS, type ToolIconKey} from '@conciv/protocol/tool-icon-types'

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
