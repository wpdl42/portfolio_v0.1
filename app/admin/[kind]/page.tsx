import { notFound, redirect } from "next/navigation"
import { readAdminSession } from "@/lib/admin/session.server"
import { isCmsKind, cmsLabels } from "@/lib/cms/schema"
import { listAdminContent } from "@/lib/cms/repository.server"
import { CmsManager } from "@/components/CmsManager"
export const metadata = { title: "콘텐츠 관리", robots: { index: false, follow: false } }
export default async function ContentAdminPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  if (!isCmsKind(kind)) notFound()
  const session = await readAdminSession()
  if (!session) redirect(`/admin/login?returnTo=/admin/${kind}`)
  const items = await listAdminContent(kind)
  return <CmsManager key={cmsLabels[kind]} kind={kind} initialItems={items} expiresAt={session.expiresAt} />
}
