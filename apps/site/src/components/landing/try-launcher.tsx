import {RobotFab} from './robot-fab'

export function TryLauncher({onOpen}: {onOpen: () => void}) {
  return (
    <div className="fixed bottom-5 right-5 z-40 animate-in fade-in zoom-in-95 duration-200 ease-out motion-reduce:zoom-in-100">
      <RobotFab onActivate={onOpen} label="Open the live demo panel" />
    </div>
  )
}
