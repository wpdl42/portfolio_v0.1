import { adminError, assertSameOrigin, readAdminJson } from "@/lib/admin/session.server"
import { replyLounge } from "@/lib/lounge/repository.server"
export const runtime = "nodejs"
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request)
    return Response.json(await replyLounge(request, (await context.params).id, await readAdminJson(request)), { status: 201, headers: { "Cache-Control": "no-store", Vary: "Cookie" } })
  } catch (error) { return adminError(error) }
}
