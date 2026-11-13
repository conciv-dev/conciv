import {mergeProps, splitProps, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {PolymorphicProps} from '@ark-ui/solid/factory'

type FocusHandler = JSX.FocusEventHandlerUnion<Element, FocusEvent> | undefined
type FocusArgument = Parameters<JSX.FocusEventHandler<Element, FocusEvent>>[0]
type FocusProps = {onFocusIn?: FocusHandler; onFocusOut?: FocusHandler}
type ElementName = keyof JSX.IntrinsicElements

function forwardFocus(handler: FocusHandler, event: FocusArgument): void {
  if (typeof handler === 'function') {
    handler(event)
    return
  }
  handler?.[0](handler[1], event)
}

function nativeFocus(props: FocusProps & JSX.HTMLAttributes<Element>): JSX.HTMLAttributes<Element> {
  const [focus, rest] = splitProps(props, ['onFocusIn', 'onFocusOut'])
  return mergeProps(rest, {
    'on:focusin': (event: FocusArgument) => forwardFocus(focus.onFocusIn, event),
    'on:focusout': (event: FocusArgument) => forwardFocus(focus.onFocusOut, event),
  })
}

function withNativeFocus<U>(
  partProps: (userProps?: U) => JSX.HTMLAttributes<Element>,
): (userProps?: U) => JSX.HTMLAttributes<Element> {
  return (userProps) => nativeFocus(partProps(userProps))
}

type PartProps<E extends ElementName> = PolymorphicProps<E> & {ref?: unknown}

export function nativeFocusPart<E extends ElementName, P extends PartProps<E>>(
  Part: Component<P>,
  element: E,
): Component<P> {
  const tag: string = element
  return (props) => (
    <Part
      {...props}
      asChild={(partProps) => {
        const rebound = withNativeFocus(partProps)
        if (props.asChild) return props.asChild(rebound)
        return <Dynamic component={tag} {...rebound()} ref={props.ref} />
      }}
    />
  )
}
