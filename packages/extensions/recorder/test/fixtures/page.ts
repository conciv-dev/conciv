export function pageFixture(children: unknown[]): unknown {
  return {
    id: 1,
    type: 0,
    childNodes: [
      {
        id: 2,
        type: 2,
        tagName: 'html',
        attributes: {},
        childNodes: [{id: 3, type: 2, tagName: 'body', attributes: {}, childNodes: children}],
      },
    ],
  }
}

export function buttonFixture(id: number, textId: number, text: string): unknown {
  return {id, type: 2, tagName: 'button', attributes: {}, childNodes: [{id: textId, type: 3, textContent: text}]}
}
