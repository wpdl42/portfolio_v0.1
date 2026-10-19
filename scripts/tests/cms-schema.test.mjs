import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCmsValues, toFormValues, safeContentUrl } from '../../lib/cms/schema.ts'

test('rejects unlisted fields and unsafe URLs without accepting a Mongo update document', () => {
  const fields={...toFormValues('projects'),title:'Project',description:'Summary'}
  assert.equal(parseCmsValues('projects',fields).valid,true)
  for(const extra of [{_id:'x'},{id:'123'},{'$set':'x'},{slug:'existing'}]) assert.equal(parseCmsValues('projects',{...fields,...extra}).valid,false)
  for(const link of ['javascript:alert(1)','data:text/html,hi','https://user:password@example.com','https://example.com/\nunsafe']) assert.equal(parseCmsValues('projects',{...fields,link}).valid,false)
  assert.equal(safeContentUrl('/images/../secret',true),false)
  assert.equal(safeContentUrl('/images/project.png',true),true)
})
test('validates real dates, chronological order, and stable note address format', () => {
  const journey={...toFormValues('journey'),title:'Journey'}
  assert.equal(parseCmsValues('journey',{...journey,startDate:'2026-02-30'}).valid,false)
  assert.equal(parseCmsValues('journey',{...journey,startDate:'2026-10-20',endDate:'2026-10-19'}).valid,false)
  const note={...toFormValues('notes'),title:'Note',body:'Body',slug:'valid-slug'}
  assert.equal(parseCmsValues('notes',note).valid,true)
  assert.equal(parseCmsValues('notes',{...note,slug:'../../admin'}).valid,false)
})
test('round trips nested details, related IDs and link lists', () => {
  const fields={...toFormValues('projects'),title:' Project ',description:' Summary ','detail.tags':'React, React, MongoDB','detail.features':'One\nTwo'}
  const parsed=parseCmsValues('projects',fields)
  assert.equal(parsed.valid,true); assert.equal(parsed.data.title,'Project')
  assert.deepEqual(parsed.data.detail.tags,['React','MongoDB'])
  assert.deepEqual(toFormValues('projects',parsed.data)['detail.features'],'One\nTwo')
  assert.deepEqual(parseCmsValues('skills',{...toFormValues('skills'),name:'MongoDB',group:'Tools',projectIds:'1, 2'}).data.projectIds,[1,2])
  assert.equal(parseCmsValues('contact',{...toFormValues('contact'),heading:'Contact',links:'GitHub | javascript:alert(1)'}).valid,false)
})
test('validates category colors, order, bounded text and defaults new content to private', () => {
  assert.equal(toFormValues('projects').visibility,'private')
  assert.equal(parseCmsValues('categories',{...toFormValues('categories'),label:'Projects',color:'purple'}).valid,false)
  assert.equal(parseCmsValues('categories',{...toFormValues('categories'),label:'Projects',color:'#aabbcc',order:'-1'}).valid,false)
  assert.equal(parseCmsValues('projects',{...toFormValues('projects'),title:'x'.repeat(121),description:'Summary'}).valid,false)
})

test('restores the original Contact form with validated email, web URLs and additional links', () => {
  const fields={...toFormValues('contact'),heading:'Contact',email:'test@example.com',github:'https://github.com/example',githubLabel:'GitHub',blog:'https://example.com/blog',blogLabel:'Blog',links:'Website | https://example.com'}
  const parsed=parseCmsValues('contact',fields)
  assert.equal(parsed.valid,true)
  assert.deepEqual(toFormValues('contact',parsed.data),fields)
  assert.equal(parseCmsValues('contact',{...fields,email:'invalid'}).valid,false)
  assert.equal(parseCmsValues('contact',{...fields,github:'javascript:alert(1)'}).valid,false)
})
