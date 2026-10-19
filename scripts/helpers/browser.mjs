import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
export async function openTestBrowser() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-cms-browser-'))
  const browser = spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let socket, sequence = 0
  const pending = new Map(), errors = []
  try {
    let port
    for (let i = 0; i < 150; i++) {
      try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await pause(100) }
    }
    assert.ok(port, 'Chrome did not start')
    const target = (await fetch(`http://localhost:${port}/json`).then(res => res.json())).find(target => target.type === 'page')
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data)
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
      if (!pending.has(message.id)) return
      const { resolve, reject } = pending.get(message.id); pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result)
    }
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
      return result.result.value
    }
    const wait = async (expression, timeout = 15000) => {
      for (const start = Date.now(); Date.now()-start < timeout;) { if (await evaluate(expression)) return; await pause(70) }
      throw new Error(`Browser condition timed out: ${expression}`)
    }
    const viewport = (width, height = 900) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 })
    const goto = async url => { await send('Page.navigate', { url }); await wait('document.readyState === "complete"'); await pause(400) }
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
    const fill = async (selector, value) => {
      await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.focus();const p=n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:n.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`)
      await pause(80)
    }
    const press = async key => {
      const codes = { Enter:13, Escape:27, Tab:9, ArrowDown:40, ArrowUp:38 }
      await send('Input.dispatchKeyEvent', { type:'keyDown', key, code:key, windowsVirtualKeyCode:codes[key], ...(key==='Enter'?{text:'\r'}:{}) })
      await send('Input.dispatchKeyEvent', { type:'keyUp', key, code:key, windowsVirtualKeyCode:codes[key] })
    }
    await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled:true }); await viewport(1440)
    return { send, evaluate, wait, viewport, goto, click, fill, press, errors, close: async () => {
      if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ id:++sequence, method:'Browser.close' })); await pause(400); socket.close() }
      if (browser.exitCode === null) browser.kill()
      const resolved = path.resolve(profile)
      assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(resolved).startsWith('portfolio-cms-browser-'))
      await fs.rm(resolved, { recursive:true, force:true, maxRetries:6, retryDelay:300 })
    } }
  } catch (error) { browser.kill(); throw error }
}
