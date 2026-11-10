import {createElement, type HTMLAttributes} from 'react'
import '../chip.css'

export function Badge(props: HTMLAttributes<HTMLSpanElement>) {
  return createElement('span', {...props, className: 'badge'}, createElement('b', {className: 'badge-dot'}))
}
