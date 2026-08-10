import { safeTraceId } from '../auth/auth-errors'

export type ContactErrorCode =
  | 'INVALID_CONTACT_ID'
  | 'INVALID_ACCESS_REASON'
  | 'INVALID_CONTACT_RESPONSE'
  | 'CONTACT_ACCESS_DENIED'
  | 'SESSION_EXPIRED'
  | 'NETWORK_UNAVAILABLE'
  | 'UNEXPECTED'

export interface SafeContactError {
  code: ContactErrorCode
  message_key: string
  message: string
  recovery: string
  request_id: string | null
  correlation_id?: string
}

const errorMessages: Record<ContactErrorCode, Omit<SafeContactError, 'code' | 'request_id' | 'correlation_id'>> = {
  INVALID_CONTACT_ID: {
    message_key: 'contact.invalid_id',
    message: '联系人标识无效。',
    recovery: '返回联系人列表后重新选择。',
  },
  INVALID_ACCESS_REASON: {
    message_key: 'contact.invalid_access_reason',
    message: '请填写有效的查看理由。',
    recovery: '填写简短且不含敏感信息的理由后重试。',
  },
  INVALID_CONTACT_RESPONSE: {
    message_key: 'contact.invalid_response',
    message: '联系人信息未能安全读取。',
    recovery: '刷新权限后重试；系统不会保留本次返回内容。',
  },
  CONTACT_ACCESS_DENIED: {
    message_key: 'contact.access_denied',
    message: '当前无权查看联系人身份或联系方式。',
    recovery: '确认领取或管理权限后重试。',
  },
  SESSION_EXPIRED: {
    message_key: 'auth.session_expired',
    message: '登录状态已过期。',
    recovery: '重新登录后再查看联系人。',
  },
  NETWORK_UNAVAILABLE: {
    message_key: 'common.network_unavailable',
    message: '暂时无法连接服务。',
    recovery: '检查网络后重新授权，旧联系方式不会恢复。',
  },
  UNEXPECTED: {
    message_key: 'common.unexpected',
    message: '联系人信息暂时未能读取。',
    recovery: '请稍后重新授权；如持续失败，请联系管理员。',
  },
}

const providerCodeMap: Record<string, ContactErrorCode> = {
  '42501': 'CONTACT_ACCESS_DENIED',
  auth_required: 'SESSION_EXPIRED',
  pgrst301: 'SESSION_EXPIRED',
  session_invalid: 'SESSION_EXPIRED',
  jwt_expired: 'SESSION_EXPIRED',
}

export function safeContactError(
  code: string,
  requestId: unknown = null,
  correlationId: unknown = null,
): SafeContactError {
  const safeCode = Object.hasOwn(errorMessages, code) ? (code as ContactErrorCode) : 'UNEXPECTED'
  const safeCorrelationId = safeTraceId(correlationId)
  return {
    code: safeCode,
    ...errorMessages[safeCode],
    request_id: safeTraceId(requestId),
    ...(safeCorrelationId ? { correlation_id: safeCorrelationId } : {}),
  }
}

export function normalizeContactError(error: unknown, fallbackCode: ContactErrorCode = 'UNEXPECTED') {
  if (error instanceof TypeError) return safeContactError('NETWORK_UNAVAILABLE')
  if (typeof error !== 'object' || error === null) return safeContactError(fallbackCode)

  const record = error as Record<string, unknown>
  const rawCode = typeof record.code === 'string' ? record.code : fallbackCode
  const normalizedCode = providerCodeMap[rawCode.toLowerCase()] ?? rawCode.toUpperCase()
  return safeContactError(normalizedCode, record.request_id, record.correlation_id)
}
