import assert from 'node:assert/strict'
import { openTestBrowser, pause } from './helpers/browser.mjs'

const browser = await openTestBrowser()
const base = process.env.PORTFOLIO_TEST_URL ?? 'http://localhost:3000/'
const cards = () => browser.evaluate(`(() => {
  const viewport = document.querySelector('.featured-viewport').getBoundingClientRect()
  return [...document.querySelectorAll('.featured-track .project-card')].map(card => {
    const rect = card.getBoundingClientRect()
    return { href: card.getAttribute('href'), copy: card.dataset.copy,
      visible: rect.width > 0 && rect.right > viewport.left && rect.left < viewport.right }
  })
})()`)
const filter = async name => {
  await browser.evaluate(`[...document.querySelectorAll('.orb-sheet-filters button')].find(button => button.textContent.startsWith(${JSON.stringify(name)})).click()`)
  await pause(250)
}

try {
  for (const width of [1440, 1024, 768, 390]) {
    await browser.viewport(width)
    await browser.goto(base + '?category=projects&view=partial')
    await browser.wait('!!document.querySelector(".featured-track")')
    await pause(850)
    const initial = await cards()
    const uniqueCount = new Set(initial.map(card => card.href)).size

    await filter('Java')
    const filtered = await cards()
    assert.ok(filtered.length > 0, 'Java filter must retain projects')
    assert.equal(filtered.length, new Set(filtered.map(card => card.href)).size, 'a short filtered list must not render loop copies')
    assert.ok(filtered.every(card => card.visible))
    await browser.evaluate('document.querySelector(".featured-viewport").focus()')
    await browser.press('ArrowRight')
    await pause(450)
    assert.deepEqual(await cards(), filtered, 'a list that fits must stay visible after an arrow key')

    await filter('All')
    await browser.click('.orb-sheet-toggle')
    await pause(850)
    const expanded = await cards()
    assert.equal(expanded.length, uniqueCount, 'expanded grid must render exactly one card per project')
    assert.ok(expanded.every(card => card.copy === '1' && card.visible))

    await browser.click('.orb-sheet-toggle')
    await pause(850)
    const partial = await cards()
    const visible = partial.filter(card => card.visible)
    assert.equal(visible.length, new Set(visible.map(card => card.href)).size, 'collapse must not show duplicate projects')
    if (partial.length > uniqueCount) {
      const position = await browser.evaluate('document.querySelector(".featured-track").style.transform')
      await browser.evaluate('document.querySelector(".featured-viewport").focus()')
      await browser.press('ArrowRight')
      await pause(500)
      assert.notEqual(await browser.evaluate('document.querySelector(".featured-track").style.transform'), position, 'overflowing lists must retain carousel navigation')
      if (width === 1440) {
        const point = await browser.evaluate(`(() => { const rect = document.querySelector('.featured-viewport').getBoundingClientRect(); return {x: rect.x + rect.width * .7, y: rect.y + 70} })()`)
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 })
        for (const delta of [70, 180, 280]) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x - delta, y: point.y, button: 'left', buttons: 1 })
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x - 280, y: point.y, button: 'left', clickCount: 1 })
        const released = await browser.evaluate('document.querySelector(".featured-track").style.transform')
        await pause(200)
        assert.notEqual(await browser.evaluate('document.querySelector(".featured-track").style.transform'), released, 'drag momentum must continue after release')
        assert.equal(await browser.evaluate('location.pathname'), '/', 'dragging must not follow a project link')
        await browser.wait('!document.querySelector(".featured-viewport").hasAttribute("data-inertia")')
        await pause(500)
      }
    }

    const link = await browser.evaluate('document.querySelector(".featured-track .project-card[aria-hidden=false]").getAttribute("href")')
    await browser.click('.featured-track .project-card[aria-hidden=false]')
    await browser.wait(`location.pathname === ${JSON.stringify(link)}`)
    await browser.wait('!!document.querySelector(".orb-detail-page")')
    console.log(`PASS project carousel ${width}px: filtered list has no copies, expanded grid is unique, collapse/navigation/detail preserved`)
  }

  // Resize a short list from overflowing on mobile to fitting on desktop.
  await browser.viewport(390)
  await browser.goto(base + '?category=projects&view=partial')
  await browser.wait('!!document.querySelector(".featured-track")')
  await pause(850)
  await filter('Next.js')
  await browser.viewport(1440)
  await pause(850)
  const resized = await cards()
  const visible = resized.filter(card => card.visible)
  assert.equal(visible.length, new Set(visible.map(card => card.href)).size, 'resizing must remeasure loop eligibility')
  await browser.goto(base + '?category=projects&view=expanded')
  await browser.wait('!!document.querySelector(".featured-track")')
  await pause(850)
  const direct = await cards()
  assert.equal(direct.length, new Set(direct.map(card => card.href)).size, 'direct expanded URLs must not render loop copies')
  assert.deepEqual(browser.errors, [])
} finally {
  await browser.close()
}
