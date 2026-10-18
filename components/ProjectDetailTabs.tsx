"use client"

import { useState } from "react"
import type { Project } from "@/lib/portfolio"
import type { ProjectDetail } from "@/lib/project-details"

const tabs = ["Overview", "Development Process", "Tech Stack", "What I Learned"] as const
type Tab = typeof tabs[number]

export function ProjectDetailTabs({ project, detail }: { project: Project; detail: ProjectDetail }) {
  const [active, setActive] = useState<Tab>("Overview")

  return <section className="orb-detail-content" aria-label="프로젝트 상세 정보">
    <div className="orb-detail-tabs" role="tablist" aria-label="상세 정보 항목">
      {tabs.map((tab) => <button key={tab} type="button" role="tab" id={`tab-${tabs.indexOf(tab)}`} aria-controls="orb-detail-tabpanel" aria-selected={active === tab} tabIndex={active === tab ? 0 : -1} onClick={() => setActive(tab)} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const next = (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; setActive(tabs[next]); document.getElementById(`tab-${next}`)?.focus() }}>{tab}</button>)}
    </div>
    <div className="orb-detail-tabpanel" id="orb-detail-tabpanel" role="tabpanel" aria-labelledby={`tab-${tabs.indexOf(active)}`} key={active}>
      {active === "Overview" && <><h2>프로젝트 개요</h2><p>{detail.overview ?? project.description}</p><dl className="orb-detail-facts"><div><dt>제작 기간</dt><dd>{project.period}</dd></div><div><dt>담당 역할</dt><dd>{project.role}</dd></div>{project.status && <div><dt>상태</dt><dd>{project.status}</dd></div>}{project.visibility && <div><dt>공개 상태</dt><dd>{project.visibility === "public" ? "공개" : "비공개"}</dd></div>}</dl>{detail.features && <><h3>주요 기능</h3><ul>{detail.features.map(feature=><li key={feature}>{feature}</li>)}</ul></>}</>}
      {active === "Development Process" && <><h2>개발 과정</h2><p>{detail.process}</p></>}
      {active === "Tech Stack" && <><h2>사용 기술</h2><p>{detail.technologyNote ?? "이 프로젝트와 관련된 분야와 기술입니다."}</p><div className="orb-detail-tags">{detail.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></>}
      {active === "What I Learned" && <><h2>배운 점</h2><ul>{detail.learnings.map((learning) => <li key={learning}>{learning}</li>)}</ul></>}
    </div>
  </section>
}
