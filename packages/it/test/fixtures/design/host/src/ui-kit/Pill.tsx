import {createElement, type HTMLAttributes} from 'react'
import '../chip.css'

export function Pill(props: HTMLAttributes<HTMLSpanElement>) {
  return createElement('span', {...props, className: 'chip'})
}
