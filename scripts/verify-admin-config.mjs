// Checks the real configured admin login without editing public content.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import nextEnv from '@next/env'
import { openTestBrowser, pause } from './helpers/browser.mjs'

nextEnv.loadEnvConfig(process.cwd())
assert.ok(process.env.ADMIN_CODE?.length>=12 && process.env.ADMIN_SESSION_SECRET?.length>=32,'Admin environment variables are not ready')
const base='http://localhost:3006'
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3006'],{env:{...process.env,APP_ORIGIN:base},windowsHide:true,stdio:'ignore'})
let browser
try {
  let ready=false
  for(let i=0;i<100;i++) {try {if((await fetch(`${base}/api/admin/session`)).ok){ready=true;break}}catch{} await pause(200)}
  assert.ok(ready,'Real configuration server did not start')
  browser=await openTestBrowser()
  await browser.goto(base); await browser.wait('!!document.querySelector(".orb-experience")')
  assert.equal(await browser.evaluate('!!document.querySelector(".cms-home-tools")'),false)
  assert.equal(await browser.evaluate('!!document.querySelector(".cms-load-notice")'),false)
  await browser.goto(`${base}/admin/login`)
  await browser.fill('input[type=password]',process.env.ADMIN_CODE)
  await browser.click('button[type=submit]'); await browser.wait('!!document.querySelector(".cms-admin")')
  assert.ok(await browser.evaluate('document.querySelectorAll(".cms-items button").length>=10'))
  await browser.click('.cms-admin-header button'); await browser.wait('!!document.querySelector(".cms-login")')
  console.log('PASS real configuration: current portfolio MongoDB readable, configured ADMIN_CODE login and logout work in Chrome; no public content edited')
  if(process.argv.includes('--regression')) {
    const regression=spawn(process.execPath,['scripts/verify-orb.mjs','--stage=15','--only'],{env:{...process.env,PORTFOLIO_TEST_URL:base},windowsHide:true,stdio:'inherit'})
    assert.equal(await new Promise(resolve=>regression.on('exit',resolve)),0,'Orb regression must pass')
  }
} finally { if(browser) await browser.close(); server.kill() }
