export function Toolbar(props: {variant: string | null}) {
  const style = toolbarStyle(props.variant)
  return (
    <header className="Lib-toolbar toolbar pl-8" style={style}>
      <button type="button">Export</button>
      <button type="button">Create</button>
    </header>
  )
}

function toolbarStyle(variant: string | null) {
  return {
    backgroundColor: variant === 'recolor' ? '#f5f5f5' : '#ffffff',
    width: variant === 'wide' ? 680 : 640,
    ...(variant === 'target' ? {paddingRight: 0} : {}),
  }
}
