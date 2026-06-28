import {splitProps, type JSX, type ValidComponent} from 'solid-js'
import {Dynamic} from 'solid-js/web'

// Our slot escape hatch — NO Ark component. `as` swaps the rendered element/component; `render`
// takes full control and receives the merged DOM props (assistant-ui's asChild, Solid-native). When
// neither is set it renders the default intrinsic tag. API spec §0 / §A.2 util.
export type Slottable<P> = {as?: ValidComponent; render?: (props: P) => JSX.Element}

type DivProps = JSX.HTMLAttributes<HTMLDivElement> & Slottable<JSX.HTMLAttributes<HTMLDivElement>>
type SpanProps = JSX.HTMLAttributes<HTMLSpanElement> & Slottable<JSX.HTMLAttributes<HTMLSpanElement>>
type FormProps = JSX.HTMLAttributes<HTMLFormElement> & Slottable<JSX.HTMLAttributes<HTMLFormElement>>
type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & Slottable<JSX.ButtonHTMLAttributes<HTMLButtonElement>>
type ImgProps = JSX.ImgHTMLAttributes<HTMLImageElement> & Slottable<JSX.ImgHTMLAttributes<HTMLImageElement>>

function Div(props: DivProps): JSX.Element {
  const [local, rest] = splitProps(props, ['as', 'render'])
  return local.render ? local.render(rest) : <Dynamic component={local.as ?? 'div'} {...rest} />
}

function Span(props: SpanProps): JSX.Element {
  const [local, rest] = splitProps(props, ['as', 'render'])
  return local.render ? local.render(rest) : <Dynamic component={local.as ?? 'span'} {...rest} />
}

function Form(props: FormProps): JSX.Element {
  const [local, rest] = splitProps(props, ['as', 'render'])
  return local.render ? local.render(rest) : <Dynamic component={local.as ?? 'form'} {...rest} />
}

function ButtonPrimitive(props: ButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, ['as', 'render'])
  return local.render ? local.render(rest) : <Dynamic component={local.as ?? 'button'} {...rest} />
}

function Img(props: ImgProps): JSX.Element {
  const [local, rest] = splitProps(props, ['as', 'render'])
  return local.render ? local.render(rest) : <Dynamic component={local.as ?? 'img'} {...rest} />
}

export const Primitive = {div: Div, span: Span, form: Form, button: ButtonPrimitive, img: Img}
