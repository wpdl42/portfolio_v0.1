import assert from 'node:assert/strict'
import { restoreEditorialDocuments } from '../lib/cms/restore-editorial.mjs'

export async function checkEditorialRollback(db) {
  const collection=db.collection('portfolio_content')
  const contact=await collection.findOne({kind:'contact'}), about=await collection.findOne({kind:'about'})
  await collection.updateOne({_id:contact._id},{$set:{linksMigratedAt:new Date()}})
  const records=[
    {_id:'contact-links:rollback-live',kind:'contact-links',data:{type:'github',label:'Preserved GitHub',url:'https://example.com/preserved-github',visibility:'public',order:0}},
    {_id:'contact-links:rollback-private',kind:'contact-links',data:{type:'email',label:'Private email',email:'private@example.com',visibility:'private',order:1}},
    {_id:'contact-links:rollback-deleted',kind:'contact-links',deletedAt:new Date(),data:{type:'blog',label:'Deleted blog',url:'https://example.com/deleted-blog',visibility:'public',order:2}},
    {_id:'about-sections:rollback-live',kind:'about-sections',data:{section:'interests',title:'Preserved interests',body:'Preserved additional paragraph',visibility:'public',order:0}},
    {_id:'about-sections:rollback-private',kind:'about-sections',data:{section:'bio',title:'Private biography',body:'Never publish this paragraph',visibility:'private',order:1}},
    {_id:'about-sections:rollback-deleted',kind:'about-sections',deletedAt:new Date(),data:{section:'bio',title:'Deleted biography',body:'Never restore this paragraph',visibility:'public',order:2}},
  ]
  await collection.insertMany(records)
  const dryRun=await restoreEditorialDocuments(db,{dryRun:true});assert.equal(dryRun.documents,2)
  assert.equal((await collection.findOne({_id:contact._id})).version,contact.version)
  const applied=await restoreEditorialDocuments(db);assert.equal(applied.documents,2)
  const current=await collection.findOne({_id:contact._id}), currentAbout=await collection.findOne({_id:about._id})
  assert.equal(current.data.github,'https://example.com/preserved-github')
  assert.equal(current.data.githubLabel,'Preserved GitHub')
  assert.equal(current.data.email,'');assert.equal(current.data.blog,'')
  assert.deepEqual(current.editorialRollbackBackup.data,contact.data)
  assert.ok(currentAbout.data.interests.includes('Preserved additional paragraph'))
  assert.equal(currentAbout.data.bio,about.data.bio)
  assert.equal((await restoreEditorialDocuments(db)).documents,0)
  assert.equal(await collection.countDocuments({kind:{$in:['contact-links','about-sections']}}),6)
  assert.ok((await collection.findOne({_id:'contact-links:rollback-deleted'})).deletedAt)
  console.log('PASS editorial rollback: current content consolidated, originals archived, private/deleted content stays hidden, dry run and repeated execution safe')
}
