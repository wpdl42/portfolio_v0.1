export type ProjectDetail = {
  tags: string[]
  process: string
  learnings: string[]
  overview?: string
  features?: string[]
  technologyNote?: string
  sources?: string[]
}

export type Project = {
  id: number
  title: string
  category: string
  description: string
  role: string
  period: string
  status?: "진행 중" | "완료" | "예정"
  accent: string
  link?: string
  slug?: string
  canonicalUrl?: string
  visibility?: "public" | "private"
  order?: number
  thumbnail?: string
  keywords?: string[]
  detail?: ProjectDetail
}
