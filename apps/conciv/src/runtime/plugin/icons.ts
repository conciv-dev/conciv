import type {Component} from 'solid-js'
import type {LucideProps} from 'lucide-solid'
import type {IconName} from '@conciv/plugin/experimental'
import AppWindowIcon from 'lucide-solid/icons/app-window'
import ArrowDownIcon from 'lucide-solid/icons/arrow-down'
import ArrowUpIcon from 'lucide-solid/icons/arrow-up'
import BanIcon from 'lucide-solid/icons/ban'
import BlocksIcon from 'lucide-solid/icons/blocks'
import CheckIcon from 'lucide-solid/icons/check'
import ChevronDownIcon from 'lucide-solid/icons/chevron-down'
import ChevronLeftIcon from 'lucide-solid/icons/chevron-left'
import ChevronRightIcon from 'lucide-solid/icons/chevron-right'
import ChevronUpIcon from 'lucide-solid/icons/chevron-up'
import ChevronsUpDownIcon from 'lucide-solid/icons/chevrons-up-down'
import CircleIcon from 'lucide-solid/icons/circle'
import CircleAlertIcon from 'lucide-solid/icons/circle-alert'
import CircleCheckBigIcon from 'lucide-solid/icons/circle-check-big'
import CircleDashedIcon from 'lucide-solid/icons/circle-dashed'
import CircleQuestionMarkIcon from 'lucide-solid/icons/circle-question-mark'
import CircleXIcon from 'lucide-solid/icons/circle-x'
import ClapperboardIcon from 'lucide-solid/icons/clapperboard'
import ClipboardCopyIcon from 'lucide-solid/icons/clipboard-copy'
import ClockIcon from 'lucide-solid/icons/clock'
import CodeIcon from 'lucide-solid/icons/code'
import Columns2Icon from 'lucide-solid/icons/columns-2'
import CompassIcon from 'lucide-solid/icons/compass'
import ComponentIcon from 'lucide-solid/icons/component'
import CopyIcon from 'lucide-solid/icons/copy'
import CrosshairIcon from 'lucide-solid/icons/crosshair'
import DownloadIcon from 'lucide-solid/icons/download'
import EllipsisIcon from 'lucide-solid/icons/ellipsis'
import ExternalLinkIcon from 'lucide-solid/icons/external-link'
import EyeIcon from 'lucide-solid/icons/eye'
import EyeOffIcon from 'lucide-solid/icons/eye-off'
import FileDiffIcon from 'lucide-solid/icons/file-diff'
import FilePenIcon from 'lucide-solid/icons/file-pen'
import FileTextIcon from 'lucide-solid/icons/file-text'
import FoldVerticalIcon from 'lucide-solid/icons/fold-vertical'
import GripVerticalIcon from 'lucide-solid/icons/grip-vertical'
import InboxIcon from 'lucide-solid/icons/inbox'
import ItalicIcon from 'lucide-solid/icons/italic'
import KeyboardIcon from 'lucide-solid/icons/keyboard'
import LayoutPanelTopIcon from 'lucide-solid/icons/layout-panel-top'
import LayoutTemplateIcon from 'lucide-solid/icons/layout-template'
import LinkIcon from 'lucide-solid/icons/link'
import ListChecksIcon from 'lucide-solid/icons/list-checks'
import ListFilterIcon from 'lucide-solid/icons/list-filter'
import ListTodoIcon from 'lucide-solid/icons/list-todo'
import LoaderIcon from 'lucide-solid/icons/loader'
import LoaderCircleIcon from 'lucide-solid/icons/loader-circle'
import LockIcon from 'lucide-solid/icons/lock'
import Maximize2Icon from 'lucide-solid/icons/maximize-2'
import MessageCircleOffIcon from 'lucide-solid/icons/message-circle-off'
import MessageSquareIcon from 'lucide-solid/icons/message-square'
import MessageSquarePlusIcon from 'lucide-solid/icons/message-square-plus'
import MonitorIcon from 'lucide-solid/icons/monitor'
import MoonIcon from 'lucide-solid/icons/moon'
import MousePointerClickIcon from 'lucide-solid/icons/mouse-pointer-click'
import PaletteIcon from 'lucide-solid/icons/palette'
import PaperclipIcon from 'lucide-solid/icons/paperclip'
import PencilIcon from 'lucide-solid/icons/pencil'
import PictureInPicture2Icon from 'lucide-solid/icons/picture-in-picture-2'
import PinIcon from 'lucide-solid/icons/pin'
import PlugIcon from 'lucide-solid/icons/plug'
import PlusIcon from 'lucide-solid/icons/plus'
import PointerIcon from 'lucide-solid/icons/pointer'
import PresentationIcon from 'lucide-solid/icons/presentation'
import PuzzleIcon from 'lucide-solid/icons/puzzle'
import RefreshCwIcon from 'lucide-solid/icons/refresh-cw'
import RotateCcwIcon from 'lucide-solid/icons/rotate-ccw'
import RotateCwIcon from 'lucide-solid/icons/rotate-cw'
import ScanSearchIcon from 'lucide-solid/icons/scan-search'
import SearchIcon from 'lucide-solid/icons/search'
import SettingsIcon from 'lucide-solid/icons/settings'
import ShieldIcon from 'lucide-solid/icons/shield'
import ShieldAlertIcon from 'lucide-solid/icons/shield-alert'
import ShieldCheckIcon from 'lucide-solid/icons/shield-check'
import ShieldQuestionMarkIcon from 'lucide-solid/icons/shield-question-mark'
import SlidersHorizontalIcon from 'lucide-solid/icons/sliders-horizontal'
import SparklesIcon from 'lucide-solid/icons/sparkles'
import SquareIcon from 'lucide-solid/icons/square'
import SquareCheckIcon from 'lucide-solid/icons/square-check'
import SquarePenIcon from 'lucide-solid/icons/square-pen'
import SquareTerminalIcon from 'lucide-solid/icons/square-terminal'
import StrikethroughIcon from 'lucide-solid/icons/strikethrough'
import SunIcon from 'lucide-solid/icons/sun'
import TerminalIcon from 'lucide-solid/icons/terminal'
import TextCursorInputIcon from 'lucide-solid/icons/text-cursor-input'
import TrashIcon from 'lucide-solid/icons/trash'
import TriangleAlertIcon from 'lucide-solid/icons/triangle-alert'
import UnderlineIcon from 'lucide-solid/icons/underline'
import UnplugIcon from 'lucide-solid/icons/unplug'
import WandSparklesIcon from 'lucide-solid/icons/wand-sparkles'
import WrenchIcon from 'lucide-solid/icons/wrench'
import XIcon from 'lucide-solid/icons/x'

export const icons: Record<IconName, Component<LucideProps>> = {
  'app-window': AppWindowIcon,
  'arrow-down': ArrowDownIcon,
  'arrow-up': ArrowUpIcon,
  ban: BanIcon,
  blocks: BlocksIcon,
  check: CheckIcon,
  'chevron-down': ChevronDownIcon,
  'chevron-left': ChevronLeftIcon,
  'chevron-right': ChevronRightIcon,
  'chevron-up': ChevronUpIcon,
  'chevrons-up-down': ChevronsUpDownIcon,
  circle: CircleIcon,
  'circle-alert': CircleAlertIcon,
  'circle-check-big': CircleCheckBigIcon,
  'circle-dashed': CircleDashedIcon,
  'circle-question-mark': CircleQuestionMarkIcon,
  'circle-x': CircleXIcon,
  clapperboard: ClapperboardIcon,
  'clipboard-copy': ClipboardCopyIcon,
  clock: ClockIcon,
  code: CodeIcon,
  'columns-2': Columns2Icon,
  compass: CompassIcon,
  component: ComponentIcon,
  copy: CopyIcon,
  crosshair: CrosshairIcon,
  download: DownloadIcon,
  ellipsis: EllipsisIcon,
  'external-link': ExternalLinkIcon,
  eye: EyeIcon,
  'eye-off': EyeOffIcon,
  'file-diff': FileDiffIcon,
  'file-pen': FilePenIcon,
  'file-text': FileTextIcon,
  'fold-vertical': FoldVerticalIcon,
  'grip-vertical': GripVerticalIcon,
  inbox: InboxIcon,
  italic: ItalicIcon,
  keyboard: KeyboardIcon,
  'layout-panel-top': LayoutPanelTopIcon,
  'layout-template': LayoutTemplateIcon,
  link: LinkIcon,
  'list-checks': ListChecksIcon,
  'list-filter': ListFilterIcon,
  'list-todo': ListTodoIcon,
  loader: LoaderIcon,
  'loader-circle': LoaderCircleIcon,
  lock: LockIcon,
  'maximize-2': Maximize2Icon,
  'message-circle-off': MessageCircleOffIcon,
  'message-square': MessageSquareIcon,
  'message-square-plus': MessageSquarePlusIcon,
  monitor: MonitorIcon,
  moon: MoonIcon,
  'mouse-pointer-click': MousePointerClickIcon,
  palette: PaletteIcon,
  paperclip: PaperclipIcon,
  pencil: PencilIcon,
  'picture-in-picture-2': PictureInPicture2Icon,
  pin: PinIcon,
  plug: PlugIcon,
  plus: PlusIcon,
  pointer: PointerIcon,
  presentation: PresentationIcon,
  puzzle: PuzzleIcon,
  'refresh-cw': RefreshCwIcon,
  'rotate-ccw': RotateCcwIcon,
  'rotate-cw': RotateCwIcon,
  'scan-search': ScanSearchIcon,
  search: SearchIcon,
  settings: SettingsIcon,
  shield: ShieldIcon,
  'shield-alert': ShieldAlertIcon,
  'shield-check': ShieldCheckIcon,
  'shield-question-mark': ShieldQuestionMarkIcon,
  'sliders-horizontal': SlidersHorizontalIcon,
  sparkles: SparklesIcon,
  square: SquareIcon,
  'square-check': SquareCheckIcon,
  'square-pen': SquarePenIcon,
  'square-terminal': SquareTerminalIcon,
  strikethrough: StrikethroughIcon,
  sun: SunIcon,
  terminal: TerminalIcon,
  'text-cursor-input': TextCursorInputIcon,
  trash: TrashIcon,
  'triangle-alert': TriangleAlertIcon,
  underline: UnderlineIcon,
  unplug: UnplugIcon,
  'wand-sparkles': WandSparklesIcon,
  wrench: WrenchIcon,
  x: XIcon,
}
