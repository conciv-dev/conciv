---
'@conciv/page': patch
---

Element captures now inline their images as webp data URIs at rendered size, admitted in document order under the shared 200 KB payload budget, without mutating the live page. Cross-origin images without CORS and conciv-block images stay blank.
