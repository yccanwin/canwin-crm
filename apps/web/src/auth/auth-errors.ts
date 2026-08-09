import type { SafeAuthError } from './auth-types'

const errorMessages: Record<string, Omit<SafeAuthError, 'code' | 'request_id'>> = {
  INVALID_CREDENTIALS: {
    message_key: 'auth.invalid_credentials',
    message: '邮箱或密码不正确，请重新输入。',
    recovery: '检查邮箱和密码后重试。',
  },
  SESSION_EXPIRED: {
    message_key: 'auth.session_expired',
    message: '登录状态已过期，请重新登录。',
    recovery: '重新登录后会返回刚才的安全页面。',
  },
  INVITATION_INVALID: {
    message_key: 'auth.invitation_invalid',
    message: '邀请链接无效。',
    recovery: '请联系管理员重新发送邀请。',
  },
  INVITATION_EXPIRED: {
    message_key: 'auth.invitation_expired',
    message: '邀请链接已过期。',
    recovery: '请联系管理员重新发送邀请。',
  },
  INVITATION_ALREADY_ACCEPTED: {
    message_key: 'auth.invitation_already_accepted',
    message: '该邀请已经接受。',
    recovery: '请直接使用邮箱和密码登录。',
  },
  MEMBERSHIP_INACTIVE: {
    message_key: 'auth.membership_inactive',
    message: '当前成员已停用，无法进入 CRM。',
    recovery: '如需恢复，请联系部门负责人。',
  },
  MEMBERSHIP_RESTRICTED: {
    message_key: 'auth.membership_restricted',
    message: '当前成员处于受限状态，无法进入 CRM。',
    recovery: '请先联系部门负责人完成待处理事项。',
  },
  DEPARTMENT_INACTIVE: {
    message_key: 'auth.department_inactive',
    message: '当前主营部门已停用，无法进入 CRM。',
    recovery: '请联系管理员确认部门状态。',
  },
  ACCESS_NOT_PROVISIONED: {
    message_key: 'auth.access_not_provisioned',
    message: '账号尚未配置 CRM 成员权限。',
    recovery: '请联系管理员确认邀请和成员资料。',
  },
  PASSWORD_POLICY_FAILED: {
    message_key: 'auth.password_policy_failed',
    message: '密码不符合安全要求。',
    recovery: '请设置至少 8 位的密码。',
  },
  NETWORK_UNAVAILABLE: {
    message_key: 'common.network_unavailable',
    message: '暂时无法连接服务。',
    recovery: '检查网络后重试。',
  },
  CONFIGURATION_INVALID: {
    message_key: 'common.configuration_invalid',
    message: 'CRM 环境配置不完整。',
    recovery: '请联系管理员检查当前环境配置。',
  },
  INVITE_MEMBER_FAILED: {
    message_key: 'auth.invite_member_failed',
    message: '邀请暂时未能发送。',
    recovery: '请稍后重试，重复提交不会创建重复邀请。',
  },
  UNEXPECTED: {
    message_key: 'common.unexpected',
    message: '操作暂时未能完成。',
    recovery: '请稍后重试；如持续失败，请联系管理员。',
  },
}

const providerCodeMap: Record<string, string> = {
  invalid_credentials: 'INVALID_CREDENTIALS',
  email_not_confirmed: 'INVALID_CREDENTIALS',
  weak_password: 'PASSWORD_POLICY_FAILED',
  otp_expired: 'INVITATION_EXPIRED',
  otp_disabled: 'INVITATION_INVALID',
  same_password: 'PASSWORD_POLICY_FAILED',
  session_not_found: 'SESSION_EXPIRED',
  refresh_token_not_found: 'SESSION_EXPIRED',
  refresh_token_already_used: 'SESSION_EXPIRED',
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

export function safeAuthError(code: string, requestId: string | null = null): SafeAuthError {
  const safeCode = errorMessages[code] ? code : 'UNEXPECTED'
  return {
    code: safeCode,
    ...errorMessages[safeCode],
    request_id: requestId,
  }
}

export function normalizeAuthError(error: unknown, fallbackCode = 'UNEXPECTED'): SafeAuthError {
  if (error instanceof TypeError) {
    return safeAuthError('NETWORK_UNAVAILABLE')
  }
  if (typeof error !== 'object' || error === null) {
    return safeAuthError(fallbackCode)
  }

  const record = error as Record<string, unknown>
  const rawCode = readString(record, 'code')
  const normalizedCode = rawCode
    ? providerCodeMap[rawCode.toLowerCase()] ?? rawCode.toUpperCase()
    : fallbackCode
  const requestId = readString(record, 'request_id')

  return safeAuthError(normalizedCode, requestId)
}

export function isRetryableAuthError(error: SafeAuthError) {
  return error.code === 'NETWORK_UNAVAILABLE' || error.code === 'UNEXPECTED'
}
