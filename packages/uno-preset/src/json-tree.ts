import {toEscapedSelector, type Rule} from 'unocss'

export const jsonTree: Rule = [
  /^json-tree$/,
  (_match, {rawSelector}) => {
    const s = toEscapedSelector(rawSelector)
    return `
${s}{display:flex;flex-direction:column}

${s} [data-part=branch]{block-size:100%}

${s} [data-part=branch-control],
${s} [data-part=item]{
  display:flex;
  align-items:center;
  gap:.25rem;
  box-sizing:border-box;
  block-size:100%;
  line-height:1rem;
  padding-block:.125rem;
  padding-inline-end:.25rem;
  padding-inline-start:calc((var(--depth) - 1) * .75rem);
}

${s} [data-part=branch-control]{cursor:pointer}

${s} [data-part=branch-control]:hover,
${s} [data-part=item]:hover{background:var(--chat-fill)}

${s} [data-part=branch-control]:focus-visible,
${s} [data-part=item]:focus-visible{
  outline:.125rem solid var(--chat-accent);
  outline-offset:-2px;
}

${s} [data-part=branch-text],
${s} [data-part=item-text]{
  flex:1;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

${s} [data-part=branch-indicator]{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
  transition:rotate 150ms var(--chat-ease);
}
${s} [data-part=branch-indicator][data-state=open]{rotate:90deg}

${s} [data-kind=key],
${s} [data-kind=colon],
${s} [data-kind=preview-text]{color:var(--chat-text-3)}
${s} [data-type=string]{color:var(--chat-accent-link)}
${s} [data-type=number],
${s} [data-type=boolean]{color:var(--chat-success)}

${s} svg{width:.75rem;height:.75rem;flex-shrink:0}
`
  },
]
