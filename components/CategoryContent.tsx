"use client"
import Link from "next/link"
import { FeaturedProjectsCarousel } from "@/components/FeaturedProjectsCarousel"
import type { Project } from "@/lib/projects/types"
import type { CategoryId } from "@/lib/orb-content"
import type { PortfolioContent } from "@/lib/cms/types"

export function CategoryContent({ category, expanded, projects, targetProjectId, experiments = false, content }: { category: CategoryId; expanded: boolean; projects: Project[]; targetProjectId: number | null; experiments?: boolean; content: PortfolioContent }) {
  if (category === "projects") return experiments ? <div className="orb-content-grid">{projects.map(item => <Link className="orb-info-card" href={`/projects/${item.routeId ?? item.id}`} key={item.id}><span className="orb-info-index">EXPERIMENT</span><h3>{item.title}</h3><p>{item.description}</p><span aria-hidden="true">상세 보기 ↗</span></Link>)}{!projects.length && <p>표시할 실험 작업이 없습니다.</p>}</div> : projects.length ? <FeaturedProjectsCarousel projects={projects} expanded={expanded} initialProjectId={targetProjectId} /> : <p className="cms-empty">표시할 프로젝트가 없습니다.</p>
  if (category === "notes") return <div className="orb-notes-list">{content.notes.map(note => <Link className="orb-note-link" href={`/notes/${note.slug}`} key={note.id}><div><span>{note.tags.join(" · ")}</span><h2>{note.title}</h2><p>{note.description}</p></div><div className="orb-note-meta"><time>{note.date || "작성일 등록 예정"}</time><span aria-hidden="true">↗</span></div></Link>)}{!content.notes.length && <p>표시할 글이 없습니다.</p>}{content.contact.blog && <a className="orb-blog-link" href={content.contact.blog} target="_blank" rel="noreferrer">{content.contact.blogLabel || "블로그"} ↗</a>}</div>
  if (category === "skills") return <div className="orb-skills-groups">{[...new Set(content.skills.map(skill => skill.group))].map(group => <section key={group}><h2>{group}</h2>{content.skills.filter(skill => skill.group === group).map(skill => <article className="orb-skill-entry" key={skill.id}><h3>{skill.name}</h3><p>{skill.description}</p><div>{skill.projectIds.map(id => <Link key={id} href={`/projects/${id}`}>{content.projects.find(project => project.id === id)?.title} ↗</Link>)}</div></article>)}</section>)}{!content.skills.length && <p>표시할 기술이 없습니다.</p>}</div>
  if (category === "journey") {
    const intro = content.journey.find(item => item.id === "archive")
    return <div className="orb-journey">
      <ol>{content.journey.filter(item => item.id !== "archive").map(item => <li key={item.id}>
        <span>{item.period}</span>
        <div>
          <h2>{item.title}</h2>
          {item.activityType && <p>{item.activityType}</p>}
          {item.description && item.description.trim() !== item.activityType.trim() && <p>{item.description}</p>}
          {item.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>)}
        </div>
      </li>)}</ol>
      {intro && <section><p className="eyebrow">LEARNING ARCHIVE</p><h2>{intro.title}</h2><div className="orb-learning-tags">{content.skills.map(skill => <span key={skill.id}>{skill.name}</span>)}</div><p>{intro.description}</p>{intro.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>)}</section>}
    </div>
  }
  return null
}
