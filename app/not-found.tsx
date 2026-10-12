import Link from "next/link"

export default function NotFound() {
  return (
    <div className="not-found section-shell">
      <p className="eyebrow">404 ERROR</p>
      <h1>페이지를 찾을 수 없습니다.</h1>
      <Link href="/" className="button button-primary">
        홈으로 돌아가기
      </Link>
    </div>
  )
}

