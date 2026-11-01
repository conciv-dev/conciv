# OCR models

PaddleOCR PP-OCRv6 tiny models, read by the design extension's text reader through `ppu-paddle-ocr` on
`onnxruntime-web`. They are vendored so the reader downloads nothing at runtime.

| file                    | role                       |
| ----------------------- | -------------------------- |
| `PP-OCRv6_tiny_det.ort` | text detection             |
| `PP-OCRv6_tiny_rec.ort` | text recognition           |
| `ppocrv6_tiny_dict.txt` | recognition character list |

Source: the `v6-tiny` preset of `ppu-paddle-ocr` 6.6.1 (`V6_TINY_MODEL` in its `model-catalogue.js`), which serves
PaddleOCR's PP-OCRv6 tiny release converted to ONNX Runtime format from
`https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/main`:

- `detection/ort/PP-OCRv6_tiny_det.ort`
- `recognition/ort/PP-OCRv6_tiny_rec.ort`
- `recognition/ppocrv6_tiny_dict.txt`

License: Apache-2.0, PaddleOCR (see `LICENSE`).

SHA-256:

```text
2816e82d26a09d6af722492f80f3059d458377c084eca88f34d84ddf9b385580  PP-OCRv6_tiny_det.ort
efc46adf1bde1e05b58748268abb0e71791bfa8616c435676bbca13d1ea47767  PP-OCRv6_tiny_rec.ort
2f3717bbd530b681b6db3be35cc485e8a41a932b9558b833986bf0894eb21f2d  ppocrv6_tiny_dict.txt
```
