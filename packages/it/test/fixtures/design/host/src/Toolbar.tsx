export function Toolbar(props: {variant: string | null; badge?: boolean; labelColor?: string}) {
  const style = {...toolbarStyle(props.variant), ...(props.badge ? BADGE : {})}
  return (
    <header className="Lib-toolbar toolbar pl-8" style={style}>
      <button type="button" style={props.labelColor === undefined ? undefined : {color: props.labelColor}}>
        Export
      </button>
      <button type="button">Create</button>
    </header>
  )
}

const BADGE = {
  backgroundImage: 'linear-gradient(#426bf2, #426bf2)',
  backgroundSize: '96px 24px',
  backgroundPosition: '48px center',
  backgroundRepeat: 'no-repeat',
}

function toolbarStyle(variant: string | null) {
  return {
    backgroundColor: variant === 'recolor' ? '#f5f5f5' : '#ffffff',
    width: variant === 'wide' ? 680 : 640,
    ...(variant === 'target' ? {paddingRight: 0} : {}),
    ...(variant === null ? {} : {paddingTop: 0}),
  }
}
