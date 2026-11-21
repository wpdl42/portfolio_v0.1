import { adminError, assertSameOrigin, readAdminJson } from "@/lib/admin/session.server"
import { loginGuest, logoutGuest, readGuestViewer } from "@/lib/guestbook.server"

export const runtime = "nodejs"
const headers = { "Cache-Control": "no-store" }
export async function GET() {
  try { return Response.json({ viewer: await readGuestViewer() }, { headers }) } catch (error) { return adminError(error) }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    return Response.json(await loginGuest(request, await readAdminJson(request)), { headers })
  } catch (error) { return adminError(error) }
}
export async function DELETE(request: Request) {
  try { assertSameOrigin(request); await logoutGuest(); return Response.json({ ok: true }, { headers }) } catch (error) { return adminError(error) }
}
