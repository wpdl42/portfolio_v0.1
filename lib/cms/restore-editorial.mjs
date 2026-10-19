import { parseCmsValues, toFormValues } from './schema.ts'

// One-time, explicit rollback. Split records and tombstones are retained as archives.
export async function restoreEditorialDocuments(db, { dryRun = false } = {}) {
  const collection = db.collection('portfolio_content')
  const documents = await collection.find({ kind: { $in:['about','contact'] }, deletedAt:null, legacyEditorRestoredAt:{$exists:false} }).toArray()
  const plans = []
  for (const document of documents) {
    const kind = document.kind, sourceKind = kind === 'contact' ? 'contact-links' : 'about-sections'
    const sources = await collection.find({kind:sourceKind}).sort({'data.order':1,_id:1}).toArray()
    if (!sources.length || (kind === 'contact' && !document.linksMigratedAt)) continue
    const active = sources.filter(item => !item.deletedAt && item.data.visibility === 'public').map(item => item.data)
    const data = { ...document.data }
    if (kind === 'contact') {
      const emails = active.filter(item => item.type === 'email')
      if (emails.length > 1) throw new Error('MULTIPLE_EMAIL_LINKS')
      const github = active.find(item => item.type === 'github'), blog = active.find(item => item.type === 'blog'), email = emails[0]
      Object.assign(data, { email:email?.email ?? '', github:github?.url ?? '', githubLabel:github?.label ?? '', blog:blog?.url ?? '', blogLabel:blog?.label ?? '', links:active.filter(item => item !== email && item !== github && item !== blog).map(item => ({label:item.label,url:item.url})) })
    } else {
      for (const section of ['bio','interests','workStyle']) {
        const entries = active.filter(item => item.section === section).map(item => `${item.title}\n${item.body}`)
        if (entries.length) data[section] = [data[section],...entries].filter(Boolean).join('\n\n')
      }
    }
    const parsed = parseCmsValues(kind,toFormValues(kind,data))
    if (!parsed.valid) throw new Error('INVALID_RESTORED_CONTENT')
    const changed = Object.entries(parsed.data).some(([key,value]) => JSON.stringify(value)!==JSON.stringify(document.data[key]))
    plans.push({document, sources, data:parsed.data, changed})
  }
  if (!dryRun) for (const {document,sources,data,changed} of plans) {
    const now = new Date()
    const result = await collection.updateOne({_id:document._id,legacyEditorRestoredAt:{$exists:false},...(document.version===undefined?{version:{$exists:false}}:{version:document.version})},{$set:{...Object.fromEntries(Object.entries(data).map(([key,value])=>[`data.${key}`,value])),legacyEditorRestoredAt:now,editorialRollbackBackup:{data:document.data,sourceIds:sources.map(item=>item._id),createdAt:now},...(changed?{updatedAt:now}:{})},...(changed?{$inc:{version:1}}:{})})
    if (!result.modifiedCount) throw new Error('EDITORIAL_VERSION_CONFLICT')
  }
  return { documents:plans.length, changed:plans.filter(plan=>plan.changed).length, archivedRecords:plans.reduce((sum,plan)=>sum+plan.sources.length,0), dryRun }
}
