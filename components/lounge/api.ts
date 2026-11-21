export class LoungeRequestError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function loungeRequest<T>(path = "", options: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(15000)
  const response = await fetch(`/api/guestbook${path}`, { ...options, cache: "no-store", signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout, headers: { "Content-Type": "application/json" } })
  const data = await response.json().catch(() => ({ error: "서버 응답을 확인하지 못했습니다." }))
  if (!response.ok) throw new LoungeRequestError(data.error || "요청을 완료하지 못했습니다.", response.status)
  return data as T
}
export const loungeError = (error: unknown) => error instanceof LoungeRequestError ? error.message : "연결하지 못했습니다. 입력한 내용은 유지됩니다. 다시 시도해 주세요."
