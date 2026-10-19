import "server-only"
import { canDeleteCmsKind, deletableCmsKinds, type CmsKind } from "./schema"
import { cmsDatabase, CmsError, listAdminContent } from "./repository.server"
import type { CmsTrashItem } from "./types"
import type { Document, ObjectId } from "mongodb"

export async function listCmsTrash(): Promise<CmsTrashItem[]> {
  const rows = await Promise.all(deletableCmsKinds.map(async kind => (await listAdminContent(kind, true)).map(item => ({ ...item, kind }))))
  return rows.flat().sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)))
}

export async function setCmsDeleted(kind: CmsKind, key: unknown, version: unknown, deleted: boolean) {
  if (!canDeleteCmsKind(kind)) throw new CmsError(400, "기본 문서와 위성 카테고리는 삭제할 수 없습니다.")
  if (typeof key !== "string" || key.length > 180 || !key || (kind === "projects" ? !/^[1-9]\d*$/.test(key) || !Number.isSafeInteger(Number(key)) : !key.startsWith(`${kind}:`))) throw new CmsError(400, "올바른 항목 ID가 필요합니다.")
  if (!Number.isSafeInteger(version) || Number(version) < 0) throw new CmsError(400, "항목 버전을 확인해 주세요.")
  const db = await cmsDatabase(), collection = db.collection<Document & { _id: string | ObjectId }>(kind === "projects" ? "projects" : "portfolio_content")
  const identity = kind === "projects" ? { id: Number(key) } : { _id: key, kind }
  const existing = await collection.findOne(identity, { maxTimeMS: 5000 })
  if (!existing) throw new CmsError(404, "항목을 찾을 수 없습니다.")
  // Retries are harmless; neither duplicate deletion nor restore changes the contents.
  if (!!existing.deletedAt === deleted) return { key, alreadyApplied: true }
  const now = new Date()
  const result = await collection.updateOne({ ...identity, deletedAt: deleted ? null : { $type: "date" }, ...(version === 0 ? { $or: [{ version: 0 }, { version: { $exists: false } }] } : { version: Number(version) }) }, { $set: { deletedAt: deleted ? now : null, updatedAt: now }, $inc: { version: 1 } })
  if (!result.modifiedCount) throw new CmsError(409, "항목이 변경되었습니다. 최신 목록을 불러온 뒤 다시 시도해 주세요.")
  return { key, alreadyApplied: false }
}
