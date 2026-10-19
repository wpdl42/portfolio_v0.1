import "server-only"
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { cmsDatabase, CmsError } from "@/lib/cms/repository.server"

export const adminCookieName = process.env.NODE_ENV === "production" ? "__Host-portfolio-admin" : "portfolio-admin"
type Session = { _id: string; expiresAt: Date; createdAt: Date }
const digest = (value: string) => createHash("sha256").update(value).digest()
export function adminConfigured() { return (process.env.ADMIN_CODE?.length ?? 0) >= 12 && (process.env.ADMIN_SESSION_SECRET?.length ?? 0) >= 32 }
const secret = () => { if (!adminConfigured()) throw new CmsError(503, "서버 관리자 인증 환경변수를 설정해 주세요."); return process.env.ADMIN_SESSION_SECRET! }
const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url")
export function sessionHash(token: string) { return createHmac("sha256", secret()).update(`session:${token}`).digest("hex") }
function validToken(token: string) {
  if (!/^[\w-]{43}\.[\w-]{43}$/.test(token)) return false
  const [id, signature] = token.split(".")
  return timingSafeEqual(digest(signature), digest(sign(id)))
}
export async function readAdminSession() {
  if (!adminConfigured()) return null
  const token = (await cookies()).get(adminCookieName)?.value
  if (!token || !validToken(token)) return null
  try { const db = await cmsDatabase(); const row = await db.collection<Session>("admin_sessions").findOne({ _id: sessionHash(token), expiresAt: { $gt: new Date() } }, { maxTimeMS: 5000 }); return row ? { expiresAt: row.expiresAt.toISOString() } : null } catch { return null }
}
export async function requireAdmin() { const session = await readAdminSession(); if (!session) throw new CmsError(401, "관리자 로그인이 필요하거나 세션이 만료되었습니다."); return session }
export async function createAdminSession(code: string) {
  secret()
  const db = await cmsDatabase()
  const windowMs = 300000, window = Math.floor(Date.now()/windowMs), retryAfter = Math.ceil(((window+1)*windowMs-Date.now())/1000)
  const attempts = db.collection<{ _id: string; count: number; expiresAt: Date }>("admin_attempts")
  await attempts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "admin_attempt_ttl" })
  const attempt = await attempts.findOneAndUpdate({ _id: `code:${window}` }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window+2)*windowMs) } }, { upsert: true, returnDocument: "after" })
  if (!attempt || attempt.count > 10) throw new CmsError(429, `${retryAfter}초 후 다시 시도해 주세요.`)
  if (!timingSafeEqual(digest(code), digest(process.env.ADMIN_CODE!))) throw new CmsError(401, "관리자 코드가 올바르지 않습니다.")
  const duration = Math.min(28800, Math.max(60, Number(process.env.ADMIN_SESSION_TTL_SECONDS) || 28800))
  const id = randomBytes(32).toString("base64url"), token = `${id}.${sign(id)}`, expiresAt = new Date(Date.now()+duration*1000)
  const sessions = db.collection<Session>("admin_sessions")
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "admin_session_ttl" })
  await sessions.insertOne({ _id: sessionHash(token), createdAt: new Date(), expiresAt })
  ;(await cookies()).set(adminCookieName, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: duration, expires: expiresAt })
  return { expiresAt: expiresAt.toISOString() }
}
export async function revokeAdminSession() {
  const store = await cookies(), token = store.get(adminCookieName)?.value
  if (token && adminConfigured() && validToken(token)) { const db = await cmsDatabase(); await db.collection<Session>("admin_sessions").deleteOne({ _id: sessionHash(token) }) }
  store.set(adminCookieName, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 })
}
export function assertSameOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : new URL(request.url).origin
  if (request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new CmsError(403, "허용되지 않은 요청 출처입니다.")
}
export async function readAdminJson(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new CmsError(415, "JSON 요청만 지원합니다.")
  if (Number(request.headers.get("content-length")) > 262144) throw new CmsError(413, "요청이 너무 큽니다.")
  const reader = request.body?.getReader(), chunks: Uint8Array[] = []
  let size = 0
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 262144) { await reader.cancel(); throw new CmsError(413, "요청이 너무 큽니다.") }
      chunks.push(value)
    }
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { const body: unknown = JSON.parse(new TextDecoder().decode(bytes)); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); return body as Record<string, unknown> } catch { throw new CmsError(400, "올바른 JSON 본문이 필요합니다.") }
}
export function adminError(error: unknown) {
  if (error instanceof CmsError) return Response.json({ error: error.message, fields: error.fields }, { status: error.status, headers: { "Cache-Control": "no-store", ...(error.status === 429 ? { "Retry-After": "300" } : {}) } })
  return Response.json({ error: "DB 작업을 완료하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요." }, { status: 503, headers: { "Cache-Control": "no-store" } })
}
