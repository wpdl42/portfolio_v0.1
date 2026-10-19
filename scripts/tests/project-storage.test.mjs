import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { upsertProject } from '../../lib/projects/storage.mjs'
import { mergeProjectRecords, toPublicProject } from '../../lib/projects/records.ts'

const seed = JSON.parse(await readFile(new URL('../../data/reown-project.json',import.meta.url),'utf8'))

function matches(record, query) {
  if(query.$or) return query.$or.some(part=>matches(record,part))
  return Object.entries(query).every(([key,value])=>{
    if(value && typeof value==='object') {
      if('$in' in value) return value.$in.includes(record[key])
      if('$ne' in value) return record[key]!==value.$ne
    }
    return record[key]===value
  })
}

// In-memory MongoDB interface: no environment variables, credentials or DB writes.
function collection(initial=[]) {
  const rows=structuredClone(initial)
  const indexes=new Map()
  let writes=0
  return {
    rows,indexes,get writes(){return writes},
    async createIndex(keys,options){indexes.set(options.name,{keys,options})},
    find(query){return {async toArray(){return rows.filter(row=>matches(row,query))}}},
    async findOne(query){return rows.find(row=>matches(row,query))??null},
    async countDocuments(query){return rows.filter(row=>matches(row,query)).length},
    async updateOne(query,update,options){
      writes++
      const existing=rows.find(row=>matches(row,query))
      if(existing) Object.assign(existing,update.$set)
      else if(options.upsert) rows.push({_id:`record-${rows.length+1}`,...update.$setOnInsert,...update.$set})
    },
  }
}

test('repeated registration updates a single document and retains creation time',async()=>{
  const db=collection()
  const first=await upsertProject(db,seed)
  const createdAt=db.rows[0].createdAt
  const second=await upsertProject(db,{...seed,title:`${seed.title} updated`})
  assert.equal(first.result,'inserted')
  assert.equal(second.result,'updated')
  assert.equal(second.matches,1)
  assert.equal(db.rows.length,1)
  assert.equal(db.rows[0].createdAt,createdAt)
  assert.equal(db.rows[0].title,`${seed.title} updated`)
  assert.equal(db.indexes.get('project_unique_slug').options.unique,true)
  assert.equal(db.indexes.get('project_unique_deployment').options.unique,true)
})

test('deployment match retains existing ID and display order',async()=>{
  const db=collection([{...seed,_id:'existing',slug:'previous-slug',canonicalUrl:undefined,id:91,order:12}])
  const result=await upsertProject(db,seed)
  assert.equal(result.result,'updated')
  assert.equal(result.id,91)
  assert.equal(db.rows[0].order,12)
  assert.equal(db.rows[0].slug,seed.slug)
  assert.equal(db.rows.length,1)
})

test('ambiguous matches and occupied IDs fail without modifying documents',async()=>{
  const ambiguous=collection([{...seed,_id:'a'},{...seed,_id:'b'}])
  await assert.rejects(upsertProject(ambiguous,seed),/MULTIPLE_MATCHES/)
  assert.equal(ambiguous.writes,0)
  const occupied=collection([{id:seed.id,slug:'different',_id:'other'}])
  await assert.rejects(upsertProject(occupied,seed),/ID_CONFLICT/)
  assert.equal(occupied.writes,0)
})

test('public projection omits storage metadata and preserves optional values',()=>{
  const publicRecord=toPublicProject({...seed,_id:'private-id',createdAt:new Date(),internal:'not public',order:0})
  assert.equal(publicRecord.order,0)
  assert.equal(publicRecord.title,seed.title)
  assert.equal(publicRecord.visibility,'public')
  for(const key of ['_id','createdAt','internal','canonicalUrl']) assert.equal(key in publicRecord,false)
  assert.equal(toPublicProject({...seed,id:'4'}),null)
  assert.equal(toPublicProject({...seed,role:null}),null)
})

test('catalog merging replaces by ID or slug, sorts, and leaves the fallback untouched',()=>{
  const fallback=[{...seed,id:1,slug:'one',order:1},{...seed,id:2,slug:'two',order:2}]
  const before=structuredClone(fallback)
  const merged=mergeProjectRecords(fallback,[{...seed,id:7,slug:'two',order:0},{...seed,id:3,slug:'three',order:3},{id:'invalid'}])
  assert.deepEqual(merged.map(project=>project.id),[7,1,3])
  assert.deepEqual(fallback,before)
})
