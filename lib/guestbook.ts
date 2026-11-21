export const guestbookLimits = { nickname: 20, passwordMin: 8, passwordMax: 128, message: 5000, page: 20 }
export type GuestbookViewer = { nickname: string; isOwner: boolean; expiresAt: string }

export const normalizeNickname = (value: string) => value.normalize("NFKC").trim()
export function credentialError(nickname: string, password: string) {
  if (!/^[\p{L}\p{N}_-]{2,20}$/u.test(normalizeNickname(nickname))) return "닉네임은 한글·영문·숫자·밑줄·하이픈으로 2~20자 입력해 주세요."
  if (password.length < guestbookLimits.passwordMin || password.length > guestbookLimits.passwordMax || !password.trim()) return "비밀번호는 8~128자로 입력해 주세요."
  return null
}
export function messageError(body: string) {
  if (!body.trim() || body.trim().length > guestbookLimits.message) return "내용은 1~5,000자로 입력해 주세요."
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body)) return "사용할 수 없는 제어 문자가 포함되어 있습니다."
  return null
}
