import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const baseURL = process.env.PORTFOLIO_TEST_URL ?? "http://localhost:3000/"
const stage = Number(process.argv.find((arg) => arg.startsWith("--stage="))?.split("=")[1] ?? 15)
// Stage 15 validates the current category modes; earlier stages retain legacy UI checks.
const only = process.argv.includes("--only") || stage >= 15
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const executable = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "portfolio-orb-"))
const browser = spawn(executable, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" })
let socket
let pageTargetId
let sequence = 0
const pending = new Map()
const browserErrors = []

async function connect() {
  let port
  for (let i = 0; i < 150; i++) {
    try { port = (await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break } catch { await pause(100) }
  }
  assert.ok(port, "Chrome did not start")
  const targets = await fetch(`http://localhost:${port}/json`).then((res) => res.json())
  const target = targets.find((target) => target.type === "page")
  pageTargetId = target.id
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  }
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Emulation.setFocusEmulationEnabled", { enabled: true })
  await viewport(1440, 900)
}

function send(method, params = {}) {
  const id = ++sequence
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  return response.result.value
}

async function waitFor(expression, timeout = 6000) {
  for (const start = Date.now(); Date.now() - start < timeout;) {
    if (await evaluate(expression)) return
    await pause(50)
  }
  throw new Error(`Timed out: ${expression}`)
}

async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 })
}

async function navigate(query = "") {
  await send("Page.navigate", { url: new URL(query, baseURL).href })
  try {
    await waitFor('document.readyState === "complete" && !!document.querySelector(".orb-experience")',15000)
  } catch(error) {
    console.error('Navigation state',await evaluate('({url:location.href,ready:document.readyState,title:document.title,orb:!!document.querySelector(".orb-experience"),text:document.body?.innerText.slice(0,400)})'),browserErrors)
    throw error
  }
  await pause(350)
}

const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)

async function capture(name) {
  if (!process.env.PORTFOLIO_CAPTURE_DIR) return
  await fs.mkdir(process.env.PORTFOLIO_CAPTURE_DIR, { recursive: true })
  const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
  await fs.writeFile(path.join(process.env.PORTFOLIO_CAPTURE_DIR, `${name}.png`), Buffer.from(image.data, "base64"))
}

async function press(key) {
  const codes = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, Tab: 9 }
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: codes[key], ...(key === "Enter" ? { text: "\r" } : {}) })
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: codes[key] })
}

async function typeSearch(text) {
  await evaluate('document.querySelector(".orb-search input").focus()')
  await send("Input.insertText", { text })
  await pause(100)
}

async function checkSearch() {
  await navigate()
  await typeSearch("  JaVa  ")
  assert.equal(await evaluate('document.querySelector("[role=option] .orb-result-copy > span").textContent'), "Java 학사관리 시스템")
  await press("Enter")
  await waitFor('new URLSearchParams(location.search).get("category") === "projects"')
  await pause(950)
  await click(".orb-sheet-close")
  await waitFor('!document.querySelector(".orb-experience").hasAttribute("data-closing")')
  await typeSearch("java")
  await press("ArrowDown")
  await press("ArrowDown")
  assert.equal(await evaluate('document.querySelector(".orb-search input").getAttribute("aria-activedescendant")'), "result-learn-Java")
  await press("Enter")
  await waitFor('new URLSearchParams(location.search).get("category") === "learning"')
  await navigate()
  await typeSearch("about")
  await press("Escape")
  assert.equal(await evaluate('document.querySelector(".orb-search input").getAttribute("aria-expanded")'), "false")
  await press("ArrowUp")
  assert.equal(await evaluate('document.querySelectorAll("[role=option][aria-selected=true]").length'), 1)
  await click(".orb-search-clear")
  assert.equal(await evaluate('document.querySelector(".orb-search input").value'), "")
  await typeSearch("zz-no-result-zz")
  assert.equal(await evaluate('document.querySelectorAll("[role=option]").length'), 0)
  assert.match(await evaluate('document.querySelector(".orb-search-results").textContent'), /관련 페이지가 없습니다/)
  await click(".orb-search-clear")
  await typeSearch("about")
  await evaluate('document.querySelector(".orb-search input").dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}))')
  await press("Enter")
  assert.equal(await evaluate('location.search'), "")
  await evaluate('document.querySelector(".orb-search input").dispatchEvent(new CompositionEvent("compositionend",{bubbles:true}))')
  await press("Enter")
  await waitFor('new URLSearchParams(location.search).get("category") === "about"')
  console.log("PASS search: java ranking, normalization, arrows, Enter, Escape, clear, empty results, IME")
}

async function checkFocus() {
  await navigate()
  const width = await evaluate('document.querySelector(".orb-search").getBoundingClientRect().width')
  await typeSearch("about")
  await pause(250)
  const focusedWidth = await evaluate('document.querySelector(".orb-search").getBoundingClientRect().width')
  assert.ok(focusedWidth / width <= 1.011 && focusedWidth / width >= 1, "Focus scale must stay at 1.01")
  assert.notEqual(await evaluate('getComputedStyle(document.querySelector(".orb-search")).borderColor'), "rgb(255, 255, 255)")
  assert.equal(await evaluate('[...document.querySelectorAll(".orb-node[data-glowing]")].map(x=>x.id).join(",")'), "category-about")
  await click("#category-about")
  await pause(800)
  assert.equal(await evaluate('document.querySelector("#category-about").getAttribute("aria-pressed")'), "true")
  assert.equal(await evaluate('document.querySelector(".orb-search-wrap").contains(document.activeElement)'), false)
  console.log("PASS focus: bounded scale, focus glow, category match, persistent selection")
}

async function checkFluidOrb() {
  await navigate()
  try { await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "webgl"') }
  catch (error) { console.log("ORB DIAGNOSTIC", await evaluate('JSON.stringify(document.querySelector(".orb-fluid").dataset)')); throw error }
  assert.ok(await evaluate('(()=>{const gl=document.querySelector(".orb-webgl").getContext("webgl");return gl.getBufferParameter(gl.ELEMENT_ARRAY_BUFFER,gl.BUFFER_SIZE)})()') > 10000, "Orb must contain a real indexed mesh")
  const transform = await evaluate('document.querySelector("#category-projects").style.getPropertyValue("--satellite-x")')
  await pause(500)
  assert.notEqual(await evaluate('document.querySelector("#category-projects").style.getPropertyValue("--satellite-x")'), transform)
  await evaluate('document.querySelector("#category-projects").focus()')
  assert.equal(await evaluate('document.activeElement.id'), "category-projects")
  await pause(70)
  const paused = await evaluate('document.querySelector("#category-projects").style.cssText')
  await pause(250)
  assert.equal(await evaluate('document.querySelector("#category-projects").style.cssText'), paused)
  await capture("orb-desktop")
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] })
  try { await waitFor('document.querySelector(".orb-fluid").dataset.renderState === "static"') }
  catch (error) { console.log("MOTION DIAGNOSTIC", await evaluate('JSON.stringify({data:document.querySelector(".orb-fluid").dataset,reduced:matchMedia("(prefers-reduced-motion: reduce)").matches})')); throw error }
  assert.equal(await evaluate('document.querySelector("#category-projects").dataset.motion'), "static")
  await send("Emulation.setEmulatedMedia", { features: [] })
  await click("#category-projects")
  await pause(750)
  await click(".orb-sheet-handle")
  await waitFor('document.querySelector(".orb-fluid").dataset.renderState === "paused"')
  await click(".orb-sheet-close")
  await waitFor('!document.querySelector(".orb-experience").hasAttribute("data-closing")')
  await evaluate('document.querySelector(".orb-webgl").getContext("webgl").getExtension("WEBGL_lose_context").loseContext()')
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "fallback"')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".orb-webgl")).visibility'), "hidden")
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".orb-sphere-art")).opacity'), "1")
  await capture("orb-fallback")
  console.log("PASS Orb: real WebGL mesh, satellite motion/focus pause, reduced motion, hidden pause, context-loss fallback")
}

async function dragHandle(distance) {
  await evaluate('window.__dragLog=[]; for(const name of ["pointerdown","pointermove","pointerup","pointercancel"]) document.querySelector(".orb-sheet-handle").addEventListener(name,e=>window.__dragLog.push([name,e.clientY,e.pointerId,e.buttons]))')
  const point = await evaluate('(()=>{const r=document.querySelector(".orb-sheet-handle").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,height:document.querySelector(".orb-sheet").getBoundingClientRect().height}})()')
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y })
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 })
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y + distance, button: "left", buttons: 1 })
  await pause(60)
  const height = await evaluate('document.querySelector(".orb-sheet").getBoundingClientRect().height')
  if (Math.abs(height - point.height) <= 50) console.log("DRAG DIAGNOSTIC", point, height, await evaluate('JSON.stringify({events:window.__dragLog,data:document.querySelector(".orb-sheet").dataset,style:document.querySelector(".orb-sheet").style.cssText,state:document.querySelector(".orb-experience").className})'), browserErrors)
  assert.ok(Math.abs(height - point.height) > 50, "Panel must follow the drag before release")
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y + distance, button: "left", clickCount: 1 })
}

async function checkTransitions() {
  await navigate()
  for (const id of ["projects", "about", "learning", "contact"]) { await click(`#category-${id}`); await pause(70) }
  await pause(750)
  assert.equal(await evaluate('document.querySelector(".orb-title-row h1").textContent'), "Contact")
  assert.equal(await evaluate('new URLSearchParams(location.search).get("category")'), "contact")
  assert.equal(await evaluate('document.querySelectorAll(".orb-node[aria-pressed=true]").length'), 1)
  assert.ok(Number(await evaluate('getComputedStyle(document.querySelector("#category-projects")).opacity')) < 1)
  await evaluate('window.__panel=document.querySelector(".orb-sheet");window.__content=document.querySelector(".orb-content-grid");true')
  await evaluate('document.querySelector(".orb-sheet-handle").focus()')
  await press("Enter")
  await waitFor('document.querySelector(".orb-experience").classList.contains("orb-state-expanded")')
  await pause(750)
  assert.equal(await evaluate('window.__panel === document.querySelector(".orb-sheet") && window.__content === document.querySelector(".orb-content-grid")'), true)
  assert.equal(await evaluate('document.querySelector(".orb-scene").inert'), true)
  const duration = await evaluate('getComputedStyle(document.querySelector(".orb-scene")).transitionDuration.split(",")[0]')
  assert.ok(parseFloat(duration) >= .55 && parseFloat(duration) <= .75)
  await click(".orb-sheet-toggle")
  await pause(750)
  await dragHandle(-180)
  await waitFor('document.querySelector(".orb-experience").classList.contains("orb-state-expanded")')
  await pause(750)
  await dragHandle(180)
  await waitFor('document.querySelector(".orb-experience").classList.contains("orb-state-partial")')
  await pause(750)
  await click(".orb-sheet-toggle")
  await pause(750)
  await click(".orb-sheet-close")
  await pause(70)
  assert.equal(await evaluate('document.querySelector(".orb-sheet").dataset.view'), "expanded", "Expanded layout must remain during exit")
  await waitFor('location.search === "" && !document.querySelector(".orb-experience").hasAttribute("data-closing")')
  console.log("PASS transitions: latest selection, same panel/content, 680ms, keyboard controls, live drag, one-click close")
}

async function checkArtwork() {
  await navigate()
  assert.match(await evaluate('document.querySelector(".orb-identity").textContent'), /Jang Jumin/)
  const logo = await evaluate('(()=>{const r=document.querySelector(".orb-wordmark").getBoundingClientRect();return {width:r.width,height:r.height}})()')
  assert.ok(logo.width >= 44 && logo.height >= 44)
  await pause(500)
  await capture("home-refined")
  await click("#category-projects")
  await pause(750)
  await capture("projects-partial")
  await click(".orb-sheet-toggle")
  await pause(750)
  const art = await evaluate('[...document.querySelectorAll(".project-card")].filter(x=>x.dataset.copy==="1").map(x=>x.querySelector(".project-artwork").style.cssText)')
  assert.equal(new Set(art).size, 3)
  assert.equal(await evaluate('document.querySelectorAll(".preview-window").length'), 0)
  await capture("projects-expanded")
  await evaluate('[...document.querySelectorAll(".project-card")].find(x=>x.dataset.copy==="1").focus()')
  await press("Enter")
  await waitFor('location.pathname === "/projects/1" && !!document.querySelector(".orb-detail-page")')
  assert.match(await evaluate('document.querySelector(".project-artwork").getAttribute("aria-label")'), /실제 실행 화면이 아닙니다/)
  assert.equal(await evaluate('document.querySelectorAll("[role=tab]").length'), 4)
  await pause(400)
  await capture("project-detail")
  await click(".orb-detail-back")
  await waitFor('!!document.querySelector(".orb-state-expanded")')
  console.log("PASS information/cards: identity, hit targets, distinct labelled artwork, keyboard detail navigation")
}

async function tabTo(selector) {
  for (let count = 0; count < 35; count++) {
    if (await evaluate(`document.activeElement.matches(${JSON.stringify(selector)})`)) return
    await press("Tab")
  }
  throw new Error(`Tab navigation did not reach ${selector}`)
}

async function checkResponsive() {
  for (const [width, height] of [[1440,900],[1024,768],[768,1024],[390,844]]) {
    await viewport(width, height)
    await navigate()
    await pause(250)
    const layout = await evaluate('(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,search:rect(document.querySelector(".orb-search")),nodes:[...document.querySelectorAll(".orb-node")].map(e=>({id:e.id,...rect(e)}))}})()')
    assert.equal(layout.width, width)
    assert.ok(layout.scrollWidth <= width, `${width}px horizontal overflow`)
    const overlaps = (a,b) => a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1
    for (const [index,node] of layout.nodes.entries()) {
      assert.ok(!overlaps(node,layout.search), `${width}px ${node.id} overlaps search`)
      assert.ok(node.x >= -1 && node.right <= width + 1 && node.y >= 0 && node.bottom <= height, `${width}px ${node.id} clipped`)
      assert.ok(node.height >= 43.8, `${width}px ${node.id} hit area too small`)
      for (const other of layout.nodes.slice(index+1)) assert.ok(!overlaps(node,other), `${width}px categories overlap: ${node.id}/${other.id}`)
    }
    await capture(`home-${width}`)
    await click("#category-projects")
    await pause(750)
    const categorySizes = await evaluate('[...document.querySelectorAll(".orb-node")].map(e=>({active:e.dataset.active==="true",fontSize:parseFloat(getComputedStyle(e).fontSize),minHeight:parseFloat(getComputedStyle(e).minHeight),height:e.getBoundingClientRect().height}))')
    const activeNode = categorySizes.find(node => node.active)
    assert.ok(activeNode && categorySizes.filter(node => !node.active).every(node => node.fontSize < activeNode.fontSize && Math.abs(node.height-activeNode.height) <= activeNode.height*.06), `${width}px categories should retain similarly sized hit areas`)
    const reducedPills = await evaluate('[...document.querySelectorAll(".orb-node:not([data-active=true])")].map(e=>{const visual=getComputedStyle(e,"::before");return {content:visual.content,top:visual.top,bottom:visual.bottom,height:e.offsetHeight}})')
    assert.ok(reducedPills.every(visual => visual.content !== "none" && parseFloat(visual.top)/visual.height >= .3 && parseFloat(visual.bottom)/visual.height >= .3), `${width}px inactive category pills should have visibly reduced backgrounds: ${JSON.stringify(reducedPills)}`)
    const partialLayout = await evaluate('(()=>{const top=document.querySelector(".orb-sheet").getBoundingClientRect().top;return {top,nodes:[...document.querySelectorAll(".orb-node")].map(e=>{const r=e.getBoundingClientRect();return {id:e.id,top:r.top,bottom:r.bottom,height:r.height}})}})()')
    for (const node of partialLayout.nodes) {
      assert.ok(node.bottom <= partialLayout.top + 1 && node.top >= 0, `${width}px ${node.id} clipped or covered by partial panel`)
      assert.ok(node.height >= 43.8, `${width}px partial ${node.id} hit area too small`)
    }
    await capture(`partial-${width}`)
    await click(".orb-sheet-toggle")
    await pause(750)
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    await capture(`expanded-${width}`)
    if (width === 390) {
      assert.equal(await evaluate('document.querySelector("#category-projects").dataset.motion'), "static")
      const before = await evaluate('document.querySelector(".orb-sheet-close").getBoundingClientRect().top')
      await evaluate('document.querySelector(".orb-sheet-scroll").scrollTop=250')
      assert.ok(await evaluate('document.querySelector(".orb-sheet-scroll").scrollTop') > 0)
      assert.equal(await evaluate('document.querySelector(".orb-sheet-close").getBoundingClientRect().top'), before)
      await evaluate('document.querySelector(".orb-sheet-scroll").scrollTop=0')
      const point = await evaluate('(()=>{const r=document.querySelector(".orb-sheet-handle").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y, id: 1 }] })
      await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x, y: point.y+140, id: 1 }] })
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await waitFor('!!document.querySelector(".orb-state-partial")')
    }
    console.log(`PASS responsive ${width}px: no overlaps/overflow, visible categories, panel layout`)
  }
  await viewport(1440,900)
  await navigate()
  await tabTo(".orb-search input")
  await send("Input.insertText", { text: "java" })
  await press("ArrowDown")
  await press("Enter")
  await waitFor('new URLSearchParams(location.search).get("category") === "projects"')
  await tabTo(".orb-sheet-toggle")
  await press("Enter")
  await waitFor('!!document.querySelector(".orb-state-expanded")')
  await press("Enter")
  await waitFor('!!document.querySelector(".orb-state-partial")')
  await tabTo(".orb-sheet-close")
  await press("Enter")
  await waitFor('location.search === "" && !document.querySelector(".orb-experience").hasAttribute("data-closing")')
  assert.equal(await evaluate('document.activeElement.id'), "category-projects")
  await press("Enter")
  await waitFor('!!document.querySelector(".orb-state-partial")')
  console.log("PASS keyboard-only: Tab search, result select, expand/collapse/close, category reopen")

  await pause(750)
  const dragPoint = await evaluate('(()=>{const r=document.querySelector(".featured-viewport").getBoundingClientRect();return {x:r.x+r.width*.7,y:r.y+70}})()')
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: dragPoint.x, y: dragPoint.y })
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: dragPoint.x, y: dragPoint.y, button: "left", buttons: 1, clickCount: 1 })
  for (const delta of [70,180,280]) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: dragPoint.x-delta, y: dragPoint.y, button: "left", buttons: 1 })
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: dragPoint.x-280, y: dragPoint.y, button: "left", clickCount: 1 })
  const released = await evaluate('document.querySelector(".featured-track").style.transform')
  await pause(250)
  assert.notEqual(await evaluate('document.querySelector(".featured-track").style.transform'), released)
  assert.equal(await evaluate('location.pathname'), "/")
  console.log("PASS carousel: link drag suppression and momentum preserved")

  await navigate()
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "webgl"')
  await send("Emulation.setFocusEmulationEnabled", { enabled: false })
  const other = await send("Target.createTarget", { url: "about:blank", background: false })
  await send("Target.activateTarget", { targetId: other.targetId })
  await waitFor('document.hidden && document.querySelector(".orb-fluid").dataset.renderState === "paused"')
  await send("Target.activateTarget", { targetId: pageTargetId })
  await send("Target.closeTarget", { targetId: other.targetId })
  await send("Emulation.setFocusEmulationEnabled", { enabled: true })
  await waitFor('document.querySelector(".orb-fluid").dataset.renderState === "running"')
  console.log("PASS background: Orb/satellites pause and resume with tab visibility")
}

async function checkClose() {
  await navigate()
  await click("#category-projects")
  await waitFor('document.querySelector(".orb-experience").classList.contains("orb-state-partial")')
  await pause(950)
  await click(".orb-sheet-close")
  await pause(70)
  assert.equal(await evaluate('document.querySelector(".orb-title-row h1").textContent'), "Projects", "Content must remain during exit")
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".orb-sheet-filters")).display'), "none", "Partial layout must remain during exit")
  assert.equal(await evaluate('document.querySelector(".orb-sheet").inert'), true)
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 })
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 })
  assert.equal(await evaluate('document.querySelector(".orb-sheet").contains(document.activeElement)'), false)
  await waitFor('!document.querySelector(".orb-experience").hasAttribute("data-closing")')
  assert.equal(await evaluate('document.activeElement.id'), "category-projects")
  assert.equal(await evaluate('location.search'), "")
  assert.equal(await evaluate('document.querySelectorAll(".orb-node[aria-pressed=true]").length'), 0)

  await click("#category-projects")
  await pause(150)
  await click(".orb-sheet-close")
  await pause(70)
  await click("#category-about")
  await pause(1000)
  assert.equal(await evaluate('document.querySelector(".orb-title-row h1").textContent'), "About")
  assert.equal(await evaluate('new URLSearchParams(location.search).get("category")'), "about")
  await evaluate("history.back()")
  await waitFor('!document.querySelector(".orb-experience").hasAttribute("data-closing") && location.search === ""')
  assert.equal(await evaluate('document.querySelector(".orb-sheet").inert'), true)
  console.log("PASS panel close: retained content, inert, focus, rapid reopen, browser back")
}

async function checkCategoryLighting() {
  const uniform = (name) => evaluate(`(()=>{const gl=document.querySelector('.orb-webgl').getContext('webgl');const p=gl.getParameter(gl.CURRENT_PROGRAM);const v=gl.getUniform(p,gl.getUniformLocation(p,${JSON.stringify(name)}));return typeof v==='number'?v:Array.from(v)})()`)
  const moveAway = () => send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 12, y: 110 })
  async function hover(id) {
    const point = await evaluate(`(()=>{const r=document.getElementById('category-${id}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point })
    await waitFor(`document.querySelector('.orb-fluid').dataset.lightCategory==='${id}' && document.querySelector('.orb-fluid').dataset.lightSource==='interaction'`)
  }
  await viewport(1440, 900)
  await navigate()
  await moveAway()
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "webgl"')
  for (const id of ["projects", "learning", "experiments", "notes", "about", "contact"]) {
    await hover(id)
    await pause(330)
    const style = await evaluate(`(()=>{const n=document.getElementById('category-${id}');return {color:n.style.getPropertyValue('--node-color'),border:getComputedStyle(n).borderColor,dot:getComputedStyle(n.querySelector('.orb-node-dot')).backgroundColor,scale:parseFloat(getComputedStyle(n).scale),motion:n.dataset.motion,x:n.style.getPropertyValue('--satellite-x')}})()`)
    const rgb = [1,3,5].map((offset) => parseInt(style.color.slice(offset,offset+2),16))
    assert.equal(style.border, `rgb(${rgb.join(", ")})`)
    assert.equal(style.dot, style.border)
    assert.ok(style.scale <= 1.0301 && style.scale >= 1.029)
    assert.equal(style.motion, "paused")
    assert.ok(Math.abs(await uniform("uCategoryStrength") - 1) < .001)
    const color = await uniform("uCategoryColor")
    color.forEach((channel,index) => assert.ok(Math.abs(channel - rgb[index]/255) < .002))
    const direction = await uniform("uCategoryDirection")
    assert.ok(Math.hypot(...direction) > .95)
    await pause(70)
    assert.equal(await evaluate(`document.getElementById('category-${id}').style.getPropertyValue('--satellite-x')`), style.x)
    assert.equal(await evaluate('document.querySelectorAll(".orb-node[data-interacting=true]").length'), 1)
  }
  await capture("category-contact-light")
  await moveAway()
  await pause(110)
  const fading = await uniform("uCategoryStrength")
  assert.ok(fading > .1 && fading < .99, "Leave must fade instead of disappearing immediately")
  await pause(420)
  assert.ok(await uniform("uCategoryStrength") < .001)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "default")
  for (const id of ["projects", "about", "learning", "notes", "experiments"]) { await hover(id); await pause(25) }
  await pause(330)
  const last = await uniform("uCategoryColor")
  assert.ok(Math.abs(last[2] - 234/255) < .002)
  assert.equal(await evaluate('document.querySelectorAll(".orb-node[data-interacting=true]").length'), 1)
  await moveAway()
  await typeSearch("about")
  await pause(480)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "search")
  await hover("projects")
  await pause(280)
  await moveAway()
  await pause(480)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightCategory'), "about")
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "search")
  await navigate("?category=projects&view=partial")
  await pause(750)
  await hover("learning")
  await pause(280)
  await moveAway()
  await pause(480)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightCategory'), "projects")
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "selection")
  assert.ok(Math.abs(await uniform("uCategoryStrength") - .7) < .002)
  await navigate()
  await moveAway()
  await evaluate('document.querySelector(".orb-wordmark").focus()')
  await press("Tab")
  await pause(330)
  assert.equal(await evaluate('document.activeElement.id'), "category-projects")
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightCategory'), "projects")
  assert.equal(await evaluate('document.querySelector("#category-projects").dataset.interacting'), "true")
  await press("Tab")
  await pause(330)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightCategory'), "learning")
  await capture("category-keyboard-light")
  await evaluate('document.activeElement.blur()')
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] })
  await pause(480)
  const time = await uniform("uTime")
  await hover("about")
  await pause(330)
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#category-about")).scale'), "1")
  assert.ok(await uniform("uCategoryStrength") > .99)
  assert.equal(await uniform("uTime"), time)
  await waitFor('document.querySelector(".orb-fluid").dataset.renderState === "static"')
  await send("Emulation.setEmulatedMedia", { features: [] })
  await evaluate('document.querySelector(".orb-webgl").getContext("webgl").getExtension("WEBGL_lose_context").loseContext()')
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "fallback"')
  await hover("contact")
  await pause(330)
  assert.ok(Number(await evaluate('getComputedStyle(document.querySelector(".orb-category-glow")).opacity')) > .6)
  assert.match(await evaluate('document.querySelector(".orb-category-glow").style.background'), /105, 183, 138/)
  await capture("category-fallback-light")
  await moveAway()
  await viewport(390, 844)
  await navigate()
  const touch = await evaluate('(()=>{const r=document.querySelector("#category-about").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...touch, radiusX: 2, radiusY: 2 }] })
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await waitFor('document.querySelector(".orb-fluid").dataset.lightSource === "selection" && document.querySelector(".orb-fluid").dataset.lightCategory === "about"')
  assert.equal(await evaluate('document.querySelectorAll(".orb-node[data-interacting=true]").length'), 0)
  console.log("PASS category lighting: all six colors/directions, pause/1.03 scale, smooth leave, rapid changes, search/selection restoration, keyboard, reduced motion, WebGL fallback, touch")
}

async function checkOrbSurfaceHover() {
  const uniform = (name) => evaluate(`(()=>{const gl=document.querySelector('.orb-webgl').getContext('webgl');const p=gl.getParameter(gl.CURRENT_PROGRAM);const v=gl.getUniform(p,gl.getUniformLocation(p,${JSON.stringify(name)}));return typeof v==='number'?v:Array.from(v)})()`)
  const away = () => send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 10, y: 110 })
  async function move(x, y) {
    const point = await evaluate(`(()=>{const r=document.querySelector('.orb-fluid').getBoundingClientRect();return {x:r.x+r.width*(.5+${x}/2),y:r.y+r.height*(.5-${y}/2)}})()`)
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point })
  }
  async function hoverCategory(id) {
    const point = await evaluate(`(()=>{const r=document.getElementById('category-${id}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point })
  }
  await viewport(1440, 900)
  await navigate()
  await away()
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "webgl"')
  await move(0, .3)
  await waitFor('document.querySelector(".orb-fluid").dataset.lightSource === "orb"')
  await pause(450)
  assert.ok(await uniform("uHoverGlow") > .97)
  assert.ok(await uniform("uHoverMotion") > .99)
  const middle = await uniform("uHoverPoint")
  assert.ok(Math.abs(Math.hypot(...middle) - 1) < .003 && middle[2] > .8)
  await move(.88, .12)
  await pause(400)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.surfaceHover'), "true")
  const edge = await uniform("uHoverPoint")
  assert.ok(edge[0] > .65 && edge[2] < middle[2], "Contact must track the actual curved surface")
  assert.ok(Math.hypot(...await uniform("uPointer")) <= 1.001)
  await capture("orb-surface-edge")
  await move(.99, .85)
  await pause(60)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.surfaceHover'), "false", "Rectangle corners must not count as a sphere hit")
  await move(-.55, .5)
  await pause(400)
  for (let index = 0; index < 12; index++) { await move(index % 2 ? -.65 : .65, .5); await pause(16) }
  const speed = await uniform("uHoverSpeed")
  assert.ok(speed > .15 && speed <= 1)
  assert.ok(await uniform("uHoverMotion") <= 1 && Math.hypot(...await uniform("uPointer")) <= 1.001)
  await capture("orb-surface-fast")
  await away()
  await pause(200)
  const fading = await uniform("uHoverGlow")
  assert.ok(fading > .2 && fading < .98)
  await pause(750)
  assert.ok(await uniform("uHoverGlow") < .001 && await uniform("uHoverMotion") < .001)
  assert.ok(Math.hypot(...await uniform("uPointer")) < .012)
  assert.ok(await uniform("uCategoryStrength") < .001)
  // A position between categories must contain a mix, not a single category color.
  const midpoint = await evaluate(`(()=>{const r=document.querySelector('.orb-fluid').getBoundingClientRect();const angle=id=>{const b=document.getElementById('category-'+id).getBoundingClientRect();return Math.atan2(r.y+r.height/2-b.y-b.height/2,b.x+b.width/2-r.x-r.width/2)};return (angle('projects')+angle('learning'))/2})()`)
  await move(Math.cos(midpoint) * .6, Math.sin(midpoint) * .6)
  await pause(700)
  const blend = await uniform("uGlowColor")
  const colors = await evaluate('[...document.querySelectorAll(".orb-node")].map(node=>{const c=node.style.getPropertyValue("--node-color");return [1,3,5].map(offset=>parseInt(c.slice(offset,offset+2),16)/255)})')
  assert.ok(colors.every(color=>Math.hypot(...blend.map((value,index)=>value-color[index]))>.035), "Category boundary colors must mix")
  await capture("orb-surface-blend")
  await hoverCategory("projects")
  await pause(350)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "interaction")
  assert.ok(await uniform("uHoverGlow") < .001)
  assert.ok(Math.abs((await uniform("uCategoryColor"))[0] - 154/255) < .003)
  await move(-.5, .5)
  await pause(450)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "orb")
  await evaluate('document.querySelector(".orb-wordmark").focus()')
  await press("Tab")
  await pause(350)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "interaction", "Keyboard category focus must win over direct surface hover")
  assert.ok(await uniform("uHoverGlow") < .001)
  await evaluate('document.activeElement.blur()')
  await move(0, 0)
  await pause(900)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.surfaceHover'), "true")
  assert.ok(await uniform("uHoverGlow") > .99)
  await typeSearch("about")
  await move(.88, .12)
  await pause(400)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "orb")
  const resultPoint = await evaluate('(()=>{const r=document.querySelector(".orb-search-results").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+25}})()')
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...resultPoint })
  await pause(900)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.surfaceHover'), "false")
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "search")
  assert.equal(await evaluate('document.querySelector(".orb-search input").value'), "about")
  await navigate("?category=projects&view=partial")
  await away()
  await pause(750)
  await move(0, .3)
  await pause(400)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "orb")
  await away()
  await pause(950)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "selection")
  assert.ok(Math.abs(await uniform("uCategoryStrength") - .7) < .003)
  await move(0, .3)
  await pause(300)
  await click(".orb-sheet-toggle")
  await waitFor('document.querySelector(".orb-fluid").dataset.renderState === "paused"')
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.surfaceHover'), "false")
  await pause(750)
  await click(".orb-sheet-toggle")
  await pause(750)
  assert.ok(await uniform("uHoverMotion") < .001 && await uniform("uHoverGlow") < .001, "Collapsing the panel must not restore stale contact")
  await navigate()
  await away()
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] })
  await pause(500)
  const time = await uniform("uTime")
  await move(.5, .5)
  await pause(450)
  assert.ok(await uniform("uHoverGlow") > .97)
  assert.equal(await uniform("uHoverMotion"), 0)
  assert.equal(await uniform("uMotionScale"), 0)
  assert.deepEqual(await uniform("uPointer"), [0,0])
  assert.equal(await uniform("uTime"), time)
  await waitFor('document.querySelector(".orb-fluid").dataset.renderState === "static"')
  await send("Emulation.setEmulatedMedia", { features: [] })
  await away()
  const touchPoint = await evaluate('(()=>{const r=document.querySelector(".orb-fluid").getBoundingClientRect();return {x:r.x+r.width*.7,y:r.y+r.height*.25}})()')
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...touchPoint, radiusX: 2, radiusY: 2 }] })
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...touchPoint, y: touchPoint.y+15, radiusX: 2, radiusY: 2 }] })
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await pause(950)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.surfaceHover'), "false")
  // Start a fresh document after the native touch-scroll gesture before testing
  // a deliberately lost WebGL context with a mouse.
  await navigate()
  await away()
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "webgl"')
  await pause(500)
  await evaluate('document.querySelector(".orb-webgl").getContext("webgl").getExtension("WEBGL_lose_context").loseContext()')
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "fallback"')
  await move(.45, .5)
  await pause(450)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "orb")
  assert.ok(Number(await evaluate('getComputedStyle(document.querySelector(".orb-category-glow")).opacity')) > .5)
  await capture("orb-surface-fallback")
  console.log("PASS Orb surface: curved hit/edge/corner, localized glow, blended categories, speed limits, 780ms return, priority, search exclusion, expanded pause, reduced motion, touch, fallback")
}

async function checkOrbProximity() {
  const uniform = (name) => evaluate(`(()=>{const gl=document.querySelector('.orb-webgl').getContext('webgl');const p=gl.getParameter(gl.CURRENT_PROGRAM);const v=gl.getUniform(p,gl.getUniformLocation(p,${JSON.stringify(name)}));return typeof v==='number'?v:Array.from(v)})()`)
  async function move(x, y) {
    const point = await evaluate(`(()=>{const r=document.querySelector('.orb-fluid').getBoundingClientRect(),radius=r.width/2/Math.tan(Math.PI/10)/Math.sqrt(3.4**2-1);const x=r.x+r.width/2+radius*${x},y=r.y+r.height/2-radius*${y};return {x,y,excluded:!!document.elementFromPoint(x,y)?.closest('.orb-node,.orb-search-results,.orb-sheet')}})()`)
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y })
    return point
  }
  async function radial(distance, angle = 35) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const radians = (angle + attempt * 11) * Math.PI / 180
      const point = await move(Math.cos(radians) * distance, Math.sin(radians) * distance)
      if (!point.excluded) return point
    }
    throw new Error("No unobstructed proximity position")
  }
  await viewport(1440, 900)
  await navigate()
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 10, y: 100 })
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "webgl"')
  const rightInput = await move(1.25, .25)
  assert.equal(rightInput.excluded, false)
  await pause(650)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.proximity'), "true")
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.surfaceHover'), "false")
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "orb")
  assert.equal(await uniform("uHoverMotion"), 0, "Outside proximity must preserve direct-contact-only deformation")
  const right = await uniform("uGlowPoint")
  const rightColor = await uniform("uGlowColor")
  assert.ok(right[0] > .55)
  assert.ok(await uniform("uHoverGlow") > .97, "The inner halo must retain full hover energy")
  await capture("orb-proximity-right")
  await move(-1.25, .25)
  await pause(650)
  const left = await uniform("uGlowPoint")
  const leftColor = await uniform("uGlowColor")
  assert.ok(left[0] < -.55)
  assert.ok(Math.hypot(...rightColor.map((value,index)=>value-leftColor[index])) > .07)
  await capture("orb-proximity-left")
  // Move continuously around the outside, including outside the scene's DOM box.
  let previousPoint = left
  let previousColor = leftColor
  let samples = 0
  for (let index = 0; index < 72; index++) {
    const angle = index / 72 * Math.PI * 2
    const position = await move(Math.cos(angle) * 1.25, Math.sin(angle) * 1.25)
    await pause(65)
    if (position.excluded) continue
    const point = await uniform("uGlowPoint")
    const color = await uniform("uGlowColor")
    if (index > 6) {
      assert.ok(Math.hypot(...point.map((value,i)=>value-previousPoint[i])) < .4, "Surface light must follow continuously")
      assert.ok(Math.hypot(...color.map((value,i)=>value-previousColor[i])) < .25, "Distance colors must not jump between categories")
      assert.ok(point[0]*Math.cos(angle)+point[1]*Math.sin(angle) > .35, "Light must stay on the pointer-facing side")
      samples++
    }
    previousPoint=point; previousColor=color
  }
  assert.ok(samples > 40)
  await radial(.97)
  await pause(550)
  const insidePoint = await uniform("uGlowPoint")
  const insideStrength = await uniform("uHoverGlow")
  await radial(1.03)
  await pause(550)
  const outsidePoint = await uniform("uGlowPoint")
  assert.ok(Math.hypot(...insidePoint.map((value,index)=>value-outsidePoint[index])) < .11)
  assert.ok(Math.abs(insideStrength-await uniform("uHoverGlow")) < .025, "Crossing the sphere edge must not change intensity abruptly")
  const strengths=[]
  for (const radius of [1.2,1.5,1.68]) {
    await radial(radius)
    await pause(700)
    strengths.push(await uniform("uHoverGlow"))
  }
  assert.ok(strengths[0] > strengths[1] && strengths[1] > strengths[2] && strengths[2] < .06)
  await radial(1.72)
  await pause(850)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.proximity'), "false")
  assert.ok(await uniform("uHoverGlow") < .001)
  // Moving a category while the pointer stays still must change the distance mix.
  await move(1.25,.25)
  await pause(650)
  const before = await uniform("uGlowColor")
  await evaluate(`(()=>{const n=document.querySelector('#category-projects'),r=document.querySelector('.orb-fluid').getBoundingClientRect();window.__originalCategoryStyle=n.style.cssText;window.__originalCategoryParent=n.parentElement;const x=r.x+r.width*.5+r.width*.5/Math.tan(Math.PI/10)/Math.sqrt(3.4**2-1)*1.25;const y=r.y+r.height*.5-r.width*.5/Math.tan(Math.PI/10)/Math.sqrt(3.4**2-1)*.25;document.body.append(n);n.style.cssText+=';position:fixed;left:'+(x-45)+'px;top:'+(y+40)+'px;right:auto;bottom:auto;min-height:44px;width:90px;transform:none!important;scale:1!important';})()`)
  await pause(650)
  const after = await uniform("uGlowColor")
  assert.ok(Math.hypot(...after.map((value,index)=>value-before[index]))>.08, "Live category screen positions must influence the mix without pointer movement")
  await evaluate('(()=>{const n=document.querySelector("#category-projects");window.__originalCategoryParent.append(n);n.style.cssText=window.__originalCategoryStyle})()')
  const projectPoint = await evaluate('(()=>{const r=document.querySelector("#category-projects").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await send("Input.dispatchMouseEvent", { type:"mouseMoved", ...projectPoint })
  await pause(350)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "interaction")
  assert.ok(await uniform("uHoverGlow") < .001)
  await radial(1.15)
  await pause(600)
  const beforeLeave = await uniform("uHoverGlow")
  await radial(2.4)
  await pause(200)
  assert.ok(await uniform("uHoverGlow") > .1 && await uniform("uHoverGlow") < beforeLeave)
  await pause(700)
  assert.ok(await uniform("uHoverGlow") < .001)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "default")
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] })
  await move(1.25,.25)
  await pause(650)
  assert.ok(await uniform("uHoverGlow") > .4)
  assert.equal(await uniform("uHoverMotion"), 0)
  assert.deepEqual(await uniform("uPointer"), [0,0])
  await send("Emulation.setEmulatedMedia", { features: [] })
  await typeSearch("java")
  const inputPoint = await evaluate('(()=>{const r=document.querySelector(".orb-search input").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await send("Input.dispatchMouseEvent", { type:"mouseMoved", ...inputPoint })
  await pause(850)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.proximity'), "true")
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "orb")
  await navigate("?category=projects&view=partial")
  await pause(750)
  await radial(1.15,90)
  await pause(500)
  const panelPoint=await evaluate('(()=>{const r=document.querySelector(".orb-sheet").getBoundingClientRect();return {x:r.x+r.width*.8,y:r.y+120}})()')
  await send("Input.dispatchMouseEvent", { type:"mouseMoved", ...panelPoint })
  await pause(850)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.proximity'), "false")
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'), "selection")
  await navigate()
  await send("Input.dispatchMouseEvent", { type:"mouseMoved", x:10,y:100 })
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "webgl"')
  await pause(500)
  await evaluate('document.querySelector(".orb-webgl").getContext("webgl").getExtension("WEBGL_lose_context").loseContext()')
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "fallback"')
  await move(1.25,.25)
  await pause(650)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.proximity'), "true")
  assert.ok(Number(await evaluate('getComputedStyle(document.querySelector(".orb-category-glow")).opacity')) > .2)
  await capture("orb-proximity-fallback")
  console.log("PASS proximity: 360-degree outside movement, live distance colors, side tracking, edge continuity, 0.7-radius falloff, 780ms exit, category priority, exclusions, reduced motion, fallback")
}

async function checkMatchedHoverStrength() {
  await viewport(1440,900)
  // Freeze geometry so both paths can be compared against exactly the same pearl image.
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] })
  await navigate()
  await send("Input.dispatchMouseEvent", { type:"mouseMoved", x:10,y:100 })
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "webgl"')
  await pause(900)
  await evaluate(`(()=>{
    window.__readOrbFrame=()=>{const c=document.querySelector('.orb-webgl'),gl=c.getContext('webgl');gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawElements(gl.TRIANGLES,gl.getBufferParameter(gl.ELEMENT_ARRAY_BUFFER,gl.BUFFER_SIZE)/2,gl.UNSIGNED_SHORT,0);const data=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data};
    window.__orbNeutral=window.__readOrbFrame();
    window.__orbUniform=name=>{const gl=document.querySelector('.orb-webgl').getContext('webgl');return gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM),gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM),name))};
    window.__orbPeak=(source,direction)=>{const data=window.__readOrbFrame(),base=window.__orbNeutral,c=document.querySelector('.orb-webgl'),color=Array.from(window.__orbUniform(source==='category'?'uCategoryColor':'uGlowColor'));let peak=0;
      for(let i=0;i<data.length;i+=4){if(base[i+3]<200)continue;const pixel=i/4,x=(pixel%c.width)-c.width/2,y=Math.floor(pixel/c.width)-c.height/2;if(x*direction[0]+y*direction[1]<0)continue;let numerator=0,denominator=0,channels=0;
        for(let channel=0;channel<3;channel++){if(data[i+channel]>=253||base[i+channel]>=240||color[channel]<.08)continue;const tint=color[channel]*(1-base[i+channel]/255*.55);numerator+=(data[i+channel]-base[i+channel])/255*tint;denominator+=tint*tint;channels++}
        if(channels>=2&&denominator>.01)peak=Math.max(peak,numerator/denominator)
      }return {peak,color};
    };return true
  })()`)
  async function transitionEnergy(point) {
    await send("Input.dispatchMouseEvent", { type:"mouseMoved",...point })
    const energy=[]
    for(let count=0;count<12;count++) {
      await pause(30)
      energy.push(await evaluate('Math.min(1,window.__orbUniform("uCategoryStrength")+window.__orbUniform("uHoverGlow"))'))
    }
    assert.ok(Math.min(...energy)>.96,`Interaction handoff must not dim: ${energy}`)
  }
  const ratios=[]
  for(const id of ['projects','learning','experiments','notes','about','contact']) {
    const points=await evaluate(`(()=>{const n=document.querySelector('#category-${id}'),b=n.getBoundingClientRect(),r=document.querySelector('.orb-fluid').getBoundingClientRect(),x=b.x+b.width/2-r.x-r.width/2,y=r.y+r.height/2-b.y-b.height/2,len=Math.hypot(x,y),radius=r.width/2/Math.tan(Math.PI/10)/Math.sqrt(3.4**2-1);return {button:{x:b.x+b.width/2,y:b.y+b.height/2},near:{x:r.x+r.width/2+x/len*radius*1.08,y:r.y+r.height/2-y/len*radius*1.08},direction:[x/len,y/len]}})()`)
    await send("Input.dispatchMouseEvent", { type:"mouseMoved",...points.button })
    await pause(700)
    assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'),'interaction')
    const reference=await evaluate(`window.__orbPeak('category',${JSON.stringify(points.direction)})`)
    if(['projects','learning','contact'].includes(id)) await capture(`strength-${id}-button`)
    await transitionEnergy(points.near)
    await pause(500)
    assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'),'orb')
    assert.ok(await evaluate('window.__orbUniform("uHoverGlow")')>.99)
    const proximity=await evaluate(`window.__orbPeak('proximity',${JSON.stringify(points.direction)})`)
    const ratio=proximity.peak/reference.peak
    ratios.push({category:id,ratio:Number(ratio.toFixed(3))})
    assert.ok(ratio>.9&&ratio<1.1,`Reference light and proximity peaks must match: ${id} ${JSON.stringify({reference,proximity,ratio})}`)
    const intensity=await evaluate(`(()=>{const r=document.querySelector('.orb-fluid').getBoundingClientRect(),radius=r.width/2/Math.tan(Math.PI/10)/Math.sqrt(3.4**2-1),px=${points.near.x},py=${points.near.y};let total=0,value=0,saturation=0;for(const n of document.querySelectorAll('.orb-node')){const b=n.getBoundingClientRect(),hex=n.style.getPropertyValue('--node-color'),rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),v=Math.max(...rgb),s=(v-Math.min(...rgb))/v,weight=1/(.35**2+((px-b.x-b.width/2)**2+(py-b.y-b.height/2)**2)/radius**2)**1.5;total+=weight;value+=v*weight;saturation+=s*weight}const rgb=Array.from(window.__orbUniform('uGlowColor')),v=Math.max(...rgb),s=(v-Math.min(...rgb))/v;return {value:v,saturation:s,expectedValue:value/total,expectedSaturation:saturation/total}})()`)
    assert.ok(Math.abs(intensity.value-intensity.expectedValue)<.015)
    assert.ok(Math.abs(intensity.saturation-intensity.expectedSaturation)<.025)
    if(['projects','learning','contact'].includes(id)) await capture(`strength-${id}-near`)
    await transitionEnergy(points.button)
  }
  await evaluate('document.querySelector(".orb-webgl").getContext("webgl").getExtension("WEBGL_lose_context").loseContext()')
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "fallback"')
  await pause(300)
  const buttonOpacity=Number(await evaluate('getComputedStyle(document.querySelector(".orb-category-glow")).opacity'))
  const near=await evaluate('(()=>{const b=document.querySelector("#category-contact").getBoundingClientRect(),r=document.querySelector(".orb-fluid").getBoundingClientRect(),x=b.x+b.width/2-r.x-r.width/2,y=b.y+b.height/2-r.y-r.height/2,len=Math.hypot(x,y),radius=r.width/2/Math.tan(Math.PI/10)/Math.sqrt(3.4**2-1);return {x:r.x+r.width/2+x/len*radius*1.08,y:r.y+r.height/2+y/len*radius*1.08}})()')
  await send("Input.dispatchMouseEvent", { type:"mouseMoved",...near })
  await pause(850)
  const nearOpacity=Number(await evaluate('getComputedStyle(document.querySelector(".orb-category-glow")).opacity'))
  assert.ok(Math.abs(buttonOpacity-nearOpacity)<.01&&nearOpacity>.64)
  await send("Emulation.setEmulatedMedia", { features: [] })
  console.log('PASS matching hover strength: six pixel-measured peak ratios',JSON.stringify(ratios),'HSV brightness/saturation, bidirectional handoff without energy dip, fallback opacity')
}

async function checkSearchHoverContinuity() {
  await viewport(1440, 900)
  await navigate()
  await waitFor('document.querySelector(".orb-fluid").dataset.renderer === "webgl"')
  const uniform = (name) => evaluate(`(()=>{const gl=document.querySelector('.orb-webgl').getContext('webgl'),v=gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM),gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM),${JSON.stringify(name)}));return typeof v==='number'?v:Array.from(v)})()`)
  async function moveTo(selector, x = .5, y = .5) {
    const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width*${x},y:r.y+r.height*${y}}})()`)
    await send('Input.dispatchMouseEvent', {type:'mouseMoved', ...point})
    return point
  }
  const appearance = () => evaluate(`(()=>{const f=document.querySelector('.orb-search'),s=getComputedStyle(f),icon=getComputedStyle(f.querySelector(':scope > svg')),button=getComputedStyle(f.querySelector('[type=submit]'));return {border:s.borderColor,shadow:s.boxShadow,background:s.backgroundColor,transform:s.transform,duration:s.transitionDuration,icon:icon.color,button:button.color,opacity:button.opacity,width:f.offsetWidth,x:f.getBoundingClientRect().x,disabled:f.querySelector('[type=submit]').disabled}})()`)
  await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:10,y:100})
  await pause(450)
  const resting = await appearance()
  await moveTo('.orb-fluid', .5, .3)
  await waitFor(`(()=>{const gl=document.querySelector('.orb-webgl').getContext('webgl'),p=gl.getParameter(gl.CURRENT_PROGRAM);return gl.getUniform(p,gl.getUniformLocation(p,'uHoverGlow'))>.99})()`)
  for (const [selector,x,y] of [['.orb-search',.06,.5],['.orb-search > svg',.5,.5],['.orb-search input',.5,.5],['.orb-search button[type=submit]',.5,.5],['.orb-fluid',.7,.35]]) {
    await moveTo(selector,x,y)
    for(let i=0;i<5;i++) {
      await pause(50)
      assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'),'orb',selector)
      assert.ok(await uniform('uHoverGlow') > .98,`No brightness dip over ${selector}`)
      assert.ok(await uniform('uHoverMotion') > .98,`Direct surface deformation must continue over ${selector}`)
    }
  }
  await moveTo('.orb-search input')
  await pause(300)
  const hovering = await appearance()
  assert.notEqual(hovering.border,resting.border)
  assert.notEqual(hovering.background,resting.background)
  assert.notEqual(hovering.icon,resting.icon)
  assert.equal(hovering.width,resting.width,'Hover must not change layout width')
  assert.ok(hovering.duration.split(', ').every(value => value === '0.21s'))
  assert.equal(hovering.disabled,true)
  assert.ok(Number(hovering.opacity) < .5)
  assert.notEqual(hovering.button,hovering.icon,'Disabled arrow must remain muted')
  await capture('search-hover-continuous-orb')
  const point=await moveTo('.orb-search input')
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})
  await typeSearch('java')
  // The independently positioned results must not shift the input or its surface hit.
  await moveTo('.orb-search input')
  await pause(750)
  const focused=await appearance()
  assert.notEqual(focused.border,hovering.border)
  assert.equal(focused.disabled,false)
  assert.equal(focused.button,focused.icon)
  await evaluate('document.querySelector(".orb-search input").setSelectionRange(0,4);true')
  await moveTo('.orb-search-clear')
  await pause(150)
  assert.equal(await evaluate('document.querySelector(".orb-search input").selectionEnd'),4)
  assert.ok(await uniform('uHoverGlow') > .98)
  await moveTo('.orb-fluid',.75,.25)
  await pause(450)
  assert.equal((await appearance()).border,focused.border,'Input focus persists after pointer leaves form')
  await capture('search-focus-continuous-orb')
  await press('ArrowDown')
  const selected=await evaluate('document.querySelector(".orb-search input").getAttribute("aria-activedescendant")')
  assert.ok(selected)
  assert.equal(await evaluate(`document.getElementById(${JSON.stringify(selected)}).getAttribute('aria-selected')`),'true')
  await press('Escape')
  assert.equal(await evaluate('document.querySelector(".orb-search input").getAttribute("aria-expanded")'),'false')
  await evaluate('document.querySelector("#category-projects").focus();true')
  await moveTo('.orb-search input')
  await pause(500)
  assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.lightSource'),'interaction')
  assert.ok(await uniform('uHoverGlow') < .001)
  await evaluate('document.activeElement.blur();true')
  await moveTo('.orb-search input')
  await pause(500)
  assert.ok(await uniform('uHoverGlow') > .99)
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await moveTo('.orb-search input')
  await pause(450)
  assert.equal((await appearance()).transform,'none')
  assert.ok(await uniform('uHoverGlow') > .99)
  assert.equal(await uniform('uHoverMotion'),0)
  assert.deepEqual(await uniform('uPointer'),[0,0])
  await send('Emulation.setEmulatedMedia',{features:[]})
  await moveTo('.orb-search button[type=submit]')
  const submit=await moveTo('.orb-search button[type=submit]')
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...submit})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...submit})
  await waitFor('new URLSearchParams(location.search).get("category") === "projects"')
  await viewport(390,844)
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1})
  await navigate()
  const mobile=await moveTo('.orb-search input')
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...mobile,radiusX:2,radiusY:2}]})
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await waitFor('document.activeElement === document.querySelector(".orb-search input")')
  await pause(300)
  assert.equal((await appearance()).border,focused.border)
  await capture('search-mobile-focus')
  await send('Emulation.setTouchEmulationEnabled',{enabled:false})
  console.log('PASS search hover: continuous WebGL light across form/icon/input/clear/disabled+enabled submit, distinct hover/focus, text selection, keyboard, category priority, reduced motion, mobile touch focus')
}

async function checkSearchGlassAndLayout() {
  const bounds = () => evaluate(`(()=>{const r=document.querySelector('.orb-search').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`)
  for (const width of [1440,390]) {
    await viewport(width, width===390?844:900)
    await navigate()
    await typeSearch('')
    await pause(300)
    const origin=await bounds()
    const glass=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.orb-search'));return {background:s.backgroundColor,blur:s.backdropFilter,text:getComputedStyle(document.querySelector('.orb-search input')).color}})()`)
    assert.match(glass.background,/0\.54\)/)
    assert.match(glass.blur,/blur\(10px\)/)
    assert.equal(glass.text,'rgb(24, 32, 42)')
    for(const query of ['java','about','zz-no-results-zz','projects']) {
      await evaluate('document.querySelector(".orb-search input").select();true')
      await typeSearch(query)
      const early=await evaluate(`(()=>{const n=document.querySelector('.orb-search-results'),s=getComputedStyle(n),r=n.getBoundingClientRect(),f=document.querySelector('.orb-search').getBoundingClientRect();return {position:s.position,animation:s.animationName,duration:s.animationDuration,width:r.width,x:r.x,top:r.top,formBottom:f.bottom}})()`)
      assert.equal(early.position,'absolute')
      assert.equal(early.animation,'orb-results-enter')
      assert.equal(early.duration,'0.24s')
      await waitFor('document.querySelector(".orb-search-results").getAnimations().every(animation => animation.playState === "finished")')
      const current=await bounds()
      assert.deepEqual(current,origin,`Search form must stay fixed for ${query} at ${width}px`)
      const list=await evaluate(`(()=>{const n=document.querySelector('.orb-search-results'),r=n.getBoundingClientRect(),f=document.querySelector('.orb-search').getBoundingClientRect();return {x:r.x,width:r.width,top:r.top,bottom:r.bottom,formBottom:f.bottom,height:r.height,scrollHeight:n.scrollHeight,overflow:getComputedStyle(n).overflowY,viewport:innerHeight}})()`)
      assert.ok(Math.abs(list.width-origin.width)<.1)
      assert.ok(Math.abs(list.x-origin.x)<.1)
      const sceneScale=await evaluate('document.querySelector(".orb-search").getBoundingClientRect().width/document.querySelector(".orb-search").offsetWidth')
      assert.ok(Math.abs(list.top-list.formBottom-8*sceneScale)<.1,JSON.stringify(list))
      assert.ok(list.bottom<=list.viewport)
      assert.equal(list.overflow,'auto')
      if(await evaluate('(()=>{const n=document.querySelector(".orb-search-results");return n.scrollHeight>n.clientHeight})()')) {
        const scroll=await evaluate(`(()=>{const n=document.querySelector('.orb-search-results');n.scrollTop=n.scrollHeight;return {top:n.scrollTop,max:n.scrollHeight-n.clientHeight}})()`)
        assert.ok(scroll.top>0&&Math.abs(scroll.top-scroll.max)<1)
      }
      if(query==='projects') await capture(`glass-results-${width}`)
    }
    await press('Escape')
    assert.deepEqual(await bounds(),origin)
    await click('.orb-search-clear')
    assert.deepEqual(await bounds(),origin)
    assert.equal(await evaluate('document.querySelector(".orb-search-results") === null'),true)
    await typeSearch('java')
    await pause(300)
    const result=await evaluate(`(()=>{const n=document.querySelector('[role=option]'),r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    if(width===390) {
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...result,radiusX:2,radiusY:2}]})
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    } else {
      await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...result})
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...result})
    }
    await waitFor('new URLSearchParams(location.search).get("category") === "projects"')
  }
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await navigate()
  await typeSearch('about')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".orb-search-results")).animationName'),'none')
  await send('Emulation.setEmulatedMedia',{features:[]})
  console.log('PASS search glass/layout: translucent 10px blur, stable form across queries/result counts/clear/Escape, independent 240ms list animation, matched widths, bounded scroll, desktop click + mobile touch selection, reduced motion')
}

async function checkSatelliteSearchSpace() {
  await viewport(1440,900)
  await navigate()
  const formBounds=()=>evaluate(`(()=>{const r=document.querySelector('.orb-search').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`)
  const initial=await formBounds()
  await typeSearch('a')
  await pause(350)
  assert.deepEqual(await formBounds(),initial)
  const measurements=[]
  for(const [width,height] of [[1440,900],[1024,768],[768,800],[390,844],[390,360]]) {
    await viewport(width,height)
    await pause(500)
    const before=await formBounds()
    const measure=()=>evaluate(`(()=>{const list=document.querySelector('.orb-search-results'),r=list.getBoundingClientRect(),f=document.querySelector('.orb-search').getBoundingClientRect();return {width:innerWidth,height:innerHeight,visible:Number(list.dataset.visibleCount),count:list.querySelectorAll('[role=option]').length,top:r.top,bottom:r.bottom,scrollHeight:list.scrollHeight,clientHeight:list.clientHeight,scrollbar:getComputedStyle(list).scrollbarWidth,positions:[...document.querySelectorAll('.orb-node')].map(n=>{const b=n.getBoundingClientRect();return {id:n.id,x:b.x,y:b.y,top:b.top,bottom:b.bottom,motion:n.dataset.motion,safe:n.style.getPropertyValue('--search-safe-y')}}),formBottom:f.bottom}})()`)
    const first=await measure()
    assert.ok(first.count>first.visible&&first.visible>=3,JSON.stringify(first))
    assert.ok(first.scrollHeight>first.clientHeight)
    assert.equal(first.scrollbar,'none')
    assert.ok(first.positions.every(node=>!node.safe),'Search must not reposition satellites')
    assert.ok(first.bottom<=height-8)
    await pause(1100)
    const later=await measure()
    assert.equal(later.visible,first.visible,'Orbital animation must not change visible row capacity')
    for(const node of first.positions.filter(n=>n.bottom>first.formBottom)) {
      const next=later.positions.find(n=>n.id===node.id)
      assert.ok(Math.abs(next.x-node.x)<.1&&Math.abs(next.y-node.y)<.1,'Lower satellites must stay out of the reserved list area')
    }
    await press('ArrowUp')
    await pause(150)
    const selected=await evaluate(`(()=>{const n=document.querySelector('[aria-selected=true][role=option]'),r=n.getBoundingClientRect(),l=document.querySelector('.orb-search-results').getBoundingClientRect();return {top:r.top,bottom:r.bottom,listTop:l.top,listBottom:l.bottom}})()`)
    assert.ok(selected.top>=selected.listTop&&selected.bottom<=selected.listBottom,JSON.stringify(selected))
    await capture(`satellite-space-${width}-${height}`)
    assert.deepEqual(await formBounds(),before)
    measurements.push({width,height,visible:first.visible,total:first.count,repositioned:first.positions.filter(n=>n.safe).map(n=>n.id)})
    // Restore an unselected state for the next resize, preserving the same query.
    await press('Escape')
    await press('ArrowDown')
  }
  await press('Enter')
  await waitFor('new URLSearchParams(location.search).has("category")')
  console.log('PASS search capacity: at least three ranked results, hidden scrollbar, no satellite repositioning, stable orbital capacity, live resize, keyboard auto-scroll and Enter',JSON.stringify(measurements))
}

async function checkCategoryModes() {
  async function realClick(selector,x=.5,y=.5) {
    const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width*${x},y:r.y+r.height*${y}}})()`)
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point})
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})
  }
  for(const width of [1440,390]) {
    await viewport(width,900)
    for(const category of ['projects','skills','journey','notes','about','contact']) {
      console.log('CHECK category',category,width)
      await navigate()
      assert.deepEqual(await evaluate('[...document.querySelectorAll(".orb-node")].map(n=>n.textContent.trim()).sort()'),['Projects','Skills','Journey','Notes','About','Contact'].sort())
      await realClick(`#category-${category}`)
      await waitFor(`document.querySelector('.orb-experience').dataset.category === '${category}'`)
      await pause(850)
      assert.equal(await evaluate('new URLSearchParams(location.search).get("category")'),category)
      if(['about','contact'].includes(category)) {
        assert.equal(await evaluate('document.querySelectorAll(".orb-editorial").length'),1)
        assert.equal(await evaluate('document.querySelector(".orb-scene").inert'),true)
        assert.equal(await evaluate('document.body.style.overflow'),'hidden')
        assert.equal(await evaluate('document.querySelector(".orb-sheet").inert'),true)
        assert.equal(await evaluate('document.activeElement.id'),'orb-editorial-title')
        for(let i=0;i<6;i++) { await press('Tab'); assert.equal(await evaluate('!!document.activeElement.closest(".orb-editorial")'),true) }
        if(category==='contact') {
          assert.equal(await evaluate('getComputedStyle(document.querySelector(".orb-scene")).filter'),'blur(5px)')
          assert.match(await evaluate('document.querySelector(".orb-contact-type").textContent'),/이메일.*등록 예정/)
          assert.equal(await evaluate('document.querySelectorAll(".orb-contact-type a[target=_blank]").length'),2)
          assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.renderState'),'running')
          assert.equal(await evaluate('document.querySelector(".orb-fluid").dataset.proximity'),'false')
          await realClick('.orb-contact-intro')
          assert.equal(await evaluate('document.querySelector(".orb-editorial").dataset.open'),'true')
        } else {
          const panelWidth=await evaluate('document.querySelector(".orb-editorial-content").getBoundingClientRect().width')
          assert.ok(width===390?Math.abs(panelWidth-390)<1:panelWidth/width>.45&&panelWidth/width<.55)
          assert.equal(await evaluate('getComputedStyle(document.querySelector(".orb-scene")).filter'),'none')
          if(width===390) {
            await evaluate('document.querySelector(".orb-editorial-content").scrollTop=500;true')
            assert.ok(await evaluate('document.querySelector(".orb-editorial-close").getBoundingClientRect().top')>=0)
          }
        }
      } else {
        assert.equal(await evaluate('document.querySelector(".orb-editorial")'),null)
        assert.equal(await evaluate('document.querySelector("#orb-sheet-title").textContent'),category[0].toUpperCase()+category.slice(1))
        if(category==='skills') { assert.equal(await evaluate('document.querySelectorAll(".orb-skills-groups > section").length'),3); assert.equal(await evaluate('document.querySelectorAll(".orb-skill-meter").length'),0); assert.ok(await evaluate('document.querySelectorAll(".orb-skill-entry a").length')>0) }
        if(category==='journey') assert.equal(await evaluate('document.querySelectorAll(".orb-journey li").length'),4)
        if(category==='notes') assert.equal(await evaluate('document.querySelectorAll(".orb-note-link").length'),3)
        await realClick('.orb-sheet-toggle')
        await waitFor('document.querySelector(".orb-sheet").dataset.view === "expanded"')
        await realClick('.orb-sheet-toggle')
      }
      await capture(`category-mode-${category}-${width}`)
      await press('Escape')
      assert.equal(await evaluate('document.querySelector(".orb-experience").dataset.category'),category,'Retain exit content')
      await waitFor('!document.querySelector(".orb-experience").dataset.category')
      await pause(100)
      await waitFor(`document.activeElement.id === 'category-${category}'`)
      assert.equal(await evaluate('location.search'),'')
      assert.notEqual(await evaluate('document.body.style.overflow'),'hidden')
    }
  }
  await viewport(1440,900)
  await navigate('?category=learning&view=partial')
  await waitFor('new URLSearchParams(location.search).get("category") === "journey"')
  await navigate('?category=experiments&view=partial')
  await waitFor('new URLSearchParams(location.search).get("category") === "projects"')
  await waitFor('document.querySelectorAll(".orb-info-card").length === 4')
  await realClick('.orb-info-card')
  await waitFor('location.pathname === "/projects/experiment-01" && !!document.querySelector(".orb-detail-experiment")')
  await click('.orb-detail-back')
  await waitFor('!!document.querySelector(".orb-experience") && new URLSearchParams(location.search).get("filter") === "Experiments"')
  await waitFor('document.querySelectorAll(".orb-info-card").length === 4')
  await navigate()
  for(const category of ['skills','journey','projects','notes','projects']) await click(`#category-${category}`)
  await pause(800)
  assert.equal(await evaluate('document.querySelector(".orb-experience").dataset.category'),'projects')
  await evaluate('history.back()')
  await waitFor('document.querySelector(".orb-experience").dataset.category === "notes"')
  await evaluate('history.forward()')
  await waitFor('document.querySelector(".orb-experience").dataset.category === "projects"')
  for(const category of ['projects','skills','journey','notes','about','contact']) {
    await navigate(`?category=${category}&view=partial`)
    await waitFor(`document.querySelector('.orb-experience').dataset.category === '${category}'`)
    await navigate()
    await typeSearch(category)
    await press('Enter')
    await waitFor(`document.querySelector('.orb-experience').dataset.category === '${category}'`)
  }
  await navigate()
  await typeSearch('java')
  assert.equal(await evaluate('document.querySelector("[role=option]").id'),'result-project-2')
  await navigate('?category=about&view=partial')
  await pause(750)
  await realClick('.orb-editorial-dim',.1,.5)
  await waitFor('!document.querySelector(".orb-experience").dataset.category')
  await viewport(390,844)
  await navigate('?category=projects&view=expanded')
  await pause(800)
  await evaluate('document.querySelector(".orb-sheet-scroll").scrollTop=180;true')
  await click('.project-card[data-copy="1"]')
  await waitFor('location.pathname === "/projects/1" && !!document.querySelector(".orb-detail-back")')
  await click('.orb-detail-back')
  await waitFor('!!document.querySelector(".orb-sheet") && document.querySelector(".orb-sheet").dataset.view === "expanded"')
  await waitFor('document.querySelector(".orb-sheet-scroll").scrollTop > 150')
  await navigate('?category=notes&view=expanded')
  await pause(800)
  await realClick('.orb-note-link')
  await waitFor('location.pathname === "/notes/portfolio-interactions" && !!document.querySelector(".orb-note-detail")')
  await click('.orb-detail-back')
  await waitFor('document.querySelector(".orb-experience")?.dataset.category === "notes"')
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await navigate('?category=contact&view=partial')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".orb-contact-type")).animationName'),'none')
  await press('Escape')
  await waitFor('!document.querySelector(".orb-editorial")')
  await send('Emulation.setEmulatedMedia',{features:[]})
  console.log('PASS six category modes: desktop/mobile open+close, focus trap/restore, Contact blur+live Orb+links, About side panel+backdrop, grouped skills, timeline, projects/notes expand+detail+return/scroll, legacy aliases, rapid switches, search/java ranking, direct URLs, history and reduced motion')
}

async function checkExchangeProject() {
  const expectedProjectCount = JSON.parse(await fs.readFile(new URL('../data/projects.json', import.meta.url), 'utf8')).length + 1
  await viewport(1440,900)
  await navigate('?category=projects&view=expanded')
  await pause(800)
  assert.equal(await evaluate('document.querySelectorAll(".project-card-wrap[data-copy=\\"1\\"]").length'),expectedProjectCount)
  const record=await evaluate(`(()=>{const card=[...document.querySelectorAll('.project-card[data-copy="1"]')].find(n=>n.querySelector('h3').textContent==='거래소');const visit=card.parentElement.querySelector('.project-visit-link');return {href:card.getAttribute('href'),text:card.textContent,period:card.querySelector('.project-card-meta span:last-child').textContent,tags:[...card.querySelectorAll('.project-card-tags span')].map(n=>n.textContent),art:card.querySelector('.project-artwork').dataset.artwork,visit:visit.href,target:visit.target}})()`)
  assert.equal(record.href,'/projects/4')
  assert.deepEqual(record.tags,['React','Next.js','MongoDB'])
  assert.equal(record.art,'screenshot')
  assert.equal(record.visit,'https://reown-eight.vercel.app/')
  assert.equal(record.target,'_blank')
  assert.match(record.text,/백엔드 개발/)
  assert.match(record.text,/9월~12월/)
  for(const tech of ['React','Next.js','MongoDB']) {
    await evaluate(`Array.from(document.querySelectorAll('.orb-sheet-filters button')).find(n=>n.textContent===${JSON.stringify(tech)}).click();true`)
    await pause(150)
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('.project-card[data-copy="1"] h3')).some(n=>n.textContent==='거래소')`))
  }
  await capture('exchange-project-card')
  await click('.project-card[data-copy="1"]')
  await waitFor('location.pathname==="/projects/4" && !!document.querySelector(".orb-detail-tabs")',15000)
  const text=await evaluate('document.querySelector(".orb-detail-shell").textContent')
  assert.match(text,/거래소/)
  assert.ok(text.includes(record.period),'Detail and card must show the same current project period')
  assert.match(text,/백엔드 개발/)
  assert.match(text,/중고/)
  for(const index of [1,2,3]) await click(`#tab-${index}`)
  assert.match(await evaluate('document.querySelector(".orb-detail-tabpanel").textContent'),/MongoDB.*처음/)
  await evaluate('document.querySelector("#tab-3").focus();true')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  assert.equal(await evaluate('document.activeElement.id'),'tab-0')
  assert.equal(await evaluate('document.querySelector(".orb-detail-tabpanel").getAttribute("aria-labelledby")'),'tab-0')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37})
  assert.equal(await evaluate('document.activeElement.id'),'tab-3')
  assert.equal(await evaluate('document.querySelector(".orb-detail-external").target'),'_blank')
  await pause(300)
  await capture('exchange-project-detail')
  await click('.orb-detail-back')
  await waitFor('!!document.querySelector(".orb-experience")')
  for(const query of ['거래소','reown','MongoDB']) {
    await navigate()
    await typeSearch(query)
    assert.equal(await evaluate('document.querySelector("[role=option]").id'),'result-project-4')
    await press('Enter')
    await waitFor('document.querySelector(".orb-experience").dataset.category === "projects"')
  }
  await viewport(390,844)
  await navigate('?category=projects&view=expanded')
  await pause(700)
  await evaluate('Array.from(document.querySelectorAll(".orb-sheet-filters button")).find(n=>n.textContent.startsWith("All (")).click();true')
  await pause(150)
  assert.equal(await evaluate('document.querySelectorAll(".project-card-wrap[data-copy=\\"1\\"]").length'),expectedProjectCount)
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
  await capture('exchange-project-mobile')
  await click('.orb-sheet-toggle')
  await pause(750)
  const position=await evaluate('document.querySelector(".featured-track").style.transform')
  await evaluate('document.querySelector(".featured-viewport").focus();true')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  await pause(550)
  assert.notEqual(await evaluate('document.querySelector(".featured-track").style.transform'),position)
  console.log('PASS exchange: ordered catalog cards, real screenshot, three tech filters/tags, separate external link, internal detail, supplied role/period/experience, search aliases, mobile and carousel keyboard')
}

async function checkRetainedRoutes() {
  for (const width of [1440, 390]) {
    await viewport(width, 900)
    for (const [route, selector, columns] of [
      ['/assignments', '.assignment-grid', width > 640 ? 3 : 1],
      ['/progress', '.skill-grid', width > 640 ? 3 : 1],
      ['/missing-page', '.not-found', null],
    ]) {
      await send('Page.navigate', { url: new URL(route, baseURL).href })
      await waitFor(`location.pathname === ${JSON.stringify(route)} && document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)})`)
      const layout = await evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        const style = getComputedStyle(element);
        return { display: style.display, columns: style.gridTemplateColumns.split(' ').length, overflow: document.documentElement.scrollWidth > innerWidth };
      })()`)
      assert.equal(layout.overflow, false, `${route} must fit at ${width}px`)
      if (columns) {
        assert.equal(layout.display, 'grid')
        assert.equal(layout.columns, columns)
        assert.ok(await evaluate('!!document.querySelector(".page-intro h1")'))
      }
      if (route === '/progress') {
        const count = await evaluate('document.querySelectorAll(".skill-card").length')
        await click('.filter-list button:last-child')
        await waitFor(`document.querySelectorAll('.skill-card').length < ${count}`)
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".skill-track")).height'), '7px')
      }
      if (route === '/missing-page') {
        assert.equal(layout.display, 'flex')
        assert.equal(await evaluate('document.querySelector(".button-primary").getAttribute("href")'), '/')
      }
    }
  }
  console.log('PASS retained routes: assignments, progress filters, 404 and shared responsive styles at desktop/mobile widths')
}

async function checkProjectEditor() {
  const draftKey = 'portfolio-project-drafts-v1'
  const openEditor = async () => {
    await evaluate('document.querySelector(".project-editor-open").focus();true')
    await press('Enter')
    await waitFor('document.querySelector(".project-editor")?.open')
  }
  const source = JSON.parse(await fs.readFile(new URL('../data/projects.json', import.meta.url), 'utf8')).find(item => item.project.id === 5).project
  const fill = async (selector, text) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select();true`)
    await send('Input.insertText', { text })
  }
  await viewport(1440,900)
  await navigate('?category=projects&view=expanded')
  await pause(750)
  const published = await evaluate('Array.from(document.querySelectorAll(".project-card h3")).map(n=>n.textContent)')
  await openEditor()
  await click('.project-editor-item[data-project-key="project:5"]')
  assert.equal(await evaluate('document.querySelector("#editor-link").value'),source.link)
  await fill('#editor-title','Editor draft smoke')
  await fill('#editor-link','javascript:alert(1)')
  await click('.project-editor-save')
  assert.equal(await evaluate('document.querySelector("#editor-link").getAttribute("aria-invalid")'),'true')
  assert.equal(await evaluate(`localStorage.getItem('${draftKey}')`),null)
  await fill('#editor-link','https://example.com/classroom')
  await click('.project-editor-save')
  await waitFor(`JSON.parse(localStorage.getItem('${draftKey}')).drafts[0].values.title === 'Editor draft smoke'`)
  assert.equal(await evaluate('document.querySelector(".project-editor-preview-copy h4").textContent'),'Editor draft smoke')
  await pause(300)
  await capture('project-editor-desktop')
  await click('.project-editor-close')
  await waitFor('!document.querySelector(".project-editor")')
  assert.equal(await evaluate('document.activeElement.className'),'project-editor-open')
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".project-card h3")).map(n=>n.textContent)'),published)
  await openEditor()
  await click('.project-editor-item[data-project-key="project:5"]')
  assert.equal(await evaluate('document.querySelector("#editor-title").value'),'Editor draft smoke')
  await fill('#editor-description','Unsaved edit')
  await press('Escape')
  await waitFor('!!document.querySelector(".project-editor-confirm")')
  assert.equal(await evaluate('document.querySelector(".orb-experience").dataset.category'),'projects')
  await click('.project-editor-confirm button:last-child')
  assert.equal(await evaluate('document.querySelector("#editor-description").value'),'Unsaved edit')
  await click('.project-editor-close')
  await click('.project-editor-confirm button:nth-child(2)')
  await waitFor('!document.querySelector(".project-editor")')
  await openEditor()
  await click('.project-editor-add')
  await fill('#editor-title','New editor project')
  await fill('#editor-tags','React, Next.js, React')
  await click('.project-editor-save')
  await waitFor(`JSON.parse(localStorage.getItem('${draftKey}')).drafts.length === 2`)
  await click('.project-editor-preview-switch button:last-child')
  await click('#tab-2')
  assert.equal(await evaluate('document.querySelectorAll(".project-editor .orb-detail-tabpanel .orb-detail-tags span").length'),2)
  await click('.project-editor-close')
  await navigate('?category=projects&view=expanded')
  await pause(750)
  await viewport(390,844)
  await openEditor()
  await evaluate('Array.from(document.querySelectorAll(".project-editor-item")).find(n=>n.textContent.includes("New editor project")).click();true')
  assert.equal(await evaluate('document.querySelector("#editor-title").value'),'New editor project')
  assert.ok(await evaluate('document.querySelector(".project-editor").getBoundingClientRect().width <= innerWidth && document.documentElement.scrollWidth <= innerWidth'))
  await evaluate('document.querySelector(".project-editor-scroll").scrollTop=100000;true')
  assert.ok(await evaluate('(()=>{const n=document.querySelector(".project-editor-scroll");return n.scrollTop+n.clientHeight>=n.scrollHeight-2})()'))
  await pause(300)
  await capture('project-editor-mobile')
  await evaluate('document.querySelector(".project-editor-save").focus();true')
  await press('Tab')
  assert.ok(await evaluate('document.querySelector(".project-editor").contains(document.activeElement)'))
  await press('Escape')
  await waitFor('!document.querySelector(".project-editor")')
  assert.equal(await evaluate('document.activeElement.className'),'project-editor-open')
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".project-card h3")).map(n=>n.textContent)'),published)
  console.log('PASS project editor: hydrate, validate links, edit/new drafts, save+reload, published data unchanged, detail preview, dirty confirmation, Escape/focus, mobile scroll and focus containment')
}

try {
  await connect()
  if (!only || stage === 1) await checkClose()
  if (stage >= 2 && (!only || stage === 2)) await checkSearch()
  if (stage >= 3 && (!only || stage === 3)) await checkFocus()
  if (stage >= 4 && (!only || stage === 4)) await checkFluidOrb()
  if (stage >= 5 && (!only || stage === 5)) await checkTransitions()
  if (stage >= 6 && (!only || stage === 6)) await checkArtwork()
  if (stage >= 7 && (!only || stage === 7)) await checkResponsive()
  if (stage >= 8 && (!only || stage === 8)) await checkCategoryLighting()
  if (stage >= 9 && (!only || stage === 9)) await checkOrbSurfaceHover()
  if (stage >= 10 && (!only || stage === 10)) await checkOrbProximity()
  if (stage >= 11 && (!only || stage === 11)) await checkMatchedHoverStrength()
  if (stage >= 12 && (!only || stage === 12)) await checkSearchHoverContinuity()
  if (stage >= 13 && (!only || stage === 13)) await checkSearchGlassAndLayout()
  if (stage >= 14 && (!only || stage === 14)) await checkSatelliteSearchSpace()
  if (stage === 15) await checkCategoryModes()
  if (stage === 16) await checkExchangeProject()
  if (stage === 17) await checkRetainedRoutes()
  if (stage === 18) await checkProjectEditor()
  assert.deepEqual(browserErrors, [])
  console.log(`PASS stage ${stage}`)
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: ++sequence, method: "Browser.close" }))
    await pause(400)
    socket.close()
  }
  if (browser.exitCode === null) browser.kill()
  const resolved = path.resolve(profile)
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith("portfolio-orb-"))
  await fs.rm(resolved, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 })
}
