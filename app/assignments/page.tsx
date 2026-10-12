import type { Metadata } from "next"
import { PageIntro } from "@/components/PageIntro"
import { assignments } from "@/lib/portfolio"

export const metadata: Metadata = {
  title: "과제",
}

export default function AssignmentsPage() {
  return (
    <div className="section-shell inner-page">
      <PageIntro
        eyebrow="COURSE WORK"
        title="제출 과제"
        description="웹 프로그래밍 수업에서 배운 순서대로 결과물을 기록하는 공간입니다. 과제가 추가되면 카드도 함께 확장합니다."
      />

      <div className="assignment-grid">
        {assignments.map((assignment) => (
          <article className="assignment-card" key={assignment.number}>
            <span className="assignment-number">ASSIGNMENT {assignment.number}</span>
            <h2>{assignment.title}</h2>
            <p>{assignment.description}</p>
            <span className="assignment-state">정리 완료</span>
          </article>
        ))}
        <article className="assignment-card assignment-next">
          <span className="assignment-number">NEXT</span>
          <h2>다음 결과물</h2>
          <p>새로운 과제와 학습 내용을 추가할 자리입니다.</p>
          <span className="assignment-state">준비 중</span>
        </article>
      </div>
    </div>
  )
}

