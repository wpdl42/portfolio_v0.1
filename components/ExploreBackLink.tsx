"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

export function ExploreBackLink({ category }: { category: "projects" | "notes" }) {
  const router = useRouter()
  const fallback = `/?category=${category}&view=expanded`
  return <Link className="orb-detail-back" href={fallback} onClick={event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    try {
      const saved = JSON.parse(sessionStorage.getItem("orb-explore-return") ?? "null")
      if (saved?.category === category && typeof saved.url === "string" && saved.url.startsWith("/?")) {
        event.preventDefault()
        router.push(saved.url)
      }
    } catch { /* A normal category link remains available when storage is unavailable. */ }
  }}>← <span>Back to {category === "projects" ? "Projects" : "Notes"}</span></Link>
}
