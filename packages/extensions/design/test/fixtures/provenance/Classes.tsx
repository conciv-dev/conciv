import clsx from 'clsx'

type Props = {active: boolean; label: string}

export function Classes(props: Props) {
  const active = props.active
  const label = props.label.trim()
  return (
    <div id="tools" className={clsx('toolbar', active ? 'pl-8' : 'pl-4')}>
      {label}
    </div>
  )
}
