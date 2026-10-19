import assert from 'node:assert/strict'
import test from 'node:test'
import { createEditorValues, createEditorPreview, loadProjectDrafts, saveProjectDraft, validateEditorValues, isEditorUrl, projectDraftStorageKey } from '../../lib/projects/editor-drafts.ts'

const project = { id: 5, title: 'Classroom', category: 'Web', description: 'Original', role: 'Developer', period: 'Unknown', accent: 'blue', link: 'https://example.com' }
const detail = { tags: ['Web', 'Next.js'], process: 'Process', learnings: ['Learning'], features: ['Feature'] }
const draft = (key, values = createEditorValues(project, detail)) => ({ key, projectId: key.startsWith('project:') ? Number(key.split(':')[1]) : null, values, updatedAt: '2026-10-19T00:00:00.000Z' })

function storage() {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}

test('existing project, detail and deployment URL hydrate without mutating the published source', () => {
  const before = structuredClone({ project, detail })
  const values = createEditorValues(project, detail)
  assert.equal(values.link, project.link)
  assert.equal(values.status, '')
  assert.equal(values.tags, 'Web, Next.js')
  values.title = 'Draft title'
  values.features = 'One\r\nTwo\nOne'
  const preview = createEditorPreview(values, project)
  assert.equal(preview.title, 'Draft title')
  assert.deepEqual(preview.detail.features, ['One', 'Two'])
  assert.deepEqual({ project, detail }, before)
})

test('saved drafts survive reopening, replace their own entry and retain unrelated drafts', () => {
  const local = storage()
  const first = saveProjectDraft(local, [], draft('project:5'))
  const second = saveProjectDraft(local, first, draft('draft:new'))
  const values = { ...createEditorValues(project, detail), title: 'Changed' }
  saveProjectDraft(local, second, draft('project:5', values))
  const restored = loadProjectDrafts(local)
  assert.equal(restored.length, 2)
  assert.equal(restored[0].values.title, 'Changed')
  assert.equal(restored[1].key, 'draft:new')
})

test('storage failure leaves the caller drafts and current input intact', () => {
  const drafts = [draft('project:5')]
  const values = { ...createEditorValues(project, detail), title: 'Still editing' }
  const before = structuredClone(drafts)
  assert.throws(() => saveProjectDraft({ setItem() { throw new Error('quota') } }, drafts, draft('draft:new', values)), /quota/)
  assert.deepEqual(drafts, before)
  assert.equal(values.title, 'Still editing')
})

test('restoration ignores malformed or unsafe entries and rejects unknown storage versions', () => {
  const local = storage()
  local.setItem(projectDraftStorageKey, JSON.stringify({ version: 1, drafts: [draft('project:5'), { ...draft('draft:bad'), values: { title: 1 } }, draft('draft:unsafe', { ...createEditorValues(), link: 'javascript:alert(1)' })] }))
  assert.deepEqual(loadProjectDrafts(local).map(item => item.key), ['project:5'])
  local.setItem(projectDraftStorageKey, JSON.stringify({ version: 99, drafts: [] }))
  assert.throws(() => loadProjectDrafts(local), /INVALID_DRAFT_STORAGE/)
})

test('draft validation blocks unsafe links while allowing incomplete content and local image paths', () => {
  const values = createEditorValues()
  assert.ok(validateEditorValues(values).title)
  values.title = 'New draft'
  assert.deepEqual(validateEditorValues(values), {})
  for (const url of ['javascript:alert(1)', '//example.com', 'https://user:password@example.com', 'https://example.com/"test', '/images/../secret']) assert.equal(isEditorUrl(url, true), false)
  assert.equal(isEditorUrl('/images/project-classroom.svg', true), true)
  values.link = 'javascript:alert(1)'
  assert.ok(validateEditorValues(values).link)
  assert.equal(createEditorPreview(values).link, undefined)
  assert.equal(values.link, 'javascript:alert(1)')
})
