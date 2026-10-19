import { adminError, assertSameOrigin, readAdminJson, requireAdmin } from "@/lib/admin/session.server"
import { CmsError, listAdminContent, saveCmsContent } from "@/lib/cms/repository.server"
import { isCmsKind } from "@/lib/cms/schema"
import { revalidatePath } from "next/cache"
import { changeDeletion } from "@/lib/cms/trash-route.server"
export const runtime = "nodejs"
type Context = { params: Promise<{ kind: string }> }
export async function GET(_request: Request, context: Context) {
  try { await requireAdmin(); const { kind } = await context.params; if (!isCmsKind(kind)) throw new CmsError(404, "편집 항목을 찾을 수 없습니다."); return Response.json({ items: await listAdminContent(kind) }, { headers: { "Cache-Control": "no-store" } }) } catch (error) { return adminError(error) }
}
async function save(request: Request, context: Context, updating: boolean) {
  try {
    assertSameOrigin(request); await requireAdmin()
    const { kind } = await context.params
    if (!isCmsKind(kind)) throw new CmsError(404, "편집 항목을 찾을 수 없습니다.")
    const body = await readAdminJson(request)
    if (Object.keys(body).some(key => !["values", "key", "version"].includes(key))) throw new CmsError(400, "지원하지 않는 요청 항목입니다.")
    if (updating && (typeof body.key !== "string" || !body.key.length || body.key.length > 180) || !updating && (body.key !== undefined || body.version !== undefined)) throw new CmsError(400, "수정 대상과 버전을 확인해 주세요.")
    const item = await saveCmsContent(kind, body.values, updating ? body.key as string : undefined, updating ? body.version as number : undefined)
    revalidatePath("/", "layout")
    return Response.json({ item }, { status: updating ? 200 : 201, headers: { "Cache-Control": "no-store" } })
  } catch (error) { return adminError(error) }
}
export async function POST(request: Request, context: Context) { return save(request, context, false) }
export async function PATCH(request: Request, context: Context) { return save(request, context, true) }
export async function DELETE(request: Request, context: Context) { return changeDeletion(request, context.params, true) }
