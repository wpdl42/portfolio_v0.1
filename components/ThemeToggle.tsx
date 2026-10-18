"use client"

import { useEffect, useSyncExternalStore } from "react"

function subscribeToTheme(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener("portfolio-theme-change", onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener("portfolio-theme-change", onChange)
  }
}

function getStoredTheme() {
  return localStorage.getItem("portfolio-theme") === "dark"
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribeToTheme, getStoredTheme, () => false)

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light"
  }, [isDark])

  function toggleTheme() {
    const nextTheme = isDark ? "light" : "dark"
    localStorage.setItem("portfolio-theme", nextTheme)
    window.dispatchEvent(new Event("portfolio-theme-change"))
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

