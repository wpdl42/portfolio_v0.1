import { ensureLoungeIndexes } from './indexes.mjs'

export async function migrateGuestbook(client, db, { dryRun = true } = {}) {
  const result = { inserted: 0, preserved: 0, legacy: 0, renamed: false, dryRun }
  if (!dryRun) await ensureLoungeIndexes(db)
  const cursor = db.collection('guestbook_messages').find({}).sort({ _id: 1 })
  for await (const legacy of cursor) {
    result.legacy++
    if (typeof legacy.body !== 'string' || typeof legacy.userId !== 'string' || !legacy._id?.toHexString) throw new Error('INVALID_LEGACY_GUESTBOOK_RECORD')
    const title = (legacy.body.split(/\r?\n/).find(line => line.trim())?.trim() || '이전 이야기').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80) || '이전 이야기'
    const createdAt = legacy.createdAt instanceof Date ? legacy.createdAt : legacy._id.getTimestamp()
    const updatedAt = legacy.updatedAt instanceof Date ? legacy.updatedAt : createdAt
    const deletedAt = legacy.deletedAt instanceof Date ? legacy.deletedAt : null
    const common = { userId: legacy.userId, nickname: legacy.nickname || '방문자', isOwner: !!legacy.isOwner, createdAt, updatedAt, deletedAt, version: 1 }
    const inspect = async session => {
      const thread = await db.collection('lounge_threads').findOne({ _id: legacy._id }, { session })
      const message = await db.collection('lounge_messages').findOne({ _id: legacy._id }, { session })
      if (thread || message) {
        if (!thread || !message || !thread.legacyId?.equals(legacy._id) || !message.threadId?.equals(legacy._id)) throw new Error('LEGACY_MIGRATION_CONFLICT')
        return false
      }
      if (!dryRun) {
        await db.collection('lounge_threads').insertOne({ _id: legacy._id, legacyId: legacy._id, ...common, title, isSecret: legacy.isSecret === true }, { session })
        await db.collection('lounge_messages').insertOne({ _id: legacy._id, threadId: legacy._id, ...common, deletedAt: null, body: legacy.body }, { session })
      }
      return true
    }
    let inserted
    if (dryRun) inserted = await inspect()
    else {
      const session = client.startSession()
      try { inserted = await session.withTransaction(() => inspect(session)) } finally { await session.endSession() }
    }
    if (inserted) result.inserted++
    else result.preserved++
  }
  const category = await db.collection('portfolio_content').findOne({ _id: 'categories:contact' })
  if (category && category.data.label !== 'Lounge') {
    result.renamed = true
    if (!dryRun) {
      const updated = await db.collection('portfolio_content').updateOne({ _id: category._id, version: category.version }, { $set: { 'data.label': 'Lounge', updatedAt: new Date() }, $inc: { version: 1 } })
      if (!updated.matchedCount) throw new Error('CATEGORY_CHANGED_RETRY_MIGRATION')
    }
  }
  return result
}
