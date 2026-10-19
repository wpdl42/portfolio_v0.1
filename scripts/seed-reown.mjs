import nextEnv from '@next/env'
import { MongoClient } from 'mongodb'
import { readFile } from 'node:fs/promises'
import { getProjectDatabaseName, projectStorage, upsertProject } from '../lib/projects/storage.mjs'

nextEnv.loadEnvConfig(process.cwd())
const seed = JSON.parse(await readFile(new URL('../data/reown-project.json',import.meta.url),'utf8'))
const uri = process.env.MONGODB_URI
if(!uri) { console.error('MONGODB_URI is missing. No database changes were made.'); process.exit(1) }
let client
try {
  client = new MongoClient(uri,{serverSelectionTimeoutMS:projectStorage.seedTimeoutMS,connectTimeoutMS:projectStorage.seedTimeoutMS,socketTimeoutMS:projectStorage.seedTimeoutMS})
  await client.connect()
  const database = getProjectDatabaseName()
  const collection = client.db(database).collection(projectStorage.collection)
  const {result, ...saved} = await upsertProject(collection, seed)
  console.log(JSON.stringify({result,database,collection:projectStorage.collection,...saved}))
} catch(error) {
  // Never print driver errors: they may contain connection credentials or hosts.
  const safe = ['MULTIPLE_MATCHES','ID_CONFLICT','VERIFY_FAILED'].includes(error?.message)?error.message:'CONNECTION_OR_DATABASE_OPERATION_FAILED'
  console.error(`Project registration failed: ${safe}. Database registration is not confirmed.`)
  process.exitCode=1
} finally { await client?.close() }
