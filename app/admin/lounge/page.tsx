import { redirect } from "next/navigation"
import { readAdminSession } from "@/lib/admin/session.server"

export const metadata = { title: "Lounge 관리", robots: { index: false, follow: false } }
export default async function LoungeAdminPage() {
  if (!await readAdminSession()) redirect("/admin/login?returnTo=/admin/lounge")
  redirect("/?category=contact&scope=all")
}
