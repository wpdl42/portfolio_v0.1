import { notFound } from "next/navigation"
import { notes } from "@/lib/notes"
import { ExploreBackLink } from "@/components/ExploreBackLink"

export function generateStaticParams() { return notes.map(note => ({ id: note.id })) }
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return { title: notes.find(note => note.id === id)?.title ?? "글을 찾을 수 없습니다" }
}
export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const note = notes.find(note => note.id === id)
  if (!note) notFound()
  return <article className="orb-detail-page orb-note-detail"><div className="orb-detail-shell"><ExploreBackLink category="notes" /><header><p className="eyebrow">NOTES · {note.date ?? "작성일 등록 예정"}</p><h1>{note.title}</h1><div className="orb-detail-tags">{note.tags.map(tag => <span key={tag}>{tag}</span>)}</div><p>{note.description}</p></header>{note.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}<a href="https://it-bookmark.tistory.com/" target="_blank" rel="noreferrer">학습 블로그 방문 ↗</a></div></article>
}
