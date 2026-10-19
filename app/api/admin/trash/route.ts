import { adminError, requireAdmin } from "@/lib/admin/session.server"
import { listCmsTrash } from "@/lib/cms/trash.server"
export const runtime = "nodejs"
export async function GET() {
  try { await requireAdmin(); return Response.json({ items: await listCmsTrash() }, { headers: { "Cache-Control": "no-store" } }) }
  catch (error) { return adminError(error) }
}
