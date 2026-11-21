export type LoungeScope = "public" | "mine" | "all" | "trash"
export type LoungeThread = {
  id: string; title: string; nickname: string; isOwner: boolean; isSecret: boolean
  createdAt: string; updatedAt: string; deletedAt: string | null; version: number
  status: "waiting" | "answered"; canManage: boolean; canReply: boolean
}
export type LoungeMessage = {
  id: string; nickname: string; isOwner: boolean; body: string; createdAt: string; updatedAt: string
  deletedAt: string | null; version: number; canManage: boolean
}
export type LoungePage = { threads: LoungeThread[]; nextCursor: string | null }
export type LoungeDetail = { thread: LoungeThread; messages: LoungeMessage[]; previousCursor: string | null }
export const loungeTitleError = (title: string) => !title.trim() || title.trim().length > 80 || /[\r\n\u0000-\u001f\u007f]/u.test(title) ? "제목은 줄바꿈 없이 1~80자로 입력해 주세요." : null
