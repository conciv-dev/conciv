type StatProps = {label: string; tone?: 'up' | 'down'}

function Stat(props: StatProps) {
  return <p data-tone={props.tone}>{props.label}</p>
}

export {Stat, Stat as StatCard}
