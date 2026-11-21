import "server-only"
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { readAdminSession } from "@/lib/admin/session.server"
import { cmsDatabase, CmsError, getPortfolioContent } from "@/lib/cms/repository.server"
import { credentialError, normalizeNickname, type GuestbookViewer } from "@/lib/guestbook"

type GuestUser = { _id: string; nickname: string; nicknameKey: string; passwordHash: string; salt: string; hashVersion: 1; createdAt: Date }
type GuestSession = { _id: string; userId: string; createdAt: Date; expiresAt: Date }
export type GuestIdentity = GuestbookViewer & { userId: string }
export const guestCookieName = process.env.NODE_ENV === "production" ? "__Host-portfolio-guest" : "portfolio-guest"
const sessionSeconds = 7 * 24 * 60 * 60
const digest = (value: string) => createHash("sha256").update(value).digest("hex")
let indexes: Promise<unknown> | undefined

async function database() {
  const db = await cmsDatabase()
  if (!indexes) indexes = Promise.all([
    db.collection("guestbook_users").createIndex({ nicknameKey: 1 }, { unique: true, name: "guestbook_unique_nickname" }),
    db.collection("guestbook_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "guestbook_session_ttl" }),
    db.collection("guestbook_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "guestbook_limit_ttl" }),
  ]).catch(error => { indexes = undefined; throw error })
  await indexes
  return db
}

export async function limitGuestbook(key: string, maximum: number, windowMs: number) {
  const db = await database()
  const window = Math.floor(Date.now() / windowMs)
  const entry = await db.collection<{ _id: string; count: number; expiresAt: Date }>("guestbook_limits").findOneAndUpdate(
    { _id: `${key}:${window}` },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 2) * windowMs) } },
    { upsert: true, returnDocument: "after" },
  )
  if (!entry || entry.count > maximum) throw new CmsError(429, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.")
}

const peerKey = (request: Request) => digest((request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 200))
function passwordHash(password: string, salt: string): Promise<Buffer> {
  // OWASP's scrypt N=2^15, r=8, p=3 profile; persist only a salted hash.
  // https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)))
}
const wrongPassword = () => new CmsError(401, "비밀번호가 틀렸습니다. 사용 중인 닉네임입니다.")
async function verifyPassword(user: GuestUser, password: string) {
  const expected = Buffer.from(user.passwordHash, "hex")
  const actual = await passwordHash(password, user.salt)
  if (user.hashVersion !== 1 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw wrongPassword()
}

export async function loginGuest(request: Request, values: Record<string, unknown>) {
  const nickname = typeof values.nickname === "string" ? normalizeNickname(values.nickname) : ""
  const password = typeof values.password === "string" ? values.password : ""
  const invalid = credentialError(nickname, password)
  if (invalid) throw new CmsError(422, invalid)
  const nicknameKey = nickname.toLowerCase()
  await Promise.all([
    limitGuestbook(`login:nickname:${digest(nicknameKey)}`, 10, 300000),
    limitGuestbook(`login:peer:${peerKey(request)}`, 30, 300000),
    limitGuestbook("login:global", 150, 300000),
  ])
  const db = await database()
  const users = db.collection<GuestUser>("guestbook_users")
  let user = await users.findOne({ nicknameKey })
  let registered = false
  if (user) await verifyPassword(user, password)
  else {
    const salt = randomBytes(16).toString("hex")
    const candidate: GuestUser = { _id: randomUUID(), nickname, nicknameKey, salt, passwordHash: (await passwordHash(password, salt)).toString("hex"), hashVersion: 1, createdAt: new Date() }
    try {
      await users.insertOne(candidate)
      user = candidate
      registered = true
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error
      // Concurrent sign-ups must authenticate the winning account, never overwrite it.
      user = await users.findOne({ nicknameKey })
      if (!user) throw new CmsError(409, "닉네임 등록 상태가 변경되었습니다. 다시 시도해 주세요.")
      await verifyPassword(user, password)
    }
  }
  const store = await cookies()
  const previous = store.get(guestCookieName)?.value
  if (previous && /^[\w-]{43}$/.test(previous)) await db.collection<GuestSession>("guestbook_sessions").deleteOne({ _id: digest(previous) })
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000)
  await db.collection<GuestSession>("guestbook_sessions").insertOne({ _id: digest(token), userId: user._id, createdAt: new Date(), expiresAt })
  store.set(guestCookieName, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: sessionSeconds, expires: expiresAt })
  return { viewer: { nickname: user.nickname, isOwner: false, expiresAt: expiresAt.toISOString() } satisfies GuestbookViewer, registered }
}

export async function readGuestIdentity(): Promise<GuestIdentity | null> {
  const admin = await readAdminSession()
  if (admin) return { userId: "portfolio-owner", nickname: (await getPortfolioContent()).about.name || "운영자", isOwner: true, expiresAt: admin.expiresAt }
  const token = (await cookies()).get(guestCookieName)?.value
  if (!token || !/^[\w-]{43}$/.test(token)) return null
  const db = await database()
  const session = await db.collection<GuestSession>("guestbook_sessions").findOne({ _id: digest(token), expiresAt: { $gt: new Date() } })
  if (!session) return null
  const user = await db.collection<GuestUser>("guestbook_users").findOne({ _id: session.userId })
  return user ? { userId: user._id, nickname: user.nickname, isOwner: false, expiresAt: session.expiresAt.toISOString() } : null
}

export async function readGuestViewer(): Promise<GuestbookViewer | null> {
  const identity = await readGuestIdentity()
  return identity ? { nickname: identity.nickname, isOwner: identity.isOwner, expiresAt: identity.expiresAt } : null
}

export async function logoutGuest() {
  const store = await cookies(), token = store.get(guestCookieName)?.value
  if (token && /^[\w-]{43}$/.test(token)) await (await database()).collection<GuestSession>("guestbook_sessions").deleteOne({ _id: digest(token) })
  store.set(guestCookieName, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 })
}

export async function limitGuestPosting(request: Request, identity: GuestIdentity) {
  await Promise.all([limitGuestbook(`post:user:${identity.userId}`, 10, 60000), limitGuestbook(`post:peer:${peerKey(request)}`, 30, 60000), limitGuestbook("post:global", 100, 60000)])
}
