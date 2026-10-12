import type { Metadata } from "next"
import { PageIntro } from "@/components/PageIntro"
import { SkillBoard } from "@/components/SkillBoard"
import { skills } from "@/lib/portfolio"

export const metadata: Metadata = {
  title: "성장 기록",
}

export default function ProgressPage() {
  return (
    <div className="section-shell inner-page">
      <PageIntro
        eyebrow="LEARNING LOG"
        title="성장 기록"
        description="숙련도는 객관적인 점수보다 현재 학습 진행 상황을 표현한 값입니다. 학기가 끝날 때 다시 비교해 볼 예정입니다."
      />

      <SkillBoard skills={skills} />

      <section className="next-goals">
        <div>
          <p className="eyebrow">NEXT STEP</p>
          <h2>기말까지 채울 내용</h2>
        </div>
        <ol>
          <li><span>01</span> 프로젝트 상세 설명과 이미지 추가</li>
          <li><span>02</span> 로그인과 데이터베이스 실습 연결</li>
          <li><span>03</span> 모바일 화면과 접근성 보완</li>
        </ol>
      </section>
    </div>
  )
}

