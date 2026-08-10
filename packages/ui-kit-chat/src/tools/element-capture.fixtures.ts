import type {ElementCapture} from '@conciv/protocol/element-capture-types'

export const ELEMENT_CAPTURE_FIXTURE_CSS =
  'html { padding: 0px; margin: 0px; }body { padding: 0px; margin: 0px; min-height: 100vh; }\n.capture-form { font-family: sans-serif; padding: 12px; background: rgb(245, 245, 247); }.capture-form .cta { background: rgb(37, 99, 235); color: white; border-width: medium; border-style: none; border-color: currentcolor; border-image: initial; border-radius: 6px; padding: 8px 16px; font-weight: 600; }.capture-form input { border: 1px solid rgb(209, 213, 219); border-radius: 4px; padding: 6px 10px; }'

export const ELEMENT_CAPTURE_FIXTURE_FULL: ElementCapture = {
  kind: 'after',
  ts: 1786232403193,
  descriptor: {
    tagName: 'input',
    role: 'textbox',
    accessibleName: 'Email',
    value: 'ada@example.com',
    rect: {x: 175.875, y: 13, width: 167, height: 29},
    selectorPath: 'input#email',
  },
  node: {
    type: 2,
    tagName: 'html',
    attributes: {lang: 'en'},
    childNodes: [
      {
        type: 2,
        tagName: 'body',
        attributes: {},
        childNodes: [
          {
            type: 2,
            tagName: 'div',
            attributes: {class: 'capture-form'},
            childNodes: [
              {
                type: 2,
                tagName: 'section',
                attributes: {id: 'panel'},
                childNodes: [
                  {
                    type: 2,
                    tagName: 'input',
                    attributes: {id: 'email', type: 'text', value: 'ada@example.com', 'data-rr-target': 'true'},
                    childNodes: [],
                    id: 1,
                  },
                ],
                id: 2,
              },
            ],
            id: 3,
          },
        ],
        id: 4,
      },
    ],
    id: 5,
  },
  cssBundleId: 'css18rhxa7dr',
}

export const ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE: ElementCapture = {
  kind: 'before',
  ts: 1786232403196,
  descriptor: {
    tagName: 'button',
    role: 'button',
    accessibleName: 'Submit order',
    rect: {x: 12, y: 12, width: 114.953125, height: 31},
    selectorPath: 'button#cta',
  },
  node: {
    type: 2,
    tagName: 'html',
    attributes: {lang: 'en'},
    childNodes: [
      {
        type: 2,
        tagName: 'body',
        attributes: {},
        childNodes: [
          {
            type: 2,
            tagName: 'div',
            attributes: {class: 'capture-form'},
            childNodes: [
              {
                type: 2,
                tagName: 'section',
                attributes: {id: 'panel'},
                childNodes: [
                  {
                    type: 2,
                    tagName: 'button',
                    attributes: {id: 'cta', class: 'cta', 'data-rr-target': 'true'},
                    childNodes: [{type: 3, textContent: 'Submit order', id: 7}],
                    id: 6,
                  },
                ],
                id: 8,
              },
            ],
            id: 9,
          },
        ],
        id: 10,
      },
    ],
    id: 11,
  },
  cssBundleId: 'css18rhxa7dr',
}

export const ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER: ElementCapture = {
  kind: 'after',
  ts: 1786232403197,
  descriptor: {
    tagName: 'button',
    role: 'button',
    accessibleName: 'Order placed',
    rect: {x: 12, y: 12, width: 114.234375, height: 31},
    selectorPath: 'button#cta',
  },
  node: {
    type: 2,
    tagName: 'html',
    attributes: {lang: 'en'},
    childNodes: [
      {
        type: 2,
        tagName: 'body',
        attributes: {},
        childNodes: [
          {
            type: 2,
            tagName: 'div',
            attributes: {class: 'capture-form'},
            childNodes: [
              {
                type: 2,
                tagName: 'section',
                attributes: {id: 'panel'},
                childNodes: [
                  {
                    type: 2,
                    tagName: 'button',
                    attributes: {id: 'cta', class: 'cta', 'data-rr-target': 'true'},
                    childNodes: [{type: 3, textContent: 'Order placed', id: 13}],
                    id: 12,
                  },
                ],
                id: 14,
              },
            ],
            id: 15,
          },
        ],
        id: 16,
      },
    ],
    id: 17,
  },
  cssBundleId: 'css18rhxa7dr',
}

export const ELEMENT_CAPTURE_FIXTURE_MASKED: ElementCapture = {
  kind: 'after',
  ts: 1786232403197,
  descriptor: {
    tagName: 'input',
    role: 'textbox',
    value: '***',
    rect: {x: 12, y: 43, width: 167, height: 29},
    selectorPath: 'input#secret',
  },
  node: {
    type: 2,
    tagName: 'html',
    attributes: {lang: 'en'},
    childNodes: [
      {
        type: 2,
        tagName: 'body',
        attributes: {},
        childNodes: [
          {
            type: 2,
            tagName: 'div',
            attributes: {class: 'capture-form'},
            childNodes: [
              {
                type: 2,
                tagName: 'section',
                attributes: {id: 'panel'},
                childNodes: [
                  {
                    type: 2,
                    tagName: 'input',
                    attributes: {
                      id: 'secret',
                      type: 'password',
                      autocomplete: 'current-password',
                      value: '***',
                      'data-rr-target': 'true',
                    },
                    childNodes: [],
                    id: 18,
                  },
                ],
                id: 19,
              },
            ],
            id: 20,
          },
        ],
        id: 21,
      },
    ],
    id: 22,
  },
  cssBundleId: 'css18rhxa7dr',
}

export const ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY: ElementCapture = {
  kind: 'after',
  ts: ELEMENT_CAPTURE_FIXTURE_FULL.ts,
  descriptor: ELEMENT_CAPTURE_FIXTURE_FULL.descriptor,
}
