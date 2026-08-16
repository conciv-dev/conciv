import {Mascot, type MascotState} from '@conciv/mascot/react'
import {useState} from 'react'

type RobotMood = {state: MascotState; working: boolean; follow: boolean}

const moodOf = (hovered: boolean, working: boolean): RobotMood => ({
  state: hovered && !working ? 'awake' : 'rest',
  working,
  follow: !hovered && !working,
})

const labelFor = (working: boolean): string => (working ? 'Stop the robot thinking' : 'Make the robot think')

export function RobotFab() {
  const [hovered, setHovered] = useState(false)
  const [working, setWorking] = useState(false)

  return (
    <button
      type="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setWorking((current) => !current)}
      aria-label={labelFor(working)}
      className="grid size-14 cursor-pointer place-items-center rounded-full border bg-card shadow-[0_10px_24px_-12px_oklch(0.23_0.012_65/0.5)] transition-shadow hover:shadow-[0_12px_28px_-12px_oklch(0.23_0.012_65/0.65)]"
    >
      <Mascot className="size-11" {...moodOf(hovered, working)} />
    </button>
  )
}
