"use client"

import { useEffect, useRef, useState } from "react"
import { contactDetails } from "@/lib/contact"

export function OrbEditorialPanel({ category, open, onClose }: { category: "about" | "contact"; open: boolean; onClose: () => void }) {
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
    <div className="orb-editorial-content">
      {category === "contact" ? <div className="orb-contact-type">
        <p className="orb-editorial-eyebrow">CONTACT</p><h1 id="orb-editorial-title" tabIndex={-1}>함께 이야기해요.</h1>
        <p className="orb-contact-intro">프로젝트와 배움에 관한 대화를 기다립니다.</p>
        <div className="orb-contact-email">{contactDetails.email ? <><a href={`mailto:${contactDetails.email}`}>{contactDetails.email}</a><button onClick={copyEmail}>이메일 복사</button></> : <p>이메일 <span>등록 예정</span></p>}<span role="status" aria-live="polite">{copyStatus}</span></div>
        <nav aria-label="외부 연락 링크"><a href={contactDetails.github} target="_blank" rel="noreferrer">GitHub <span>새 탭 ↗</span></a><a href={contactDetails.blog} target="_blank" rel="noreferrer">Blog <span>새 탭 ↗</span></a></nav>
      </div> : <div className="orb-about-editorial">
        <p className="orb-editorial-eyebrow">ABOUT / JANG JUMIN</p><h1 id="orb-editorial-title" tabIndex={-1}>장주민</h1><p className="orb-about-lead">웹 개발과 보안을 배우고 기록합니다.</p>
        <section><h2>만들며 배우는 과정</h2><p>중부대학교 정보보호학과에서 공부하며, 수업과 개인 학습의 결과물을 직접 만들고 다듬고 있습니다. 이 포트폴리오는 프로젝트와 학습 과정을 한곳에 기록하는 공간입니다.</p></section>
        <section><h2>관심 분야</h2><p>웹 인터페이스와 사용자 인터랙션, 리눅스와 보안에 관심을 두고 탐색합니다.</p></section>
        <section><h2>작업 방식</h2><p>문제를 작게 나누어 구현하고 실제 화면에서 동작을 확인합니다. 완성된 결과뿐 아니라 문제를 찾아 고쳐 나가는 과정도 기록합니다.</p></section>
        <section><h2>이력서</h2>{contactDetails.resume ? <a href={contactDetails.resume} target="_blank" rel="noreferrer">이력서 보기 ↗</a> : <p className="orb-pending">등록 예정</p>}</section>
      </div>}
    </div>
  </div>
}
