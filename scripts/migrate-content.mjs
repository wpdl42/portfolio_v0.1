import nextEnv from '@next/env'
import {MongoClient} from 'mongodb'
import {readFile} from 'node:fs/promises'
import {parseCmsValues,toFormValues} from '../lib/cms/schema.ts'
import {ensureContentIndexes} from '../lib/cms/indexes.mjs'
import {getProjectDatabaseName} from '../lib/projects/storage.mjs'
import {migrateContactLinks} from '../lib/cms/migrate-contact-links.mjs'

nextEnv.loadEnvConfig(process.cwd())
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required')
const load = async name => JSON.parse(await readFile(new URL('../data/'+name,import.meta.url),'utf8'))
const seed = await load('content-seed.json')
const local = await load('projects.json'), reown = await load('reown-project.json')
const initialProjects = [...local.map(record=>({...record.project,detail:record.detail,illustration:record.illustration})),reown]
const client = new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000,connectTimeoutMS:8000,socketTimeoutMS:30000})
let inserted=0, preserved=0, addedFields=0
let phase='connect'
try {
  await client.connect()
  const db=client.db(getProjectDatabaseName()), projects=db.collection('projects'), content=db.collection('portfolio_content')
  phase='indexes'
  await ensureContentIndexes(db)
  phase='projects'
  async function migrateProject(source) {
    const {data,valid,errors}=parseCmsValues('projects',toFormValues('projects',{...source,visibility:source.visibility??'public',order:source.order??source.id,kind:source.kind??'project',teamType:source.teamType??(source.category?.includes('Team')?'team':source.category?.includes('Personal')?'personal':'')}))
    if(!valid) throw new Error('INVALID_SOURCE_PROJECT:'+Object.keys(errors).join(','))
    const matches=[{id:source.id},...(source.slug?[{slug:source.slug}]:[]),...(source.routeId?[{routeId:source.routeId}]:[]),...(source.canonicalUrl?[{canonicalUrl:source.canonicalUrl}]:[]),...(source.link?[{link:source.link}]:[])]
    const found=await projects.find({$or:matches}).toArray()
    if(found.length>1) throw new Error('AMBIGUOUS_PROJECT_MATCH')
    if(found[0]?.deletedAt) { preserved++; return }
    const now=new Date()
    const document={...source,...data,version:1,createdAt:now,updatedAt:now}
    // Index the current saved deployment, including projects predating the CMS.
    const currentLink=found[0]?.link??data.link
    if(currentLink) document.canonicalUrl=new URL(currentLink).href.replace(/\/$/,'')
    else delete document.canonicalUrl
    if(found[0]) {
      // Add only missing fields; a concurrent/user change always wins.
      for(const [key,value] of Object.entries(document)) {
        if(value===undefined) continue
        if(key==='detail' && found[0].detail && typeof found[0].detail==='object') {
          for(const [field,text] of Object.entries(value)) {
            if(Object.hasOwn(found[0].detail,field)) continue
            const result=await projects.updateOne({_id:found[0]._id,[`detail.${field}`]:{$exists:false}},{$set:{[`detail.${field}`]:text}})
            addedFields+=result.modifiedCount
          }
        } else {
          if(Object.hasOwn(found[0],key)) continue
          const result=await projects.updateOne({_id:found[0]._id,[key]:{$exists:false}},{$set:{[key]:value}})
          addedFields+=result.modifiedCount
        }
      }
      preserved++
    } else {
      const result=await projects.updateOne({id:source.id},{$setOnInsert:document},{upsert:true})
      inserted+=result.upsertedCount; preserved+=result.upsertedCount?0:1
    }
  }
  for(const source of initialProjects) await migrateProject(source)
  for(const experiment of seed.experiments) {
    const routeId=`experiment-${experiment.number}`
    const existing=await projects.findOne({routeId})
    const last=await projects.find({id:{$type:'number'}}).sort({id:-1}).limit(1).next()
    await migrateProject({id:existing?.id??last.id+1,routeId,slug:routeId,title:experiment.title,description:experiment.description,category:'Web · 수업 실험',role:'작성 예정',period:'작성 예정',visibility:'public',order:100+Number(experiment.number),kind:'experiment',accent:'blue',detail:{tags:['수업','실험'],overview:experiment.description,process:'추가 기술 설명과 작업 과정은 등록 예정입니다.',learnings:[]}})
  }
  phase='content'
  for(const entry of seed.entries) {
    const parsed=parseCmsValues(entry.kind,toFormValues(entry.kind,entry.data))
    if(!parsed.valid) throw new Error('INVALID_SOURCE_CONTENT:'+entry.key)
    const now=new Date()
    const result=await content.updateOne({_id:entry.key},{$setOnInsert:{kind:entry.kind,data:entry.kind==='contact'?{...entry.data,...parsed.data}:parsed.data,...(entry.kind==='notes'?{slugs:[parsed.data.slug]}:{}),version:1,createdAt:now,updatedAt:now}},{upsert:true})
    inserted+=result.upsertedCount; preserved+=result.upsertedCount?0:1
  }
  phase='contact-links'
  inserted += await migrateContactLinks(db)
  console.log(JSON.stringify({database:getProjectDatabaseName(),inserted,preserved,missingFieldsAdded:addedFields,projects:await projects.countDocuments({}),content:await content.countDocuments({})}))
} catch(error) {
  const safe=String(error?.message??'').match(/^(INVALID_SOURCE_PROJECT:[\w.,]+|INVALID_SOURCE_CONTENT:[\w:-]+|AMBIGUOUS_PROJECT_MATCH|INVALID_CONTACT_LINK)$/)?.[0]??`MIGRATION_FAILED${Number.isSafeInteger(error?.code)?':'+error.code:''}`
  console.error(`${safe} (${phase}; ${/^[A-Za-z]+$/.test(error?.name??'')?error.name:'Error'})`);process.exitCode=1
} finally { await client.close() }
