import "server-only"
import { randomUUID } from "node:crypto"
import { cache } from "react"
import type { Document, Filter } from "mongodb"
import { connectPortfolioMongo } from "@/lib/mongodb.server"
import { getProjectDatabaseName } from "@/lib/projects/storage.mjs"
import type { Project } from "@/lib/projects/types"
import { categories as navigationDefaults, type Category } from "@/lib/orb-content"
import { categoryIds, type CmsItem, type PortfolioContent } from "./types"
import { cmsFields, parseCmsValues, toFormValues, type CmsKind } from "./schema"
import { ensureContentIndexes } from "./indexes.mjs"

export type ContentDocument = { _id: string; kind: CmsKind; data: Record<string, unknown>; slugs?: string[]; version?: number; createdAt?: Date; updatedAt?: Date; deletedAt?: Date | null }
export class CmsError extends Error { constructor(public status: number, message: string, public fields?: Record<string, string>) { super(message) } }
export async function cmsDatabase() {
  const connection = connectPortfolioMongo()
  if (!connection) throw new CmsError(503, "MongoDB 연결 설정이 필요합니다.")
  try { return (await connection).db(getProjectDatabaseName()) } catch { throw new CmsError(503, "MongoDB에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.") }
}
let indexes: Promise<unknown> | undefined
export async function ensureCmsIndexes() {
  if (!indexes) indexes = (async () => {
    const db = await cmsDatabase()
    await ensureContentIndexes(db)
  })().catch(error => { indexes = undefined; throw error })
  await indexes
}
const dateText = (value: unknown) => value instanceof Date ? value.toISOString() : null
function contentItem(document: ContentDocument): CmsItem {
  return { key: document._id, version: document.version ?? 0, createdAt: dateText(document.createdAt), updatedAt: dateText(document.updatedAt), deletedAt: dateText(document.deletedAt), data: document.data }
}
export function projectFromDocument(document: Document): Project | null {
  if (!Number.isSafeInteger(document.id) || document.id < 1) return null
  const parsed = parseCmsValues("projects", toFormValues("projects", document))
  if (!parsed.valid) return null
  return { ...parsed.data, id: document.id, slug: typeof document.slug === "string" ? document.slug : undefined, routeId: typeof document.routeId === "string" ? document.routeId : undefined, illustration: typeof document.illustration === "string" ? document.illustration : undefined, version: document.version ?? 0 } as Project
}
export async function listAdminContent(kind: CmsKind, deleted = false): Promise<CmsItem[]> {
  const db = await cmsDatabase()
  const deletionFilter = { deletedAt: deleted ? { $type: "date" as const } : null }
  if (kind === "projects") {
    const rows = await db.collection("projects").find(deletionFilter, { maxTimeMS: 5000 }).sort({ order: 1, id: 1 }).limit(1000).toArray()
    return rows.map(row => {
      const project = projectFromDocument(row)
      if (!project) throw new CmsError(422, `프로젝트 ${row.id ?? ""}의 데이터 형식을 확인해 주세요.`)
      return { key: String(row.id), version: row.version ?? 0, data: project as unknown as Record<string, unknown>, createdAt: dateText(row.createdAt), updatedAt: dateText(row.updatedAt), deletedAt: dateText(row.deletedAt) }
    })
  }
  return (await db.collection<ContentDocument>("portfolio_content").find({ kind, ...deletionFilter }, { maxTimeMS: 5000 }).sort({ "data.order": 1, _id: 1 }).limit(1000).toArray()).map(contentItem)
}
export async function saveCmsContent(kind: CmsKind, values: unknown, key?: string, version?: number) {
  // Reject the previous two-field Contact form so an open stale tab cannot clear links.
  if (kind === "contact" && key && values && typeof values === "object" && cmsFields.contact.some(field => !Object.hasOwn(values, field.name))) throw new CmsError(409, "Contact 관리 화면이 변경되었습니다. 페이지를 새로고침한 뒤 다시 저장해 주세요.")
  const parsed = parseCmsValues(kind, values)
  if (!parsed.valid) throw new CmsError(422, "입력한 내용을 확인해 주세요.", parsed.errors)
  if (key !== undefined && (!Number.isSafeInteger(version) || Number(version) < 0)) throw new CmsError(400, "수정 버전이 필요합니다.")
  if (!key && ["about", "contact", "categories"].includes(kind)) throw new CmsError(400, "기존 설정 항목을 선택해 주세요. 이전 스크립트로 초기 항목을 준비할 수 있습니다.")
  const db = await cmsDatabase()
  await ensureCmsIndexes()
  const now = new Date()
  const data = parsed.data
  if (kind === "skills") {
    const ids = data.projectIds as number[]
    if (ids.length && await db.collection("projects").countDocuments({ id: { $in: ids } }, { maxTimeMS: 5000 }) !== ids.length) throw new CmsError(422, "존재하는 프로젝트 ID를 입력해 주세요.", { projectIds: "프로젝트 ID를 확인해 주세요." })
  }
  try {
    if (kind === "projects") {
      const collection = db.collection("projects")
      const canonicalUrl = data.link ? new URL(String(data.link)).href.replace(/\/$/, "") : null
      if (key) {
        if (!/^[1-9]\d*$/.test(key)) throw new CmsError(400, "올바른 프로젝트 ID가 필요합니다.")
        const existing = await collection.findOne({ id: Number(key) })
        if (!existing) throw new CmsError(404, "프로젝트를 찾을 수 없습니다.")
        if (existing.deletedAt) throw new CmsError(409, "휴지통에 있는 항목입니다. 복원한 뒤 편집해 주세요.")
        const match: Filter<Document> = { _id: existing._id, deletedAt: null, ...(version === 0 ? { $or: [{ version: 0 }, { version: { $exists: false } }] } : { version }) }
        const fields = Object.fromEntries(Object.entries(data).flatMap(([field, value]) => field === "detail" ? Object.entries(value as Record<string, unknown>).map(([name, text]) => [`detail.${name}`, text]) : [[field, value]]))
        const result = await collection.findOneAndUpdate(match, { $set: { ...fields, ...(canonicalUrl ? { canonicalUrl } : {}), updatedAt: now }, ...(!canonicalUrl ? { $unset: { canonicalUrl: "" } } : {}), $inc: { version: 1 } }, { returnDocument: "after" })
        if (!result) throw new CmsError(409, "다른 편집에서 먼저 수정했습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.")
        return { key, version: result.version, data: projectFromDocument(result) as unknown as Record<string, unknown>, createdAt: dateText(result.createdAt), updatedAt: dateText(result.updatedAt) }
      }
      const last = await collection.find({ id: { $type: "number" } }).sort({ id: -1 }).limit(1).next()
      const counters = db.collection<{ _id: string; value: number }>("portfolio_counters")
      await counters.updateOne({ _id: "project-id" }, { $max: { value: last?.id ?? 0 } }, { upsert: true })
      const sequence = await counters.findOneAndUpdate({ _id: "project-id" }, { $inc: { value: 1 } }, { returnDocument: "after" })
      if (!sequence) throw new CmsError(503, "프로젝트 번호를 만들지 못했습니다.")
      const document = { ...data, id: sequence.value, slug: `project-${sequence.value}`, ...(canonicalUrl ? { canonicalUrl } : {}), version: 1, createdAt: now, updatedAt: now }
      await collection.insertOne(document)
      return { key: String(document.id), version: 1, data: projectFromDocument(document) as unknown as Record<string, unknown>, createdAt: now.toISOString(), updatedAt: now.toISOString() }
    }
    const collection = db.collection<ContentDocument>("portfolio_content")
    if (key) {
      const existing = await collection.findOne({ _id: key, kind })
      if (!existing) throw new CmsError(404, "편집 항목을 찾을 수 없습니다.")
      if (existing.deletedAt) throw new CmsError(409, "휴지통에 있는 항목입니다. 복원한 뒤 편집해 주세요.")
      const slugs = kind === "notes" ? [...new Set([...(existing.slugs ?? []), String(existing.data.slug), String(data.slug)])] : undefined
      const fields = Object.fromEntries(Object.entries(data).map(([field, value]) => [`data.${field}`, value]))
      const result = await collection.findOneAndUpdate({ _id: key, kind, deletedAt: null, ...(version === 0 ? { $or: [{ version: 0 }, { version: { $exists: false } }] } : { version }) }, { $set: { ...fields, ...(slugs ? { slugs } : {}), updatedAt: now }, $inc: { version: 1 } }, { returnDocument: "after" })
      if (!result) throw new CmsError(409, "다른 편집에서 먼저 수정했습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.")
      return contentItem(result)
    }
    const document: ContentDocument = { _id: `${kind}:${randomUUID()}`, kind, data, ...(kind === "notes" ? { slugs: [String(data.slug)] } : {}), version: 1, createdAt: now, updatedAt: now }
    await collection.insertOne(document)
    return contentItem(document)
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new CmsError(409, "이미 사용 중인 글 주소 또는 배포 주소입니다. 다른 주소를 사용해 주세요.")
    throw error
  }
}
export const getPortfolioContent = cache(async (): Promise<PortfolioContent> => {
  const base = { categories: navigationDefaults.map((category, order) => ({ ...category, order })), projects: [], skills: [], journey: [], notes: [], about: {} as PortfolioContent["about"], contact: {} as PortfolioContent["contact"], status: "unavailable" as const }
  try {
    const db = await cmsDatabase()
    const [projects, documents] = await Promise.all([
      db.collection("projects").find({ visibility: "public", deletedAt: null }, { maxTimeMS: 5000 }).sort({ order: 1, id: 1 }).limit(1000).toArray(),
      db.collection<ContentDocument>("portfolio_content").find({ deletedAt: null, $or: [{ kind: { $in: ["about", "contact", "categories"] } }, { kind: { $in: ["skills", "journey", "notes"] }, "data.visibility": "public" }] }, { maxTimeMS: 5000 }).sort({ "data.order": 1, _id: 1 }).limit(3000).toArray(),
    ])
    const valid = documents.flatMap(document => { const parsed = parseCmsValues(document.kind, toFormValues(document.kind, document.data)); return parsed.valid ? [{ ...document, data: parsed.data }] : [] })
    const categoryDocs = valid.filter(item => item.kind === "categories" && categoryIds.includes(item._id.slice(11) as typeof categoryIds[number]))
    const categories = categoryDocs.length === 6 ? categoryDocs.map(item => ({ ...item.data, id: item._id.slice(11) } as Category & { order: number })).sort((a,b) => a.order-b.order || categoryIds.indexOf(a.id)-categoryIds.indexOf(b.id)) : base.categories
    const publicProjects = projects.map(projectFromDocument).filter((item): item is Project => !!item)
    const visibleIds = new Set(publicProjects.map(project => project.id))
    const items = (kind: CmsKind) => valid.filter(item => item.kind === kind).map(item => ({ ...item.data, id: item._id.slice(kind.length+1) }))
    const skills = items("skills").map(item => ({ ...item, projectIds: ((item as Record<string, unknown>).projectIds as number[]).filter(id => visibleIds.has(id)) }))
    return { categories, projects: publicProjects, skills, journey: items("journey"), notes: items("notes"), about: valid.find(item => item.kind === "about")?.data ?? {}, contact: valid.find(item => item.kind === "contact")?.data ?? {}, status: categoryDocs.length === 6 ? "ready" : "empty" } as PortfolioContent
  } catch { return base }
})
export async function findPublicNote(slug: string, includePrivate = false) {
  const db = await cmsDatabase()
  const row = await db.collection<ContentDocument>("portfolio_content").findOne({ kind: "notes", slugs: slug, deletedAt: null, ...(!includePrivate ? { "data.visibility": "public" } : {}) }, { maxTimeMS: 5000 })
  if (!row) return null
  const parsed = parseCmsValues("notes", toFormValues("notes", row.data))
  return parsed.valid ? { ...parsed.data, key: row._id, version: row.version ?? 0 } as unknown as PortfolioContent["notes"][number] & { key: string; version: number } : null
}
export async function findProject(id: string, includePrivate = false) {
  if (!/^(?:[1-9]\d*|experiment-\d{2})$/.test(id)) return null
  const db = await cmsDatabase()
  const row = await db.collection("projects").findOne({ deletedAt: null, ...(id.startsWith("experiment-") ? { routeId: id } : { id: Number(id) }), ...(!includePrivate ? { visibility: "public" } : {}) }, { maxTimeMS: 5000 })
  return row ? projectFromDocument(row) : null
}
