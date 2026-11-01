import assert from 'node:assert/strict'
import { openTestBrowser, pause } from './helpers/browser.mjs'

const base = process.env.PORTFOLIO_TEST_URL ?? 'http://localhost:3000/'
const browser = await openTestBrowser()

async function dragHandle(distance, verify, touch) {
  const point = await browser.evaluate(`(() => {
    const handle = document.querySelector('.orb-sheet-handle').getBoundingClientRect()
    return { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }
  })()`)
  if (touch) {
    await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  } else {
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
  }
  try {
    if (touch) await browser.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y + distance }] })
    else await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y + distance, button: 'left', buttons: 1 })
    await browser.wait('document.querySelector(".orb-sheet").dataset.dragging === "true"')
    await verify()
  } finally {
    if (touch) await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    else await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y + distance, button: 'left', clickCount: 1 })
  }
}

const panelHeight = () => browser.evaluate('document.querySelector(".orb-sheet").getBoundingClientRect().height')

try {
  for (const width of [1440, 390]) {
    await browser.viewport(width, 900)
    for (const category of ['projects', 'notes', 'skills', 'journey']) {
      await browser.goto(base)
      await browser.wait('!!document.querySelector("#category-' + category + '")')
      await browser.click('#category-' + category)
      await browser.wait('document.querySelector(".orb-experience").dataset.category === "' + category + '"')
      await browser.wait('document.querySelector(".orb-sheet").getAnimations().some(animation => animation.transitionProperty === "transform")')
      await pause(850)
      const partial = await panelHeight()
      const expected = (category === 'skills' || category === 'journey' ? .67 : width < 769 ? .57 : .52) * 900
      assert.ok(Math.abs(partial - expected) < 2, `${category} ${width}: partial layout is preserved`)

      await dragHandle(-110, async () => {
        assert.ok(Math.abs(await panelHeight() - partial - 110) < 2, `${category} ${width}: the panel must follow the upward drag`)
      }, width < 769)
      await browser.wait('document.querySelector(".orb-sheet").dataset.view === "expanded"')
      await pause(850)
      assert.ok(Math.abs(await panelHeight() - 900) < 2, `${category} ${width}: expanded height`)

      await dragHandle(110, async () => {
        assert.ok(Math.abs(await panelHeight() - 790) < 2, `${category} ${width}: the expanded panel must follow the downward drag`)
      }, width < 769)
      await browser.wait('document.querySelector(".orb-sheet").dataset.view === "partial"')
      await pause(850)
      assert.ok(Math.abs(await panelHeight() - partial) < 2, `${category} ${width}: collapse returns to the original partial height`)

      await browser.click('.orb-sheet-toggle')
      await browser.wait('document.querySelector(".orb-sheet").getAnimations().some(animation => animation.transitionProperty === "height")')
      await pause(850)
      await browser.click('.orb-sheet-toggle')
      await pause(850)
      assert.ok(Math.abs(await panelHeight() - partial) < 2, `${category} ${width}: toggle expansion and collapse`)
      await browser.click('.orb-sheet-close')
      await browser.wait('!document.querySelector(".orb-experience").dataset.category')
      console.log(`PASS panel motion: ${category} ${width}px, entry, live drag, expansion, collapse and close`)
    }
  }
  assert.deepEqual(browser.errors, [])
} finally {
  await browser.close()
}
