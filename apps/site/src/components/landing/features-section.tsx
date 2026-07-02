import {m, useMotionValue, useSpring, useTransform} from 'motion/react'
import {useRef, useState, type ForwardRefExoticComponent, type RefAttributes} from 'react'
import AnimatedContent from '@/components/AnimatedContent'
import SplitText from '@/components/SplitText'
import type {AnimatedIconHandle, AnimatedIconProps} from '@/components/ui/types'
import MessageCircleIcon from '@/components/ui/message-circle-icon'
import MousePointer2Icon from '@/components/ui/mouse-pointer-2-icon'
import TerminalIcon from '@/components/ui/terminal-icon'
import PlugConnectedIcon from '@/components/ui/plug-connected-icon'
import PenIcon from '@/components/ui/pen-icon'
import ShieldCheck from '@/components/ui/shield-check'

type AnimatedIcon = ForwardRefExoticComponent<AnimatedIconProps & RefAttributes<AnimatedIconHandle>>

type Capability = {icon: AnimatedIcon; title: string; body: string}

const CAPABILITIES: Capability[] = [
  {
    icon: MessageCircleIcon,
    title: 'Chat in-app',
    body: 'Talk to an agent that sees your running page and streams its reasoning live.',
  },
  {
    icon: MousePointer2Icon,
    title: 'Page control',
    body: 'It grabs elements, clicks, fills, and live-edits the DOM — then persists to source.',
  },
  {
    icon: TerminalIcon,
    title: 'Live tests',
    body: 'Run Vitest and watch pass/fail cards render inside the app.',
  },
  {
    icon: PlugConnectedIcon,
    title: 'Extensions',
    body: 'Drop a .tsx in conciv/extensions/ and the agent grows a new tool with its own UI.',
  },
  {
    icon: PenIcon,
    title: 'Shared whiteboard',
    body: 'An Excalidraw canvas you and the AI draw on together, with source-anchored comments.',
  },
  {
    icon: ShieldCheck,
    title: 'Approvals',
    body: 'Risky commands surface an Approve / Deny card before they run.',
  },
]

const TILT_MAX = 7
const TILT_SPRING = {stiffness: 300, damping: 28}

function CapabilityCard({
  capability,
  dimmed,
  onHoverStart,
  onHoverEnd,
}: {
  capability: Capability
  dimmed: boolean
  onHoverStart: () => void
  onHoverEnd: () => void
}) {
  const Icon = capability.icon
  const cardRef = useRef<HTMLDivElement>(null)
  const iconRef = useRef<AnimatedIconHandle>(null)

  const normX = useMotionValue(0.5)
  const normY = useMotionValue(0.5)
  const rotateX = useSpring(useTransform(normY, [0, 1], [TILT_MAX, -TILT_MAX]), TILT_SPRING)
  const rotateY = useSpring(useTransform(normX, [0, 1], [-TILT_MAX, TILT_MAX]), TILT_SPRING)

  const track = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    normX.set((event.clientX - rect.left) / rect.width)
    normY.set((event.clientY - rect.top) / rect.height)
  }

  const enter = () => {
    iconRef.current?.startAnimation()
    onHoverStart()
  }

  const leave = () => {
    normX.set(0.5)
    normY.set(0.5)
    iconRef.current?.stopAnimation()
    onHoverEnd()
  }

  return (
    <m.div
      ref={cardRef}
      onMouseMove={track}
      onMouseEnter={enter}
      onMouseLeave={leave}
      animate={{scale: dimmed ? 0.97 : 1, opacity: dimmed ? 0.55 : 1}}
      transition={{duration: 0.18, ease: 'easeOut'}}
      style={{rotateX, rotateY, transformPerspective: 900}}
      className="group relative flex flex-col gap-4 overflow-hidden rounded-[14px] border bg-card p-6 transition-[border-color] duration-300 hover:border-primary/35"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 [background:radial-gradient(ellipse_at_18%_12%,var(--od-accent-soft),transparent_60%)] group-hover:opacity-100"
      />
      <div className="relative z-10 grid size-10 place-items-center rounded-[10px] bg-accent text-accent-foreground">
        <Icon size={19} />
      </div>
      <div className="relative z-10">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{capability.title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{capability.body}</p>
      </div>
      <div
        aria-hidden
        className="absolute bottom-0 left-0 h-[2px] w-0 transition-[width] duration-500 ease-out [background:linear-gradient(90deg,var(--od-accent),transparent)] group-hover:w-full"
      />
    </m.div>
  )
}

export function FeaturesSection() {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <section className="od-dots relative">
      <div className="mx-auto max-w-[1180px] px-8 pb-[72px] pt-[52px]">
        <p className="mb-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
          Capabilities
        </p>
        <SplitText
          text="The whole dev loop, in the page"
          tag="h2"
          splitType="words"
          duration={0.7}
          delay={40}
          from={{opacity: 0, y: 22}}
          to={{opacity: 1, y: 0}}
          className="od-display mb-2 text-[clamp(28px,3.4vw,40px)] font-bold tracking-[-0.025em]"
        />
        <p className="mb-10 max-w-[52ch] text-muted-foreground">
          Everything the agent can do happens right where you're looking — grounded on the real DOM, streamed into the
          thread.
        </p>
        <AnimatedContent distance={44} duration={0.7} ease="power3.out" threshold={0.15}>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((capability) => (
              <CapabilityCard
                key={capability.title}
                capability={capability}
                dimmed={hovered !== null && hovered !== capability.title}
                onHoverStart={() => setHovered(capability.title)}
                onHoverEnd={() => setHovered(null)}
              />
            ))}
          </div>
        </AnimatedContent>
      </div>
    </section>
  )
}
