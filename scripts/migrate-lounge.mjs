import nextEnv from '@next/env'
import { MongoClient } from 'mongodb'
import { getProjectDatabaseName } from '../lib/projects/storage.mjs'
import { migrateGuestbook } from '../lib/lounge/migration.mjs'
nextEnv.loadEnvConfig(process.cwd())
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required')
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
try {
  await client.connect()
  const result = await migrateGuestbook(client, client.db(getProjectDatabaseName()), { dryRun: !process.argv.includes('--apply') })
  console.log(JSON.stringify(result))
} finally { await client.close() }
