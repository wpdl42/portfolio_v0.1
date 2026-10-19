import { adminError, assertSameOrigin, createAdminSession, readAdminJson, readAdminSession, revokeAdminSession } from "@/lib/admin/session.server"
export const runtime = "nodejs"
export async function GET() { return Response.json({ session: await readAdminSession() }, { headers: { "Cache-Control": "no-store" } }) }
export async function POST(request: Request) {
  try { assertSameOrigin(request); const body = await readAdminJson(request); return Response.json(await createAdminSession(typeof body.code === "string" && body.code.length <= 256 ? body.code : ""), { headers: { "Cache-Control": "no-store" } }) } catch (error) { return adminError(error) }
}
export async function DELETE(request: Request) {
  try { assertSameOrigin(request); await revokeAdminSession(); return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }) } catch (error) { return adminError(error) }
}
