import { adminError, assertSameOrigin, readAdminJson } from "@/lib/admin/session.server"
import { changeLounge, loungeDetail } from "@/lib/lounge/repository.server"
export const runtime = "nodejs"
const headers = { "Cache-Control": "no-store", Vary: "Cookie" }
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) {
  try { return Response.json(await loungeDetail((await context.params).id, new URL(request.url).searchParams), { headers }) } catch (error) { return adminError(error) }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request)
    const values = await readAdminJson(request)
    return Response.json(await changeLounge((await context.params).id, values, values.action === "restore" ? "restore" : "edit"), { headers })
  } catch (error) { return adminError(error) }
}
export async function DELETE(request: Request, context: Context) {
  try { assertSameOrigin(request); return Response.json(await changeLounge((await context.params).id, await readAdminJson(request), "delete"), { headers }) } catch (error) { return adminError(error) }
}
