import Link from "next/link"
import { ThemeToggle } from "./ThemeToggle"

const menus = [
  { href: "/", label: "소개" },
  { href: "/projects", label: "프로젝트" },
  { href: "/assignments", label: "과제" },
  { href: "/progress", label: "성장 기록" },
]

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="wordmark" aria-label="홈으로 이동">
          JUMIN<span>.</span>
        </Link>

        <nav className="main-nav" aria-label="주요 메뉴">
          {menus.map((menu) => (
            <Link key={menu.href} href={menu.href}>
              {menu.label}
            </Link>
          ))}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  )
}

