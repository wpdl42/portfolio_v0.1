import { redirect } from "next/navigation"
import { readAdminSession } from "@/lib/admin/session.server"
import { listCmsTrash } from "@/lib/cms/trash.server"
import { CmsTrash } from "@/components/CmsTrash"
export const metadata = { title: "관리자 휴지통", robots: { index: false, follow: false } }
export default async function TrashPage() {
  if (!await readAdminSession()) redirect("/admin/login?returnTo=/admin/trash")
  return <CmsTrash initialItems={await listCmsTrash()} />
}
