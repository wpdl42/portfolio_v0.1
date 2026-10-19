import "server-only"
import { revalidatePath } from "next/cache"
import { adminError, assertSameOrigin, readAdminJson, requireAdmin } from "@/lib/admin/session.server"
import { CmsError } from "./repository.server"
import { isCmsKind } from "./schema"
import { setCmsDeleted } from "./trash.server"

export async function changeDeletion(request: Request, params: Promise<{ kind: string }>, deleted: boolean) {
  try {
    assertSameOrigin(request)
    await requireAdmin()
    const { kind } = await params
    if (!isCmsKind(kind)) throw new CmsError(404, "항목 종류를 찾을 수 없습니다.")
    const body = await readAdminJson(request)
    if (Object.keys(body).some(key => !["key", "version"].includes(key))) throw new CmsError(400, "지원하지 않는 요청 항목입니다.")
    const result = await setCmsDeleted(kind, body.key, body.version, deleted)
    revalidatePath("/", "layout")
    return Response.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return adminError(error) }
}
