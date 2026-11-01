import {chromium} from 'playwright'
const browser = await chromium.launch()
for (const url of ['http://localhost:5761/', 'https://conciv.dev/']) {
  const page = await browser.newPage()
  await page.goto(url, {waitUntil: 'networkidle'})
  const found = await page.evaluate(() => {
    const out = new Set<string>()
    const walk = (rules: CSSRuleList) => {
      for (const r of Array.from(rules)) {
        if (r instanceof CSSMediaRule) { if (r.media.mediaText.includes('width')) out.add(r.media.mediaText); walk(r.cssRules) }
        if (r instanceof CSSContainerRule) out.add("container: " + r.conditionText)
        if (!(r instanceof CSSMediaRule) && "cssRules" in r) walk((r as CSSGroupingRule).cssRules)
      }
    }
    for (const s of Array.from(document.styleSheets)) { try { walk(s.cssRules) } catch { out.add('cross-origin sheet: ' + s.href) } }
    return [...out]
  })
  console.log(url, found)
  await page.close()
}
await browser.close()
