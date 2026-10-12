import Link from "next/link"
import { history, projects } from "@/lib/portfolio"

export default function HomePage() {
  return (
    <>
      <section className="hero section-shell">
        <div className="hero-copy">
          <p className="eyebrow">02학년 · 정보보호학과</p>
          <h1>
            배우는 과정을
            <br />
            <span>기록하는 개발자</span>
          </h1>
          <p className="hero-description">
            안녕하세요, 장주민입니다. 웹 개발과 보안을 공부하며 수업에서 배운
            내용과 프로젝트 경험을 차근차근 쌓아가고 있습니다.
          </p>
          <div className="hero-actions">
            <Link href="/projects" className="button button-primary">
              프로젝트 보기 <span>↗</span>
            </Link>
            <a
              href="https://github.com/wpdl42"
              className="text-link"
              target="_blank"
              rel="noreferrer"
            >
              GitHub 방문
            </a>
          </div>
        </div>

        <div className="hero-visual" aria-label="장주민 포트폴리오 소개 카드">
          <div className="visual-label">CURRENT FOCUS</div>
          <div className="visual-orbit visual-orbit-one" />
          <div className="visual-orbit visual-orbit-two" />
          <div className="visual-core">WEB<br />×<br />SECURITY</div>
          <p>Next.js · JavaScript · Linux</p>
        </div>
      </section>

      <section className="section-shell home-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SELECTED WORK</p>
            <h2>최근 프로젝트</h2>
          </div>
          <Link href="/projects" className="text-link">
            전체 보기 →
          </Link>
        </div>

        <div className="featured-grid">
          {projects.slice(0, 2).map((project, index) => (
            <article className={`project-card accent-${project.accent}`} key={project.id}>
              <div className="project-preview">
                <span>0{index + 1}</span>
                <div className="preview-window">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="project-body">
                <p className="project-category">{project.category}</p>
                <h3>{project.title}</h3>
                <p>{project.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-shell home-section about-grid">
        <div>
          <p className="eyebrow">ABOUT ME</p>
          <h2>완성보다 성장에 집중합니다.</h2>
        </div>
        <div className="about-copy">
          <p>
            아직 배우는 단계이지만, 직접 만들어 보고 문제를 고치면서 이해하는
            과정을 중요하게 생각합니다. 현재는 웹의 기본 구조와 서버, 보안의
            연결을 공부하고 있습니다.
          </p>
          <a
            href="https://it-bookmark.tistory.com/"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            학습 블로그 읽기 →
          </a>
        </div>
      </section>

      <section className="section-shell home-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">MY JOURNEY</p>
            <h2>지금까지의 발자취</h2>
          </div>
        </div>
        <div className="timeline">
          {history.map((item) => (
            <article key={`${item.year}-${item.text}`}>
              <strong>{item.year}</strong>
              <span>{item.text}</span>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

