import { createHash } from 'node:crypto'
import { parseCmsValues, toFormValues } from './schema.ts'

// Explicit CLI migration only: page reads never write or re-create links.
export async function migrateContactLinks(db) {
  const collection = db.collection('portfolio_content')
  let inserted = 0
  for (const contact of await collection.find({ kind:'contact', linksMigratedAt: { $exists:false } }).toArray()) {
    const source = contact.data ?? {}, links = []
    if (source.email) links.push({ key:'email',label:'Email',email:source.email,type:'email' })
    if (source.github) links.push({ key:'github', label:source.githubLabel || 'GitHub', url:source.github, type:'github' })
    if (source.blog) links.push({ key:'blog', label:source.blogLabel || 'Blog', url:source.blog, type:'blog' })
    for (const link of source.links ?? []) links.push({ ...link, type:'other', key:createHash('sha256').update(`${link.label}\n${link.url}`).digest('hex').slice(0,24) })
    for (const [order, link] of links.entries()) {
      const parsed = parseCmsValues('contact-links', toFormValues('contact-links',{...link,order,visibility:'public'}))
      if (!parsed.valid) throw new Error('INVALID_CONTACT_LINK')
      const now = new Date()
      const result = await collection.updateOne({_id:`contact-links:legacy-${link.key}`},{$setOnInsert:{kind:'contact-links',data:parsed.data,version:1,createdAt:now,updatedAt:now}},{upsert:true})
      inserted += result.upsertedCount
    }
    await collection.updateOne({_id:contact._id,linksMigratedAt:{$exists:false}},{$set:{linksMigratedAt:new Date()}})
  }
  return inserted
}
