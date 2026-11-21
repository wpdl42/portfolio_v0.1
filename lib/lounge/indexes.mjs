export async function ensureLoungeIndexes(db) {
  await Promise.all([
    db.collection('lounge_threads').createIndex({ requestKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: 'string' } }, name: 'lounge_thread_request' }),
    db.collection('lounge_threads').createIndex({ userId: 1, deletedAt: 1, _id: -1 }, { name: 'lounge_author_list' }),
    db.collection('lounge_threads').createIndex({ isSecret: 1, deletedAt: 1, _id: -1 }, { name: 'lounge_public_list' }),
    db.collection('lounge_messages').createIndex({ requestKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: 'string' } }, name: 'lounge_message_request' }),
    db.collection('lounge_messages').createIndex({ threadId: 1, deletedAt: 1, createdAt: -1, _id: -1 }, { name: 'lounge_conversation_time' }),
  ])
}
