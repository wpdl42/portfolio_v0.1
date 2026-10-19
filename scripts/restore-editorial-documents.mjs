import nextEnv from '@next/env'
import { MongoClient } from 'mongodb'
import { getProjectDatabaseName } from '../lib/projects/storage.mjs'
import { restoreEditorialDocuments } from '../lib/cms/restore-editorial.mjs'

nextEnv.loadEnvConfig(process.cwd())
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required')
const client = new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000,socketTimeoutMS:30000})
try {
  await client.connect()
  console.log(JSON.stringify(await restoreEditorialDocuments(client.db(getProjectDatabaseName()),{dryRun:!process.argv.includes('--apply')})))
} catch(error) {
  console.error(['MULTIPLE_EMAIL_LINKS','INVALID_RESTORED_CONTENT','EDITORIAL_VERSION_CONFLICT'].includes(error.message)?error.message:'EDITORIAL_ROLLBACK_FAILED')
  process.exitCode=1
} finally { await client.close() }
