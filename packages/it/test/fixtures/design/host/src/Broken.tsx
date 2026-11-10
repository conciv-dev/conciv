export function Broken(props: {label?: string}) {
  if (props.label === undefined) throw new Error('broken on purpose\nsecond line')
  return <p data-conciv-key="CoRKHA">{props.label}</p>
}
