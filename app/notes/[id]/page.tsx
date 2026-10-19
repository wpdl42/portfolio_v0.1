import { notFound } from "next/navigation"
import { findPublicNote } from "@/lib/cms/repository.server"
import { readAdminSession } from "@/lib/admin/session.server"
import { ExploreBackLink } from "@/components/ExploreBackLink"
type Props = { params: Promise<{ id: string }> }
export async function generateMetadata({ params }: Props) {
  const note = await findPublicNote((await params).id, !!(await readAdminSession()))
  return { title: note?.title ?? "글을 찾을 수 없습니다", ...(note?.visibility === "private" ? { robots: { index: false, follow: false } } : {}) }
}
export default async function NotePage({ params }: Props) {
  const note = await findPublicNote((await params).id, !!(await readAdminSession()))
  if (!note) notFound()
  return <article className="orb-detail-page orb-note-detail"><div className="orb-detail-shell"><ExploreBackLink category="notes" />{note.visibility === "private" && <p className="cms-private-notice">관리자 전용 비공개 미리보기</p>}<header><p className="eyebrow">NOTES · {note.date || "작성일 등록 예정"}</p><h1>{note.title}</h1><div className="orb-detail-tags">{note.tags.map(tag => <span key={tag}>{tag}</span>)}</div><p>{note.description}</p></header>{note.body.split(/\n\s*\n/).map((paragraph,index) => <p className="cms-prose" key={index}>{paragraph}</p>)}</div></article>
}
