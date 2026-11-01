export function Toolbar(props: ToolbarProps) {
  const style = {...toolbarStyle(props.variant), ...(props.badge ? BADGE : {})}
  return (
    <header className="Lib-toolbar toolbar pl-8" style={style}>
      <button type="button" style={buttonStyle({textNoise: props.textNoise, color: props.labelColor})}>
        Export
      </button>
      <button type="button" style={buttonStyle({textNoise: props.textNoise})}>
        Create
      </button>
    </header>
  )
}

type ToolbarProps = {variant: string | null; badge?: boolean; labelColor?: string; textNoise?: boolean}

const BADGE = {
  backgroundImage: 'linear-gradient(#426bf2, #426bf2)',
  backgroundSize: '96px 24px',
  backgroundPosition: '48px center',
  backgroundRepeat: 'no-repeat',
}

const TEXT_NOISE = {
  textShadow: '0.5px 0 0 currentColor, -0.5px 0 0 currentColor, 0 0.5px 0 currentColor, 0 -0.5px 0 currentColor',
}

function buttonStyle(input: {textNoise?: boolean; color?: string}) {
  return {...(input.textNoise ? TEXT_NOISE : {}), ...(input.color === undefined ? {} : {color: input.color})}
}

function toolbarStyle(variant: string | null) {
  return {
    backgroundColor: variant === 'recolor' ? '#f5f5f5' : '#ffffff',
    width: variant === 'wide' ? 680 : 640,
    ...(variant === 'target' ? {paddingRight: 0} : {}),
    ...(variant === null ? {} : {paddingTop: 0}),
  }
}
