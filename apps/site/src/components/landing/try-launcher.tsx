import {RobotFab} from './robot-fab'

export function TryLauncher({label, onActivate}: {label: string; onActivate: () => void}) {
  return (
    <div className="fixed bottom-5 right-5 z-40 animate-in fade-in zoom-in-95 duration-200 ease-out motion-reduce:zoom-in-100">
      <RobotFab onActivate={onActivate} label={label} />
    </div>
  )
}
