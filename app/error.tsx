"use client"
import Link from "next/link"
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="cms-error-page"><h1>콘텐츠를 불러오지 못했습니다.</h1><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p><button type="button" onClick={reset}>다시 불러오기</button><Link href="/">홈으로 돌아가기</Link></section>
}
