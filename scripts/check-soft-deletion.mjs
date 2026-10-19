import assert from 'node:assert/strict'
import { toFormValues } from '../lib/cms/schema.ts'
import { openTestBrowser, pause } from './helpers/browser.mjs'

export async function checkSoftDeletion({ base, api, list, save, db, testCode, runChild }) {
  const route = kind => `/api/admin/content/${kind}`
  const remove = (kind,item,authenticated=true,headers={}) => api(route(kind),'DELETE',{key:item.key,version:item.version},authenticated,headers)
  const restore = (kind,item,authenticated=true,headers={}) => api(`${route(kind)}/restore`,'POST',{key:item.key,version:item.version},authenticated,headers)
  const trash = async () => {const response=await api('/api/admin/trash');assert.equal(response.status,200);return response.data.items}
  const raw = (kind,key) => kind==='projects' ? db.collection('projects').findOne({id:Number(key)}) : db.collection('portfolio_content').findOne({_id:key})
  const fixtures=[]
  async function create(kind,values) {
    const result=await save(kind,null,{...toFormValues(kind),...values,visibility:'public',order:'0'});assert.equal(result.status,201,`Create ${kind}`)
    fixtures.push({kind,item:result.data.item,values:toFormValues(kind,result.data.item.data)})
    return result.data.item
  }
  const project=await create('projects',{title:'Trash fixture project',category:'Web',description:'A disposable test project','detail.tags':'Next.js'})
  const skill=await create('skills',{name:'Trash fixture skill',group:'Test group',description:'Related usage',projectIds:project.key})
  await create('journey',{title:'Trash fixture journey',description:'Disposable timeline'})
  await create('notes',{title:'Trash fixture note',slug:'trash-fixture-note',body:'Disposable note body'})
  const name = item => String(item.data.title??item.data.name??item.data.label)
  const first=fixtures[0]
  assert.equal((await remove(first.kind,first.item,false)).status,401)
  assert.equal((await restore(first.kind,first.item,false)).status,401)
  assert.equal((await api('/api/admin/trash','GET',undefined,false)).status,401)
  assert.equal((await remove(first.kind,first.item,true,{Origin:'https://other.example'})).status,403)
  assert.equal((await restore(first.kind,first.item,true,{Origin:'https://other.example'})).status,403)
  assert.equal((await remove('projects',{key:'invalid',version:0})).status,400)
  assert.equal((await remove('projects',{key:'9999999',version:0})).status,404)
  assert.equal((await remove(first.kind,{...first.item,version:99999})).status,409)
  for(const kind of ['about','contact','categories']) {
    const item=(await list(kind))[0]; assert.equal((await remove(kind,item)).status,400); assert.equal((await restore(kind,item)).status,400)
  }
  for(const fixture of fixtures) {
    const {kind,item,values}=fixture, before=await raw(kind,item.key)
    assert.equal((await remove(kind,item)).status,200)
    const deleted=await raw(kind,item.key);assert.ok(deleted.deletedAt instanceof Date);assert.equal(deleted.version,before.version+1)
    assert.equal((await remove(kind,item)).status,200,'Repeated deletion is harmless')
    assert.equal((await raw(kind,item.key)).version,deleted.version)
    assert.ok(!(await list(kind)).some(entry=>entry.key===item.key))
    const saved=(await trash()).find(entry=>entry.kind===kind&&entry.key===item.key);assert.ok(saved?.deletedAt)
    assert.equal((await save(kind,saved,values)).status,409,'Cannot edit a deleted item')
    assert.ok(!(await fetch(base).then(response=>response.text())).includes(name(item)),`Public data excludes ${kind}`)
    if(kind==='projects'||kind==='notes') {
      const url=kind==='projects'?`/projects/${item.key}`:`/notes/${item.data.slug}`
      assert.equal((await fetch(base+url)).status,404)
      assert.equal((await api(url)).status,404,'Admins cannot open deleted details either')
    }
    if(kind==='projects') assert.deepEqual((await raw('skills',skill.key)).data.projectIds,[Number(project.key)],'Keep original references')
    assert.equal((await restore(kind,saved)).status,200)
    assert.equal((await restore(kind,saved)).status,200,'Repeated restoration is harmless')
    const restored=await raw(kind,item.key);assert.equal(restored.deletedAt,null)
    assert.deepEqual(kind==='projects'?restored.detail:restored.data,kind==='projects'?before.detail:before.data)
    assert.ok((await fetch(base).then(response=>response.text())).includes(name(item)),`Public data restores ${kind}`)
    fixture.item=(await list(kind)).find(entry=>entry.key===item.key)
  }
  // The explicit seeder must leave tombstones in place, including seeded records.
  const seed=(await list('projects')).find(item=>item.key==='1')
  await remove('projects',seed)
  const migration=await runChild(['scripts/migrate-content.mjs']);assert.equal(migration.inserted,0)
  assert.ok((await raw('projects','1')).deletedAt)
  await restore('projects',(await trash()).find(item=>item.kind==='projects'&&item.key==='1'))
  console.log('PASS soft-delete API: four targets, protected About/Contact/categories, authentication/CSRF/IDs/conflicts, tombstones, restore, migration preservation')

  const browser=await openTestBrowser()
  try {
    const {goto,wait,fill,click,press,evaluate,send,viewport}=browser
    await goto(base);await wait('!!document.querySelector(".orb-search input")')
    const position=await evaluate('(()=>{const r=document.querySelector(".orb-search").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width}})()')
    await fill('.orb-search input','/admin');await wait('!!document.querySelector("#result-admin-login")')
    assert.ok(await evaluate('document.querySelector("#result-admin-login").textContent.includes("관리자 로그인")'))
    assert.equal(await evaluate('document.querySelectorAll(".orb-node[data-glowing]").length'),0)
    const after=await evaluate('(()=>{const r=document.querySelector(".orb-search").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width}})()')
    assert.ok(Math.abs(after.y-position.y)<2)
    assert.equal(await evaluate('location.search'),'')
    await press('ArrowDown');await press('Escape');assert.equal(await evaluate('document.querySelector(".orb-search input").getAttribute("aria-expanded")'),'false')
    await press('ArrowDown');await press('Enter');await wait('!!document.querySelector(".cms-login")')
    await fill('input[type=password]',testCode);await click('button[type=submit]');await wait('!!document.querySelector(".cms-admin")')
    await goto(base);await fill('.orb-search input','/admin');await wait('!!document.querySelector("#result-admin-login")');await click('#result-admin-login');await wait('!!document.querySelector(".cms-admin")')
    await send('Network.enable')
    for(const fixture of fixtures) {
      const {kind}=fixture
      if(kind==='notes') await viewport(390,844)
      await goto(`${base}/admin/${kind}`);await wait('!!document.querySelector(".cms-admin")')
      await evaluate(`[...document.querySelectorAll('.cms-items button')].find(n=>n.querySelector('strong')?.textContent===${JSON.stringify(name(fixture.item))}).click()`)
      const before=await raw(kind,fixture.item.key)
      await click('.cms-delete-open');await wait('!!document.querySelector("dialog[open]")')
      assert.ok(await evaluate(`document.querySelector('dialog h2').textContent.includes(${JSON.stringify(name(fixture.item))})`))
      await press('Escape');assert.equal(await evaluate('!!document.querySelector("dialog[open]")'),false)
      await click('.cms-delete-open');await click('dialog button:first-child');assert.equal((await raw(kind,fixture.item.key)).version,before.version)
      await click('.cms-delete-open')
      await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
      await click('dialog .cms-danger');await wait('!!document.querySelector("dialog [role=alert]")',22000)
      assert.ok(!(await raw(kind,fixture.item.key)).deletedAt)
      await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
      await evaluate('(()=>{const n=document.querySelector("dialog .cms-danger");n.click();n.click()})()')
      await wait('!document.querySelector("dialog[open]")')
      assert.ok((await raw(kind,fixture.item.key)).deletedAt)
      await goto(`${base}/admin/trash`);await wait('!!document.querySelector(".cms-trash")')
      const target=`[...document.querySelectorAll('.cms-trash-list li')].find(n=>n.querySelector('h2')?.textContent===${JSON.stringify(name(fixture.item))})`
      await evaluate(`${target}.querySelector('button').click()`);await wait('!!document.querySelector("dialog[open]")');await press('Escape')
      assert.ok((await raw(kind,fixture.item.key)).deletedAt)
      await evaluate(`${target}.querySelector('button').click()`);await click('dialog button:last-child');await wait('!document.querySelector("dialog[open]")')
      assert.equal((await raw(kind,fixture.item.key)).deletedAt,null)
      await goto(`${base}/admin/${kind}`);assert.ok(await evaluate(`document.querySelector('.cms-items').textContent.includes(${JSON.stringify(name(fixture.item))})`))
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    }
    await viewport(1440,900)
    await goto(`${base}/?category=skills&view=expanded`);await pause(750)
    assert.ok(await evaluate(`!!document.querySelector('.orb-skill-entry a[href="/projects/${project.key}"]')`),'Related project returns after restore')
    for(const kind of ['projects','notes']) {
      const fixture=fixtures.find(item=>item.kind===kind), url=kind==='projects'?`/projects/${fixture.item.key}`:`/notes/${fixture.item.data.slug}`
      await goto(base+url);await wait('!!document.querySelector(".cms-detail-tools")')
      await click('.cms-detail-tools button');await click('dialog .cms-danger')
      await wait(`location.pathname==='/' && new URLSearchParams(location.search).get('category')==='${kind}'`)
      assert.equal((await fetch(base+url)).status,404)
      await restore(kind,(await trash()).find(item=>item.kind===kind&&item.key===fixture.item.key))
    }
    assert.deepEqual(browser.errors,[])
    console.log('PASS soft-delete browser: /admin search, four cancel/failure/delete/restore flows, protected editorial documents, mobile, detail redirect')
  } finally { await browser.close() }
}
