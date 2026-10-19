import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import "./globals.css"
import "./orb.css"
import "./project-editor.css"
import "./cms.css"

export const metadata: Metadata = {
  title: {
    default: "Jang Jumin | Portfolio",
    template: "%s | Jang Jumin",
  },
  description: "정보보호학과 학생 장주민의 학습 및 프로젝트 포트폴리오",
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f8f6f3" }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}

