import nextEnv from '@next/env'
import { MongoClient } from 'mongodb'
import { readFile } from 'node:fs/promises'

nextEnv.loadEnvConfig(process.cwd())
const seed = JSON.parse(await readFile(new URL('../data/reown-project.json',import.meta.url),'utf8'))
const uri = process.env.MONGODB_URI
if(!uri) { console.error('MONGODB_URI is missing. No database changes were made.'); process.exit(1) }
let client
try {
  client = new MongoClient(uri,{serverSelectionTimeoutMS:8000,connectTimeoutMS:8000,socketTimeoutMS:8000})
  await client.connect()
  const collection = client.db(process.env.MONGODB_DB ?? 'portfolio').collection('projects')
  await collection.createIndex({slug:1},{unique:true,partialFilterExpression:{slug:{$type:'string'}},name:'project_unique_slug'})
  await collection.createIndex({canonicalUrl:1},{unique:true,partialFilterExpression:{canonicalUrl:{$type:'string'}},name:'project_unique_deployment'})
  const filter={$or:[{slug:seed.slug},{canonicalUrl:seed.canonicalUrl},{link:{$in:[seed.canonicalUrl,seed.link]}}]}
  const matches=await collection.find(filter).toArray()
  if(matches.length>1) throw new Error('MULTIPLE_MATCHES')
  const existing=matches[0]
  const collision=await collection.findOne({id:seed.id,...(existing?{_id:{$ne:existing._id}}:{})})
  if(collision&&(!existing||!Number.isSafeInteger(existing.id))) throw new Error('ID_CONFLICT')
  const {id,order,...content}=seed
  const now=new Date()
  await collection.updateOne(existing?{_id:existing._id}:filter,{$set:{...content,id:existing?.id??id,order:existing?.order??order,updatedAt:now},$setOnInsert:{createdAt:now}},{upsert:true})
  const saved=await collection.findOne({slug:seed.slug})
  const count=await collection.countDocuments(filter)
  if(count!==1||!saved) throw new Error('VERIFY_FAILED')
  console.log(JSON.stringify({result:existing?'updated':'inserted',database:process.env.MONGODB_DB??'portfolio',collection:'projects',id:saved.id,slug:saved.slug,title:saved.title,matches:count,visibility:saved.visibility}))
} catch(error) {
  // Never print driver errors: they may contain connection credentials or hosts.
  const safe = ['MULTIPLE_MATCHES','ID_CONFLICT','VERIFY_FAILED'].includes(error?.message)?error.message:'CONNECTION_OR_DATABASE_OPERATION_FAILED'
  console.error(`Project registration failed: ${safe}. Database registration is not confirmed.`)
  process.exitCode=1
} finally { await client?.close() }
