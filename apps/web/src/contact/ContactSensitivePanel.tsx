import { useEffect, useState, type FormEvent } from 'react'
import type { ContactAdapter } from './contact-adapter'
import type { ContactChannelType, ContactStructure } from './contact-contract'
import { normalizeContactError } from './contact-errors'
import {
  contactViewMachine,
  initialContactViewState,
  type ContactViewState,
} from './contact-state'
import './contact-sensitive-panel.css'

const channelLabels: Record<ContactChannelType, string> = {
  mobile: '手机',
  phone: '电话',
  email: '邮箱',
  wechat: '微信',
  other: '其他',
}

const denialMessages: Record<string, string> = {
  AUTH_REQUIRED: '请先登录后再查看。',
  SESSION_INVALID: '登录状态已失效，请重新登录。',
  MEMBERSHIP_INACTIVE: '当前成员状态不可用。',
  DEPARTMENT_INACTIVE: '当前主营部门状态不可用。',
  CONTACT_UNAVAILABLE: '该联系人当前不可查看。',
  NOT_CLAIMED: '当前尚未取得该联系人的查看权限。',
  REASON_REQUIRED: '请填写查看理由。',
  REASON_INVALID: '查看理由不符合安全要求。',
}

let requestSequence = 0

function nextRequestId() {
  requestSequence += 1
  return `contact-access-${requestSequence}`
}

function reasonIsSafe(reason: string) {
  const normalized = reason.trim()
  return (
    [...normalized].length >= 1 &&
    [...normalized].length <= 500 &&
    ![...reason].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
  )
}

export interface ContactSensitivePanelViewProps {
  state: ContactViewState
  reason: string
  validationMessage?: string | null
  onOpenReason: () => void
  onReasonChange: (reason: string) => void
  onSubmitReason: () => void
  onRetry: () => void
}

export function ContactSensitivePanelView({
  state,
  reason,
  validationMessage = null,
  onOpenReason,
  onReasonChange,
  onSubmitReason,
  onRetry,
}: ContactSensitivePanelViewProps) {
  const structure = state.structure

  return (
    <section className="contact-sensitive-panel" aria-labelledby="contact-sensitive-title">
      <header>
        <p className="contact-sensitive-panel__eyebrow">联系人档案</p>
        <h2 id="contact-sensitive-title">身份与联系方式</h2>
        {structure ? (
          <p className="contact-sensitive-panel__meta">
            {structure.role_label} · {structure.is_primary ? '主联系人' : '联系人'}
          </p>
        ) : null}
      </header>

      <div className="contact-sensitive-panel__body" aria-live="polite">
        {state.status === 'structure_loading' || state.status === 'authorizing' ? (
          <div className="contact-sensitive-panel__status" role="status">
            <span className="contact-sensitive-panel__spinner" aria-hidden="true" />
            <p>{state.status === 'authorizing' ? '正在验证查看权限…' : '正在加载联系人…'}</p>
          </div>
        ) : null}

        {state.status === 'locked' ? (
          <div className="contact-sensitive-panel__status">
            <p>身份与联系方式已锁定。每次查看都需要填写安全理由并重新校验权限。</p>
            <button className="primary-button" type="button" onClick={onOpenReason}>
              申请查看联系方式
            </button>
          </div>
        ) : null}

        {state.status === 'reason_required' ? (
          <form
            className="contact-sensitive-panel__form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault()
              onSubmitReason()
            }}
          >
            <label htmlFor="contact-access-reason">查看理由</label>
            <textarea
              id="contact-access-reason"
              rows={4}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              aria-describedby="contact-access-help"
              autoComplete="off"
            />
            <p id="contact-access-help" className="contact-sensitive-panel__help">
              1–500 个字符，请勿填写手机号、证件号或其他敏感信息。
            </p>
            {validationMessage ? <p className="contact-sensitive-panel__error">{validationMessage}</p> : null}
            <button className="primary-button" type="submit">
              确认并查看
            </button>
          </form>
        ) : null}

        {state.status === 'granted' && state.sensitive ? (
          <div className="contact-sensitive-panel__result">
            <p className="contact-sensitive-panel__name">{state.sensitive.full_name ?? '未填写姓名'}</p>
            <dl>
              {state.sensitive.channels.map((channel, index) => (
                <div key={`${channel.type}-${index}`}>
                  <dt>{channelLabels[channel.type]}</dt>
                  <dd>{channel.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {state.status === 'granted_empty' ? (
          <div className="contact-sensitive-panel__status">
            <p>该联系人暂无可展示的身份或联系方式。</p>
            <button className="secondary-button" type="button" onClick={onRetry}>
              返回锁定状态
            </button>
          </div>
        ) : null}

        {state.status === 'denied' ? (
          <div className="contact-sensitive-panel__status contact-sensitive-panel__notice" role="alert">
            <p>{denialMessages[state.denial_reason_code ?? ''] ?? '当前无法查看联系人信息。'}</p>
            <button className="secondary-button" type="button" onClick={onRetry}>
              重新申请
            </button>
          </div>
        ) : null}

        {state.status === 'error' && state.error ? (
          <div className="contact-sensitive-panel__status contact-sensitive-panel__notice" role="alert">
            <p>{state.error.message}</p>
            <p className="contact-sensitive-panel__help">{state.error.recovery}</p>
            <button className="secondary-button" type="button" onClick={onRetry}>
              重试
            </button>
          </div>
        ) : null}

        {state.status === 'offline' ? (
          <div className="contact-sensitive-panel__status contact-sensitive-panel__notice" role="alert">
            <p>当前网络不可用，已清除本次敏感信息。</p>
            <button className="secondary-button" type="button" onClick={onRetry}>
              网络恢复后重试
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export interface ContactSensitivePanelProps {
  structure: ContactStructure
  readSensitiveContact: ContactAdapter['readSensitiveContact']
}

export function ContactSensitivePanel({ structure, readSensitiveContact }: ContactSensitivePanelProps) {
  const [state, setState] = useState<ContactViewState>(() =>
    contactViewMachine(initialContactViewState, { type: 'STRUCTURE_LOADED', structure }),
  )
  const [reason, setReason] = useState('')
  const [validationMessage, setValidationMessage] = useState<string | null>(null)

  useEffect(() => {
    setReason('')
    setValidationMessage(null)
    setState((current) => contactViewMachine(current, { type: 'STRUCTURE_LOADED', structure }))
  }, [structure])

  function returnToReason() {
    setReason('')
    setValidationMessage(null)
    setState((current) => contactViewMachine(current, { type: 'REASON_REQUESTED' }))
  }

  async function requestAccess() {
    if (!reasonIsSafe(reason)) {
      setValidationMessage('请填写 1–500 个字符且不含控制字符的查看理由。')
      return
    }

    setValidationMessage(null)
    const requestId = nextRequestId()
    setState((current) => contactViewMachine(current, { type: 'ACCESS_REQUESTED', request_id: requestId }))
    try {
      const access = await readSensitiveContact({
        contact_public_id: structure.public_id,
        reason,
      })
      setState((current) => contactViewMachine(current, {
        type: 'ACCESS_RESOLVED',
        request_id: requestId,
        access,
      }))
    } catch (error) {
      setState((current) => contactViewMachine(current, {
        type: 'ACCESS_FAILED',
        request_id: requestId,
        error: normalizeContactError(error),
      }))
    }
  }

  return (
    <ContactSensitivePanelView
      state={state}
      reason={reason}
      validationMessage={validationMessage}
      onOpenReason={returnToReason}
      onReasonChange={setReason}
      onSubmitReason={() => void requestAccess()}
      onRetry={returnToReason}
    />
  )
}
