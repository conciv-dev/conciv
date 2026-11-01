# Pairing across development stages

Design = finished dashboard PNG at 1280 (tiled OCR + segmentation): 383 text runs, 44 frames. Truth pair = the DOM element the node sits on in the finished page. Pairer = weighted vote (text 0.3, kind 0.1, structure 0.2, style 0.1, geometry 0.2, pixel 0.1, source 0.1, a11y 0.1; renormalised over voters that apply), margin 0.08, floor 0.45.

| stage | design nodes | truth exists | correct | wrong | ambiguous | abstained (node missing) | abstained (node present) | false pair when missing |
|---|---|---|---|---|---|---|---|---|
| final | 427 | 399 | 349 | 5 | 27 | 0 | 18 | 0 |
| sampledata | 427 | 399 | 196 | 21 | 34 | 0 | 148 | 0 |