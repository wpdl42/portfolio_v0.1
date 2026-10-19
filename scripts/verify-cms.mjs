// Runs real MongoDB writes exclusively in a new, disposable verification database.
// Requires a production build, MONGODB_URI, Node 24+, and Chrome. Never prints credentials.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import nextEnv from '@next/env'
import { MongoClient } from 'mongodb'
import { toFormValues } from '../lib/cms/schema.ts'
import { openTestBrowser, pause } from './helpers/browser.mjs'
import { checkSoftDeletion } from './check-soft-deletion.mjs'
import { checkEditorialRollback } from './check-editorial-rollback.mjs'

nextEnv.loadEnvConfig(process.cwd())
if(process.argv.includes('--capture') && !process.env.PORTFOLIO_CAPTURE_DIR) process.env.PORTFOLIO_CAPTURE_DIR=path.join(process.cwd(),'.next','cms-verification')
assert.ok(process.env.MONGODB_URI, 'MONGODB_URI must be configured')
const database = `cms_verify_${Date.now()}_${randomBytes(3).toString('hex')}`
const port = Number(process.env.CMS_VERIFY_PORT || 3004), base = `http://localhost:${port}`
const testCode = randomBytes(24).toString('base64url')
const env = { ...process.env, MONGODB_DB:database, ADMIN_CODE:testCode, ADMIN_SESSION_SECRET:randomBytes(40).toString('base64url'), APP_ORIGIN:base }
const mongo = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS:10000 })
let server, browser, cookie = ''
const db = mongo.db(database)
const json = { 'Content-Type':'application/json', Origin:base }
async function api(route, method='GET', body, authenticated=true, headers={}) {
  const response = await fetch(`${base}${route}`, { method, headers:{...json, ...(authenticated && cookie ? {Cookie:cookie}:{}), ...headers}, ...(body!==undefined ? {body:JSON.stringify(body)}:{}), redirect:'manual' })
  let data; try { data = await response.json() } catch { data = null }
  return { response, data, status:response.status }
}
async function login() {
  const result = await api('/api/admin/session','POST',{code:testCode},false)
  assert.equal(result.status,200,'Valid code must create session')
  const rawCookie = result.response.headers.get('set-cookie') || ''
  assert.match(rawCookie,/HttpOnly/i); assert.match(rawCookie,/SameSite=strict/i); assert.match(rawCookie,/Secure/i)
  cookie = rawCookie.split(';')[0]
}
async function list(kind) { const result=await api(`/api/admin/content/${kind}`); assert.equal(result.status,200); return result.data.items }
async function save(kind,item,values) { return api(`/api/admin/content/${kind}`,item?'PATCH':'POST',{values,...(item?{key:item.key,version:item.version}:{})}) }
async function runChild(args) {
  const child=spawn(process.execPath,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']}); let output=''
  child.stdout.on('data',chunk=>output+=chunk)
  const code=await new Promise(resolve=>child.on('exit',resolve)); assert.equal(code,0,'Migration must succeed')
  return JSON.parse(output.trim().split('\n').at(-1))
}
async function checkApi() {
  assert.equal((await api('/api/admin/content/projects','GET',undefined,false)).status,401)
  assert.equal((await api('/api/admin/content/projects','POST',{values:{}},false)).status,401)
  assert.equal((await api('/api/admin/content/projects','PATCH',{values:{},key:'1',version:0},false)).status,401)
  assert.equal((await api('/api/admin/session','POST',{code:'wrong-code'},false)).status,401)
  assert.equal((await api('/api/admin/session','POST',{code:testCode},false,{Origin:'https://other.example'})).status,403)
  const adminPage=await fetch(`${base}/admin/projects`,{redirect:'manual'}); assert.equal(adminPage.status,307); assert.match(adminPage.headers.get('location'),/admin\/login/)
  await login()
  assert.ok((await api('/api/admin/session')).data.session?.expiresAt)
  assert.equal((await api('/api/admin/content/projects','POST',{values:{}},true,{Origin:'https://other.example'})).status,403)
  assert.equal((await api('/api/admin/content/projects','POST',{values:{...toFormValues('projects'),title:'Validation',description:'Validation',_id:'illegal'}})).status,422)
  assert.equal((await api('/api/admin/content/projects','POST',{values:{...toFormValues('projects'),title:'Validation',description:'Validation',link:'javascript:alert(1)'}})).status,422)
  assert.equal((await api('/api/admin/content/projects','PATCH',{key:'',version:0,values:{}})).status,400)
  assert.equal((await api('/api/admin/content/projects','POST',{values:{title:'x'.repeat(270000)}})).status,413)
  console.log('PASS authentication: protected pages/API, wrong code, signed HttpOnly/Secure/SameSite session, CSRF, validation')

  const values={...toFormValues('projects'),title:'CMS Verification Project',description:'CMS verification description',category:'Web',visibility:'public',order:'0','detail.tags':'React, MongoDB','detail.overview':'A saved project overview',link:'https://example.com/cms-verification'}
  const created=await save('projects',null,values); assert.equal(created.status,201)
  let project=created.data.item
  assert.ok((await db.collection('projects').findOne({id:Number(project.key)})).createdAt instanceof Date)
  assert.equal((await save('projects',null,values)).status,409,'Duplicate deployment must fail')
  await db.collection('projects').updateOne({id:Number(project.key)},{$set:{'detail.sources':['preserved source'],retainedMetadata:'preserved'}})
  const edited=await save('projects',project,{...values,title:'CMS Verification Updated'}); assert.equal(edited.status,200)
  assert.equal((await save('projects',project,values)).status,409,'Stale editor must fail')
  project=edited.data.item
  const retained=await db.collection('projects').findOne({id:Number(project.key)})
  assert.deepEqual(retained.detail.sources,['preserved source']); assert.equal(retained.retainedMetadata,'preserved')
  const html=await fetch(`${base}/projects/${project.key}`).then(res=>res.text()); assert.ok(html.includes('CMS Verification Updated')); assert.ok(html.includes('A saved project overview'))
  const hidden=await save('projects',project,{...values,title:'Secret verification project',visibility:'private'}); assert.equal(hidden.status,200)
  assert.equal((await fetch(`${base}/projects/${project.key}`)).status,404)
  const preview=await fetch(`${base}/projects/${project.key}`,{headers:{Cookie:cookie}}); assert.equal(preview.status,200)
  const publicHtml=await fetch(base).then(res=>res.text()); assert.ok(!publicHtml.includes('Secret verification project'))
  project=(await save('projects',hidden.data.item,{...values,title:'CMS Verification Updated'})).data.item

  const originals={}
  const changes={skills:['description','CMS skill experience'],journey:['description','CMS journey description'],notes:['body','CMS note body'],about:['bio','CMS about biography'],contact:['intro','CMS contact introduction'],categories:['label','Projects verified']}
  for (const [kind,[field,value]] of Object.entries(changes)) {
    const items=await list(kind); const item=kind==='categories'?items.find(item=>item.key==='categories:projects'):kind==='journey'?items.find(item=>item.key!=='journey:archive'):items[0]
    assert.ok(item,`Seed missing: ${kind}`); originals[kind]=item
    const values=toFormValues(kind,item.data); values[field]=value
    if(kind==='categories') { values.color='#24a88f'; values.order='5' }
    const updated=await save(kind,item,values); assert.equal(updated.status,200,`Save ${kind}`)
    const read=(await list(kind)).find(entry=>entry.key===item.key); assert.equal(read.data[field],value)
    assert.equal(read.version,item.version+1)
  }
  const added={skills:{name:'CMS skill',group:'Tools',description:'Skill usage',projectIds:project.key},journey:{title:'CMS journey',period:'2026',description:'Journey experience'},notes:{title:'CMS note',slug:'cms-note',body:'CMS persisted note body',description:'CMS note summary'}}
  for(const [kind,data] of Object.entries(added)) { const result=await save(kind,null,{...toFormValues(kind),...data,visibility:'public'}); assert.equal(result.status,201); assert.ok(result.data.item.createdAt) }
  let note=(await list('notes')).find(item=>item.data.slug==='cms-note')
  const noteValues=toFormValues('notes',note.data)
  const renamed=await save('notes',note,{...noteValues,slug:'cms-note-renamed'}); assert.equal(renamed.status,200)
  assert.equal((await fetch(`${base}/notes/cms-note`)).status,200,'Previous note slug remains accessible')
  assert.equal((await save('notes',null,{...noteValues,slug:'cms-note'})).status,409,'Previous slug must remain reserved')
  assert.equal((await save('notes',null,{...noteValues,slug:'cms-note-renamed'})).status,409,'Current slug must be unique')
  const privateNote=await save('notes',renamed.data.item,{...noteValues,slug:'cms-note-renamed',visibility:'private'}); assert.equal(privateNote.status,200)
  assert.equal((await fetch(`${base}/notes/cms-note`)).status,404)
  await save('notes',privateNote.data.item,{...noteValues,slug:'cms-note-renamed'})
  for(const kind of ['skills','journey']) {
    const item=(await list(kind)).find(item=>item.data.name==='CMS skill'||item.data.title==='CMS journey')
    const hidden=await save(kind,item,{...toFormValues(kind,item.data),visibility:'private'}); assert.equal(hidden.status,200)
    const home=await fetch(base).then(res=>res.text()); assert.ok(!home.includes(kind==='skills'?'CMS skill"':'CMS journey"'))
  }
  console.log('PASS MongoDB: project create/update/detail, 6 content kinds, category settings, timestamps, private access, duplicates, slug aliases, conflicts, metadata preservation')
  return {project,originals}
}
async function checkBrowser({project}) {
  browser=await openTestBrowser()
  const {goto,wait,evaluate,fill,click,press,viewport,send}=browser
  await goto(`${base}/admin/projects`); await wait('!!document.querySelector(".cms-login")')
  const password='input[type=password]'
  await fill(password,'wrong-code'); await click('.cms-login button[type=submit]'); await wait('!!document.querySelector(".cms-login [role=alert]").textContent && !document.querySelector(".cms-login input").disabled')
  await fill(password,testCode); await click('.cms-login button[type=submit]');
  try { await wait('!!document.querySelector(".cms-admin")') } catch(error) { console.log('Login diagnostic',await evaluate('({url:location.pathname,notice:document.querySelector(".cms-login [role=alert]")?.textContent,sessionCookieVisible:document.cookie.includes("portfolio-admin")})')); throw error }
  assert.ok(await evaluate('document.cookie.indexOf("portfolio-admin")===-1'),'Session must not be readable from JavaScript')
  // Check every editor using its actual controlled form, save, and a full reload.
  const fields={projects:['title','CMS Browser Project'],skills:['description','CMS Browser skill experience'],journey:['description','CMS Browser journey'],notes:['body','CMS Browser note'],about:['bio','CMS Browser about'],contact:['intro','CMS Browser contact'],categories:['summary','CMS Browser category summary']}
  async function selectPublished(kind) {
    if(!['skills','journey','notes'].includes(kind)) return
    const item=(await list(kind)).find(item=>item.data.visibility==='public')
    const title=item.data.title??item.data.name
    await evaluate(`[...document.querySelectorAll('.cms-items > button')].find(n=>n.querySelector('strong')?.textContent===${JSON.stringify(title)}).click()`)
    await pause(100)
  }
  for (const [kind,[field,value]] of Object.entries(fields)) {
    console.log(`Browser editor: ${kind}`)
    await goto(`${base}/admin/${kind}`); await wait('!!document.querySelector(".cms-admin")')
    if(kind==='contact'||kind==='about') {
      assert.equal(await evaluate('!!document.querySelector(".cms-subnav, .cms-delete-open, .cms-add")'),false)
      const ids=kind==='contact'?['heading','intro','email','github','githubLabel','blog','blogLabel','links']:['name','bio','interests','workStyle','resume']
      for(const id of ids) assert.ok(await evaluate(`!!document.getElementById(${JSON.stringify('cms-'+id)})`))
    }
    await selectPublished(kind)
    await fill(`#cms-${field}`,value); await click('button[type=submit]')
    await wait('document.querySelector(".cms-save-bar [role=status]").textContent.includes("MongoDB에 저장")')
    await goto(`${base}/admin/${kind}`); await wait('!!document.querySelector(".cms-admin")'); await selectPublished(kind); await wait(`document.getElementById(${JSON.stringify('cms-'+field)})?.value===${JSON.stringify(value)}`)
  }
  await goto(`${base}/admin/contact-links`);await wait('location.pathname==="/admin/contact" && !!document.querySelector("#cms-github")')
  await fill('#cms-email','cms-editorial@example.com');await fill('#cms-github','https://example.com/edited-github');await fill('#cms-githubLabel','Edited GitHub');await fill('#cms-blog','https://example.com/edited-blog');await fill('#cms-blogLabel','Edited Blog');await fill('#cms-links','More | https://example.com/more');await click('button[type=submit]')
  await wait('document.querySelector(".cms-save-bar [role=status]").textContent.includes("MongoDB에 저장")')
  await goto(`${base}/admin/contact`);assert.equal(await evaluate('document.querySelector("#cms-email").value'),'cms-editorial@example.com')
  const savedContact=(await list('contact'))[0].data
  assert.equal(savedContact.github,'https://example.com/edited-github');assert.equal(savedContact.blogLabel,'Edited Blog');assert.equal(savedContact.links[0].label,'More')
  await goto(`${base}/?category=contact&view=partial`);await pause(800);assert.equal(await evaluate('document.querySelector(".orb-contact-type nav a").getAttribute("href")'),'https://example.com/edited-github')
  await goto(`${base}/admin/about-sections`);await wait('location.pathname==="/admin/about" && !!document.querySelector("#cms-bio")')
  // Cancel must not write. A stale version must keep the text and offer reload.
  await goto(`${base}/admin/about`); const before=await db.collection('portfolio_content').findOne({_id:'about:main'})
  await fill('#cms-bio','Unsaved cancel text')
  const cancelPromise=click('.cms-save-bar button[type=button]')
  await pause(100); await send('Page.handleJavaScriptDialog',{accept:true}); await cancelPromise
  assert.equal((await db.collection('portfolio_content').findOne({_id:'about:main'})).version,before.version)
  assert.equal(await evaluate('document.querySelector("#cms-bio").value'),'CMS Browser about')
  await fill('#cms-bio','Unsaved Back test'); await evaluate('history.back()'); await pause(120)
  await send('Page.handleJavaScriptDialog',{accept:false}); await pause(100)
  assert.equal(await evaluate('location.pathname'),'/admin/about')
  assert.equal(await evaluate('document.querySelector("#cms-bio").value'),'Unsaved Back test')
  const cancelBack=click('.cms-save-bar > div:last-child > button[type=button]'); await pause(100); await send('Page.handleJavaScriptDialog',{accept:true}); await cancelBack
  const current=(await list('about'))[0]; await save('about',current,{...toFormValues('about',current.data),bio:'Newer server biography'})
  await fill('#cms-bio','Stale browser biography'); await click('button[type=submit]'); await wait('document.querySelector(".cms-save-bar").textContent.includes("최신 내용 불러오기")')
  assert.equal(await evaluate('document.querySelector("#cms-bio").value'),'Stale browser biography')
  // Failed network save must preserve input. Clear dirty state with confirmed cancel first.
  const cancelConflict=click('.cms-save-bar > div:last-child > button[type=button]'); await pause(100); await send('Page.handleJavaScriptDialog',{accept:true}); await cancelConflict
  await fill('#cms-bio','Retained offline input'); await send('Network.enable'); await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
  await click('button[type=submit]');
  try { await wait('document.querySelector(".cms-save-bar [role=status]").textContent.includes("입력 내용은 유지")',22000) } catch(error) { console.log('Offline diagnostic',await evaluate('({message:document.querySelector(".cms-save-bar [role=status]").textContent,busy:document.querySelector("button[type=submit]").disabled})')); throw error }
  assert.equal(await evaluate('document.querySelector("#cms-bio").value'),'Retained offline input')
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  const cancelOffline=click('.cms-save-bar > div:last-child > button[type=button]'); await pause(100); await send('Page.handleJavaScriptDialog',{accept:true}); await cancelOffline
  console.log('PASS browser editors: all sections save/reload, cancel leaves DB unchanged, conflict and offline save preserve input')

  await goto(base); await wait('!!document.querySelector(".orb-experience")')
  assert.equal(await evaluate('document.querySelector("#category-projects .orb-node-label")?.textContent || document.querySelector("#category-projects").textContent'),'Projects verified')
  assert.equal(await evaluate('document.querySelector("#category-projects").style.getPropertyValue("--node-color")'),'#24a88f')
  assert.ok(await evaluate('!!document.querySelector(".cms-home-tools")'))
  for(const category of ['projects','skills','journey','notes','about','contact']) {
    await goto(`${base}/?category=${category}&view=partial`); await wait(`document.querySelector('.orb-experience')?.dataset.category === '${category}'`); await pause(800)
    const expected={projects:'CMS Browser Project',skills:'CMS Browser skill experience',journey:'CMS Browser journey',about:'Newer server biography',contact:'CMS Browser contact'}[category]
    if(expected) assert.ok(await evaluate(`document.body.textContent.includes(${JSON.stringify(expected)})`),`Published content ${category}`)
    if(category==='about'||category==='contact') { await wait('!!document.querySelector(".orb-editorial [role=dialog], .orb-editorial")'); await click('.orb-editorial-close') }
    else { await wait('!!document.querySelector(".orb-sheet .cms-edit-link")'); await click('.orb-sheet-close') }
    await wait('!new URLSearchParams(location.search).has("category")'); await pause(850)
    assert.ok(await evaluate(`document.activeElement.id === 'category-${category}'`))
  }
  await goto(base); await wait('!!document.querySelector(".orb-search input")')
  const currentProjectTitle=(await db.collection('projects').findOne({id:Number(project.key)})).title
  await fill('.orb-search input',currentProjectTitle); await wait('document.querySelectorAll("[role=option]").length>0')
  assert.ok(await evaluate(`[...document.querySelectorAll('[role=option]')].some(n=>n.textContent.includes(${JSON.stringify(currentProjectTitle)}))`))
  await press('ArrowDown'); assert.ok(await evaluate('!!document.querySelector(".orb-search input").getAttribute("aria-activedescendant")'))
  await press('Escape'); assert.equal(await evaluate('document.querySelector(".orb-search input").getAttribute("aria-expanded")'),'false')
  await fill('.orb-search input','java'); await wait('document.querySelectorAll("[role=option]").length>0'); assert.ok(await evaluate('document.querySelector("[role=option]").textContent.includes("Java 학사관리 시스템")'))
  await press('Enter'); await pause(850); assert.ok(await evaluate('location.pathname.startsWith("/projects/")||new URLSearchParams(location.search).get("category")==="projects"'))
  await goto(base); await click('#category-projects'); await click('#category-skills'); await click('#category-journey'); await pause(850)
  assert.equal(await evaluate('new URLSearchParams(location.search).get("category")'),'journey')
  await send('Page.navigateToHistoryEntry',{entryId:(await send('Page.getNavigationHistory')).entries.at(-2).id}); await pause(850)
  assert.equal(await evaluate('new URLSearchParams(location.search).get("category")'),'skills')
  for(const width of [1440,1024,768,390]) {
    await viewport(width,844); await goto(`${base}/?category=projects&view=expanded`); await pause(850)
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`Public overflow ${width}`)
    await goto(`${base}/admin/projects`); await wait('!!document.querySelector(".cms-admin")')
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`Editor overflow ${width}`)
  }
  await viewport(390,844); await goto(`${base}/admin/projects`); await fill('#cms-role','CMS mobile role'); await click('button[type=submit]'); await wait('document.querySelector(".cms-save-bar [role=status]").textContent.includes("MongoDB에 저장")')
  if(process.env.PORTFOLIO_CAPTURE_DIR) { await fs.mkdir(process.env.PORTFOLIO_CAPTURE_DIR,{recursive:true}); const png=await send('Page.captureScreenshot',{format:'png'}); await fs.writeFile(`${process.env.PORTFOLIO_CAPTURE_DIR}/cms-mobile.png`,Buffer.from(png.data,'base64')) }
  await click('.cms-admin-header button'); await wait('!!document.querySelector(".cms-login")')
  assert.deepEqual(browser.errors,[])
  console.log('PASS browser public UI: category name/color, six modes/close/focus, ranked search and keys, rapid switches/back, 1440/1024/768/390, mobile save, logout')
  assert.ok(project.key)
}
try {
  await mongo.connect()
  assert.equal((await db.listCollections().toArray()).length,0,'Verification DB must start empty')
  const first=await runChild(['scripts/migrate-content.mjs']), second=await runChild(['scripts/migrate-content.mjs'])
  assert.equal(first.inserted,34); assert.equal(second.inserted,0); assert.equal(second.missingFieldsAdded,0)
  console.log('PASS migration: real MongoDB, 34 initial records, idempotent second execution')
  await checkEditorialRollback(db)
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{env,windowsHide:true,stdio:['ignore','pipe','ignore']})
  let childReady=false, ready=false
  server.stdout.on('data',chunk=>{if(String(chunk).includes('Ready')) childReady=true})
  // Never send test mutations to a pre-existing server occupying this port.
  for(let i=0;i<100;i++) { if(server.exitCode!==null) break; try { if(childReady && (await fetch(`${base}/api/admin/session`)).ok) {ready=true;break} } catch {} await pause(200) }
  assert.ok(ready,'Production verification server did not start')
  if(process.argv.includes('--deletion-only') || process.argv.includes('--guard-only')) await login()
  else await checkBrowser(await checkApi())
  const contactBeforeStale=(await list('contact'))[0]
  assert.equal((await save('contact',contactBeforeStale,{heading:contactBeforeStale.data.heading,intro:'Stale partial form'})).status,409)
  assert.equal((await list('contact'))[0].version,contactBeforeStale.version)
  console.log('PASS stale Contact form is rejected without changing saved values')
  if(!process.argv.includes('--guard-only')) await checkSoftDeletion({base,api,list,save,db,testCode,runChild})
  await login(); await db.collection('admin_sessions').updateMany({},{$set:{expiresAt:new Date(Date.now()-1000)}})
  assert.equal((await api('/api/admin/content/projects')).status,401,'Expired session must be rejected by server')
  await login(); assert.equal((await api('/api/admin/session','DELETE')).status,200); assert.equal((await api('/api/admin/content/projects')).status,401)
  await db.collection('admin_attempts').deleteMany({})
  for(let i=0;i<10;i++) assert.equal((await api('/api/admin/session','POST',{code:'invalid-test-code'},false)).status,401)
  const limited=await api('/api/admin/session','POST',{code:testCode},false); assert.equal(limited.status,429); assert.ok(limited.response.headers.has('Retry-After'))
  console.log('PASS session expiry, logout revocation, persistent rate limiting; selected CMS checks complete')
} finally {
  if(browser) await browser.close()
  if(server) { server.kill(); await pause(500) }
  assert.match(database,/^cms_verify_\d+_[a-f0-9]{6}$/)
  await db.dropDatabase(); await mongo.close()
  console.log('Verification database removed; portfolio database content was not modified by these tests')
}
