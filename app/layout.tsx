import type { Metadata } from "next"
import type { ReactNode } from "react"
import { SiteFooter } from "@/components/SiteFooter"
import { SiteHeader } from "@/components/SiteHeader"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Jang Jumin | Portfolio",
    template: "%s | Jang Jumin",
  },
  description: "정보보호학과 학생 장주민의 학습 및 프로젝트 포트폴리오",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}

