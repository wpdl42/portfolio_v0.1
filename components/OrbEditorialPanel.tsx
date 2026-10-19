"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import type { PortfolioContent } from "@/lib/cms/types"

export function OrbEditorialPanel({ category, open, onClose, content, isAdmin }: { category: "about" | "contact"; open: boolean; onClose: () => void; content: PortfolioContent; isAdmin: boolean }) {
  const contactDetails = content.contact
  const about = content.about
  const rootRef = useRef<HTMLDivElement>(null)
  const [copyStatus, setCopyStatus] = useState("")
  useEffect(() => {
    const bodyOverflow = document.body.style.overflow
    const htmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    return () => { document.body.style.overflow = bodyOverflow; document.documentElement.style.overflow = htmlOverflow }
  }, [])
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [category, open])
  async function copyEmail() {
    if (!contactDetails.email) return
    try { await navigator.clipboard.writeText(contactDetails.email); setCopyStatus("이메일을 복사했습니다.") }
    catch { setCopyStatus("복사하지 못했습니다. 이메일 주소를 선택해 복사해 주세요.") }
  }
  return <div className={`orb-editorial orb-editorial-${category}`} data-open={open} ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="orb-editorial-title" inert={!open} onKeyDown={event => {
    if (event.key !== "Tab") return
    const targets = Array.from(rootRef.current!.querySelectorAll<HTMLElement>('a[href]:not([tabindex="-1"]),button:not(:disabled):not([tabindex="-1"]),[tabindex="0"]'))
    const first = targets[0], last = targets[targets.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement?.tagName === "H1")) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement?.tagName === "H1")) { event.preventDefault(); first?.focus() }
  }}>
    {category === "about" ? <button className="orb-editorial-dim" aria-label="소개 패널 배경 닫기" tabIndex={-1} onClick={onClose} /> : <div className="orb-contact-backdrop" aria-hidden="true" />}
    <button className="orb-editorial-close" aria-label={`${category === "about" ? "소개" : "연락"} 닫기`} onClick={onClose}>×</button>
    {isAdmin && <Link className="cms-edit-link cms-editorial-edit" href={`/admin/${category}`}>편집</Link>}
    <div className="orb-editorial-content">
      {category === "contact" ? <div className="orb-contact-type">
        <p className="orb-editorial-eyebrow">{content.categories.find(item => item.id === "contact")?.label}</p><h1 id="orb-editorial-title" tabIndex={-1}>{contactDetails.heading || "연락처 등록 예정"}</h1>
        <p className="orb-contact-intro">{contactDetails.intro}</p>
        <div className="orb-contact-email">{contactDetails.email ? <><span>{contactDetails.emailLabel}</span><a href={`mailto:${contactDetails.email}`}>{contactDetails.email}</a><button onClick={copyEmail}>이메일 복사</button></> : <p>이메일 <span>등록 예정</span></p>}<span role="status" aria-live="polite">{copyStatus}</span></div>
        <nav aria-label="외부 연락 링크">{contactDetails.github && <a href={contactDetails.github} target="_blank" rel="noreferrer">{contactDetails.githubLabel || "GitHub"} <span>새 탭 ↗</span></a>}{contactDetails.blog && <a href={contactDetails.blog} target="_blank" rel="noreferrer">{contactDetails.blogLabel || "Blog"} <span>새 탭 ↗</span></a>}{(contactDetails.links ?? []).map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} <span>새 탭 ↗</span></a>)}</nav>
      </div> : <div className="orb-about-editorial">
        <p className="orb-editorial-eyebrow">{content.categories.find(item => item.id === "about")?.label}</p><h1 id="orb-editorial-title" tabIndex={-1}>{about.name || "소개 등록 예정"}</h1><p className="orb-about-lead">{about.lead}</p>
        <section><h2>{about.bioTitle}</h2><p>{about.bio}</p></section>
        {(about.sections ?? []).filter(item => item.section === "bio").map(item => <section key={item.id}><h2>{item.title}</h2><p>{item.body}</p></section>)}
        <section><h2>{about.interestsTitle}</h2><p>{about.interests}</p></section>
        {(about.sections ?? []).filter(item => item.section === "interests").map(item => <section key={item.id}><h2>{item.title}</h2><p>{item.body}</p></section>)}
        <section><h2>{about.workStyleTitle}</h2><p>{about.workStyle}</p></section>
        {(about.sections ?? []).filter(item => item.section === "workStyle").map(item => <section key={item.id}><h2>{item.title}</h2><p>{item.body}</p></section>)}
        <section><h2>이력서</h2>{about.resume ? <a href={about.resume} target="_blank" rel="noreferrer">이력서 보기 ↗</a> : <p className="orb-pending">등록 예정</p>}</section>
      </div>}
    </div>
  </div>
}
