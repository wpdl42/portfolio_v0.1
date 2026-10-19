// Shared storage names and limits for the server reader and the registration CLI.
export const projectStorage = {
  defaultDatabase: 'portfolio',
  collection: 'projects',
  readTimeoutMS: 5000,
  seedTimeoutMS: 8000,
  readLimit: 500,
}

export function getProjectDatabaseName() {
  return process.env.MONGODB_DB ?? projectStorage.defaultDatabase
}

export async function upsertProject(collection, seed) {
  await collection.createIndex({slug:1},{unique:true,partialFilterExpression:{slug:{$type:'string'}},name:'project_unique_slug'})
  await collection.createIndex({canonicalUrl:1},{unique:true,partialFilterExpression:{canonicalUrl:{$type:'string'}},name:'project_unique_deployment'})

  const filter = {$or:[{slug:seed.slug},{canonicalUrl:seed.canonicalUrl},{link:{$in:[seed.canonicalUrl,seed.link]}}]}
  const matches = await collection.find(filter).toArray()
  if (matches.length > 1) throw new Error('MULTIPLE_MATCHES')

  const existing = matches[0]
  const collision = await collection.findOne({id:seed.id,...(existing?{_id:{$ne:existing._id}}:{})})
  if (collision && (!existing || !Number.isSafeInteger(existing.id))) throw new Error('ID_CONFLICT')

  const {id, order, ...content} = seed
  const now = new Date()
  await collection.updateOne(
    existing ? {_id:existing._id} : filter,
    {$set:{...content,id:existing?.id??id,order:existing?.order??order,updatedAt:now},$setOnInsert:{createdAt:now}},
    {upsert:true},
  )

  const saved = await collection.findOne({slug:seed.slug})
  const count = await collection.countDocuments(filter)
  if (count !== 1 || !saved) throw new Error('VERIFY_FAILED')
  return {result:existing?'updated':'inserted',id:saved.id,slug:saved.slug,title:saved.title,matches:count,visibility:saved.visibility}
}
