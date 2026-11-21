import { adminError, assertSameOrigin, readAdminJson } from "@/lib/admin/session.server"
import { changeLoungeMessage } from "@/lib/lounge/repository.server"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string; messageId: string }> }
const headers = { "Cache-Control": "no-store", Vary: "Cookie" }
export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request)
    const { id, messageId } = await context.params, values = await readAdminJson(request)
    return Response.json(await changeLoungeMessage(id, messageId, values, values.action === "restore" ? "restore" : "edit"), { headers })
  } catch (error) { return adminError(error) }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request)
    const { id, messageId } = await context.params
    return Response.json(await changeLoungeMessage(id, messageId, await readAdminJson(request), "delete"), { headers })
  } catch (error) { return adminError(error) }
}
