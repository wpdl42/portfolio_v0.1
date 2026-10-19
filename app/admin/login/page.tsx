import { redirect } from "next/navigation"
import { AdminLogin } from "@/components/AdminLogin"
import { adminConfigured, readAdminSession } from "@/lib/admin/session.server"
export const metadata = { title: "관리자 로그인", robots: { index: false, follow: false } }
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnTo = (await searchParams).returnTo
  const target = returnTo && /^\/admin\/(?:projects|skills|journey|notes|about|contact|categories)$/.test(returnTo) ? returnTo : "/admin/projects"
  if (await readAdminSession()) redirect(target)
  return <AdminLogin configured={adminConfigured()} returnTo={target} />
}
