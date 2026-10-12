"use client"

import { useEffect, useState } from "react"

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const savedTheme = localStorage.getItem("portfolio-theme")
    const dark = savedTheme === "dark"
    document.documentElement.dataset.theme = dark ? "dark" : "light"
    setIsDark(dark)
  }, [])

  function toggleTheme() {
    const nextTheme = isDark ? "light" : "dark"
    document.documentElement.dataset.theme = nextTheme
    localStorage.setItem("portfolio-theme", nextTheme)
    setIsDark(!isDark)
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label="화면 테마 전환"
      title="테마 전환"
    >
      {isDark ? "☀" : "◐"}
    </button>
  )
}

