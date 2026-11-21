import { adminError, assertSameOrigin, readAdminJson } from "@/lib/admin/session.server"
import { createLounge, listLounge } from "@/lib/lounge/repository.server"

export const runtime = "nodejs"
const headers = { "Cache-Control": "no-store", Vary: "Cookie" }
export async function GET(request: Request) {
  try { return Response.json(await listLounge(new URL(request.url).searchParams), { headers }) } catch (error) { return adminError(error) }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    return Response.json(await createLounge(request, await readAdminJson(request)), { status: 201, headers })
  } catch (error) { return adminError(error) }
}
