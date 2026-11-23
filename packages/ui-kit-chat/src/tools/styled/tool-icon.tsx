import type {JSX} from 'solid-js'
import CircleHelp from 'lucide-solid/icons/circle-question-mark'

type IconRender = (props: {size: number}) => JSX.Element

export const GENERIC_TOOL_ICON: IconRender = (props) => <CircleHelp size={props.size} />
