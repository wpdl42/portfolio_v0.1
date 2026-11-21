import "server-only"
import { createHash } from "node:crypto"
import { ObjectId, type ClientSession, type Filter } from "mongodb"
import { cmsDatabase, CmsError } from "@/lib/cms/repository.server"
import { connectPortfolioMongo } from "@/lib/mongodb.server"
import { readGuestIdentity, limitGuestPosting, type GuestIdentity } from "@/lib/guestbook.server"
import { messageError } from "@/lib/guestbook"
import { ensureLoungeIndexes } from "./indexes.mjs"
import { loungeTitleError, type LoungeDetail, type LoungeThread, type LoungeMessage, type LoungeScope } from "./types"

type Author = { userId: string; nickname: string; isOwner: boolean }
type StoredThread = Author & { _id: ObjectId; title: string; isSecret: boolean; createdAt: Date; updatedAt: Date; deletedAt: Date | null; version: number; requestKey?: string; submissionHash?: string }
type StoredMessage = Author & { _id: ObjectId; threadId: ObjectId; body: string; createdAt: Date; updatedAt: Date; deletedAt: Date | null; version: number; requestKey?: string; submissionHash?: string }
let indexes: Promise<unknown> | undefined
async function database() {
  const db = await cmsDatabase()
  if (!indexes) indexes = ensureLoungeIndexes(db).catch(error => { indexes = undefined; throw error })
  await indexes
  return db
}
async function transaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
  const connection = connectPortfolioMongo()
  if (!connection) throw new CmsError(503, "MongoDB 연결 설정이 필요합니다.")
  const session = (await connection).startSession()
  try { return await session.withTransaction(() => operation(session), { maxCommitTimeMS: 5000 }) }
  finally { await session.endSession() }
}
function objectId(value: string) {
  if (!/^[a-f\d]{24}$/i.test(value)) throw new CmsError(404, "이야기를 찾을 수 없습니다.")
  return new ObjectId(value)
}
function fields(values: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(values).some(key => !allowed.includes(key))) throw new CmsError(422, "수정할 수 없는 항목이 포함되어 있습니다.")
}
function requestKey(values: Record<string, unknown>, identity: GuestIdentity, thread = "new") {
  if (typeof values.requestId !== "string" || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(values.requestId)) throw new CmsError(422, "저장 요청 번호가 필요합니다. 다시 시도해 주세요.")
  return `${identity.userId}:${thread}:${values.requestId}`
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const manages = (row: Author, identity: GuestIdentity | null) => !!identity && (identity.isOwner || row.userId === identity.userId)
const access = (identity: GuestIdentity | null): Filter<StoredThread> => identity?.isOwner ? {} : { $or: [{ isSecret: false }, ...(identity ? [{ userId: identity.userId }] : [])] }
const author = (identity: GuestIdentity): Author => ({ userId: identity.userId, nickname: identity.nickname, isOwner: identity.isOwner })
const notFound = () => new CmsError(404, "이야기를 찾을 수 없거나 읽을 권한이 없습니다.")
async function requireIdentity() {
  const identity = await readGuestIdentity()
  if (!identity) throw new CmsError(401, "로그인이 필요하거나 로그인 시간이 만료되었습니다. 다시 로그인해 주세요.")
  return identity
}
function checkVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new CmsError(422, "최신 글 버전이 필요합니다.")
  return Number(value)
}
async function allowedThread(id: string, identity: GuestIdentity | null, session?: ClientSession, includeDeleted = false) {
  const row = await (await database()).collection<StoredThread>("lounge_threads").findOne({ _id: objectId(id), ...access(identity), ...(!includeDeleted ? { deletedAt: null } : {}) }, { session, maxTimeMS: 5000 })
  if (!row || (row.deletedAt && !manages(row, identity))) throw notFound()
  return row
}
async function summary(row: StoredThread, identity: GuestIdentity | null): Promise<LoungeThread> {
  const messages = (await database()).collection<StoredMessage>("lounge_messages")
  const last = await messages.find({ threadId: row._id, deletedAt: null }, { projection: { isOwner: 1, createdAt: 1 }, maxTimeMS: 5000 }).sort({ createdAt: -1, _id: -1 }).limit(1).next()
  // An administrator's initial post is still a new story, not an answer.
  const preceding = last?.isOwner ? await messages.findOne({ threadId: row._id, $or: [{ createdAt: { $lt: last.createdAt } }, { createdAt: last.createdAt, _id: { $lt: last._id } }] }, { projection: { _id: 1 }, maxTimeMS: 5000 }) : null
  return { id: row._id.toHexString(), title: row.title, nickname: row.nickname, isOwner: row.isOwner, isSecret: row.isSecret, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), deletedAt: row.deletedAt?.toISOString() ?? null, version: row.version, status: last?.isOwner && preceding ? "answered" : "waiting", canManage: manages(row, identity), canReply: !row.deletedAt && manages(row, identity) }
}
const publicMessage = (row: StoredMessage, identity: GuestIdentity | null): LoungeMessage => ({ id: row._id.toHexString(), nickname: row.nickname, isOwner: row.isOwner, body: row.body, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), deletedAt: row.deletedAt?.toISOString() ?? null, version: row.version, canManage: manages(row, identity) })

export async function listLounge(params: URLSearchParams) {
  const scope = (params.get("scope") ?? "public") as LoungeScope
  if (!["public", "mine", "all", "trash"].includes(scope)) throw new CmsError(400, "올바른 목록을 선택해 주세요.")
  const identity = await readGuestIdentity()
  if (scope !== "public" && !identity) throw new CmsError(401, "내 글을 확인하려면 로그인해 주세요.")
  if (scope === "all" && !identity?.isOwner) throw new CmsError(403, "관리자만 전체 글을 확인할 수 있습니다.")
  const before = params.get("before"), query = params.get("q")?.trim() ?? ""
  if (query.length > 80) throw new CmsError(422, "검색어는 80자 이하로 입력해 주세요.")
  const filter: Filter<StoredThread> = {
    ...(scope === "public" ? { isSecret: false } : scope === "mine" || scope === "trash" && !identity?.isOwner ? { userId: identity!.userId } : {}),
    deletedAt: scope === "trash" ? { $type: "date" } : null,
    ...(before ? { _id: { $lt: objectId(before) } } : {}),
    ...(query ? { title: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } } : {}),
  }
  const rows = await (await database()).collection<StoredThread>("lounge_threads").find(filter, { maxTimeMS: 5000 }).sort({ _id: -1 }).limit(21).toArray()
  const threads = await Promise.all(rows.slice(0, 20).map(row => summary(row, identity)))
  return { threads, nextCursor: rows.length > 20 ? threads.at(-1)!.id : null }
}

export async function loungeDetail(id: string, params = new URLSearchParams()): Promise<LoungeDetail> {
  const identity = await readGuestIdentity()
  const row = await allowedThread(id, identity)
  const deleted = params.get("messages") === "trash"
  if (deleted && !manages(row, identity)) throw notFound()
  const before = params.get("before")
  const messages = (await database()).collection<StoredMessage>("lounge_messages")
  const marker = before ? await messages.findOne({ _id: objectId(before), threadId: row._id }, { projection: { createdAt: 1 } }) : null
  if (before && !marker) throw notFound()
  const filter: Filter<StoredMessage> = { threadId: row._id, deletedAt: deleted ? { $type: "date" } : null, ...(marker ? { $or: [{ createdAt: { $lt: marker.createdAt } }, { createdAt: marker.createdAt, _id: { $lt: marker._id } }] } : {}), ...(deleted && !identity?.isOwner ? { userId: identity!.userId } : {}) }
  const rows = await messages.find(filter, { maxTimeMS: 5000 }).sort({ createdAt: -1, _id: -1 }).limit(51).toArray()
  return { thread: await summary(row, identity), messages: rows.slice(0, 50).reverse().map(message => publicMessage(message, identity)), previousCursor: rows.length > 50 ? rows[49]._id.toHexString() : null }
}

export async function createLounge(request: Request, values: Record<string, unknown>) {
  const identity = await requireIdentity()
  fields(values, ["title", "body", "isSecret", "requestId"])
  const title = typeof values.title === "string" ? values.title.trim() : "", body = typeof values.body === "string" ? values.body.trim() : ""
  const invalid = loungeTitleError(title) || messageError(body)
  if (invalid || typeof values.isSecret !== "boolean") throw new CmsError(422, invalid || "비밀글 여부를 확인해 주세요.")
  const key = requestKey(values, identity), submissionHash = hash({ title, body, isSecret: values.isSecret })
  const db = await database(), threads = db.collection<StoredThread>("lounge_threads")
  async function existing() {
    const row = await threads.findOne({ requestKey: key })
    if (!row) return null
    if (row.submissionHash !== submissionHash || row.deletedAt) throw new CmsError(409, "같은 저장 요청의 내용이 변경되었습니다. 새로 작성해 주세요.")
    return row._id.toHexString()
  }
  let id = await existing()
  if (!id) {
    await limitGuestPosting(request, identity)
    const now = new Date(), threadId = new ObjectId()
    try {
      await transaction(async session => {
        await threads.insertOne({ _id: threadId, ...author(identity), title, isSecret: values.isSecret as boolean, createdAt: now, updatedAt: now, deletedAt: null, version: 1, requestKey: key, submissionHash }, { session })
        await db.collection<StoredMessage>("lounge_messages").insertOne({ _id: new ObjectId(), threadId, ...author(identity), body, createdAt: now, updatedAt: now, deletedAt: null, version: 1 }, { session })
      })
      id = threadId.toHexString()
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error
      id = await existing()
      if (!id) throw error
    }
  }
  return loungeDetail(id)
}

export async function replyLounge(request: Request, id: string, values: Record<string, unknown>) {
  const identity = await requireIdentity()
  const row = await allowedThread(id, identity)
  if (!manages(row, identity)) throw new CmsError(403, "작성자와 관리자만 답글을 남길 수 있습니다.")
  fields(values, ["body", "requestId"])
  const body = typeof values.body === "string" ? values.body.trim() : ""
  const invalid = messageError(body)
  if (invalid) throw new CmsError(422, invalid)
  const key = requestKey(values, identity, row._id.toHexString()), submissionHash = hash(body), db = await database()
  const messages = db.collection<StoredMessage>("lounge_messages")
  async function existing() {
    const message = await messages.findOne({ requestKey: key })
    if (!message) return false
    if (message.submissionHash !== submissionHash || message.deletedAt) throw new CmsError(409, "같은 전송 요청의 내용이 변경되었습니다.")
    return true
  }
  if (!await existing()) {
    await limitGuestPosting(request, identity)
    try {
      await transaction(async session => {
        const topic = await allowedThread(id, identity, session)
        if (!manages(topic, identity)) throw notFound()
        const now = new Date()
        await db.collection<StoredThread>("lounge_threads").updateOne({ _id: topic._id }, { $inc: { version: 1 }, $set: { updatedAt: now } }, { session })
        await messages.insertOne({ _id: new ObjectId(), threadId: topic._id, ...author(identity), body, createdAt: now, updatedAt: now, deletedAt: null, version: 1, requestKey: key, submissionHash }, { session })
      })
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000 && await existing())) throw error
    }
  }
  return loungeDetail(id)
}

export async function changeLounge(id: string, values: Record<string, unknown>, action: "edit" | "delete" | "restore") {
  const identity = await requireIdentity(), db = await database()
  fields(values, action === "edit" ? ["title", "version"] : ["action", "version"])
  const row = await allowedThread(id, identity, undefined, true)
  if (!manages(row, identity)) throw new CmsError(403, "작성자와 관리자만 변경할 수 있습니다.")
  const version = checkVersion(values.version)
  if (action !== "edit" && !!row.deletedAt === (action === "delete")) return { id }
  if (row.version !== version) throw new CmsError(409, "이야기가 변경되었습니다. 최신 내용을 불러온 뒤 다시 시도해 주세요.")
  const title = typeof values.title === "string" ? values.title.trim() : ""
  if (action === "edit" && (row.deletedAt || loungeTitleError(title))) throw new CmsError(422, row.deletedAt ? "복원한 뒤 수정해 주세요." : loungeTitleError(title)!)
  const now = new Date()
  const result = await db.collection<StoredThread>("lounge_threads").updateOne({ _id: row._id, version }, { $set: { ...(action === "edit" ? { title } : { deletedAt: action === "delete" ? now : null }), updatedAt: now }, $inc: { version: 1 } })
  if (!result.modifiedCount) throw new CmsError(409, "이야기가 변경되었습니다. 다시 불러와 주세요.")
  return { id }
}

export async function changeLoungeMessage(id: string, messageId: string, values: Record<string, unknown>, action: "edit" | "delete" | "restore") {
  const identity = await requireIdentity(), db = await database()
  fields(values, action === "edit" ? ["body", "version"] : ["action", "version"])
  const version = checkVersion(values.version)
  await transaction(async session => {
    const topic = await allowedThread(id, identity, session)
    const message = await db.collection<StoredMessage>("lounge_messages").findOne({ _id: objectId(messageId), threadId: topic._id }, { session })
    if (!message) throw notFound()
    if (!manages(message, identity)) throw new CmsError(403, "본인 메시지와 관리자만 변경할 수 있습니다.")
    if (action !== "edit" && !!message.deletedAt === (action === "delete")) return
    if (message.version !== version) throw new CmsError(409, "메시지가 변경되었습니다. 다시 불러와 주세요.")
    const body = typeof values.body === "string" ? values.body.trim() : ""
    if (action === "edit" && (message.deletedAt || messageError(body))) throw new CmsError(422, message.deletedAt ? "복원한 뒤 수정해 주세요." : messageError(body)!)
    const now = new Date()
    await db.collection<StoredMessage>("lounge_messages").updateOne({ _id: message._id, version }, { $set: { ...(action === "edit" ? { body } : { deletedAt: action === "delete" ? now : null }), updatedAt: now }, $inc: { version: 1 } }, { session })
    await db.collection<StoredThread>("lounge_threads").updateOne({ _id: topic._id }, { $inc: { version: 1 }, $set: { updatedAt: now } }, { session })
  })
  return { id }
}
