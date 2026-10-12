import type { Metadata } from "next"
import { PageIntro } from "@/components/PageIntro"
import { projects } from "@/lib/portfolio"

export const metadata: Metadata = {
  title: "프로젝트",
}

export default function ProjectsPage() {
  return (
    <div className="section-shell inner-page">
      <PageIntro
        eyebrow="PROJECT ARCHIVE"
        title="프로젝트"
        description="수업과 개인 학습에서 진행했거나 준비 중인 작업을 정리했습니다. 아직 비어 있는 부분은 앞으로의 경험으로 채울 예정입니다."
      />

      <div className="project-list">
        {projects.map((project) => (
          <article className="project-row" key={project.id}>
            <div className={`project-number accent-${project.accent}`}>
              {String(project.id).padStart(2, "0")}
            </div>
            <div className="project-row-main">
              <div className="project-row-title">
                <div>
                  <p className="project-category">{project.category}</p>
                  <h2>{project.title}</h2>
                </div>
                <span className="status-badge">{project.status}</span>
              </div>
              <p>{project.description}</p>
              <dl className="project-meta">
                <div>
                  <dt>기간</dt>
                  <dd>{project.period}</dd>
                </div>
                <div>
                  <dt>역할</dt>
                  <dd>{project.role}</dd>
                </div>
              </dl>
              {project.link && (
                <a href={project.link} target="_blank" rel="noreferrer" className="text-link">
                  프로젝트 방문하기 ↗
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

