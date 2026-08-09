import { type FormEvent, useState } from 'react'
import { useAuth } from '../auth/auth-context'
import { invitationIdFromLocation } from '../auth/invitation'

export function InviteAcceptPage() {
  const { acceptInvite, context, error, status } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const invitationId = invitationIdFromLocation()
  const submitting = status === 'setting_password' || status === 'accepting_invite' || status === 'resolving_access'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    if (!invitationId) {
      setFormError('邀请链接缺少有效标识，请联系管理员重新发送。')
      return
    }
    if (password.length < 8) {
      setFormError('密码至少需要 8 位。')
      return
    }
    if (password !== confirmation) {
      setFormError('两次输入的密码不一致。')
      return
    }
    setFormError(null)
    await acceptInvite(password, invitationId)
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="invite-title">
        <p className="eyebrow">CANWIN CRM</p>
        <h1 id="invite-title">接受邀请</h1>
        <p className="description">
          {context?.member?.display_name ? `${context.member.display_name}，请设置登录密码完成激活。` : '请设置登录密码完成激活。'}
        </p>

        {formError ? <div className="notice notice-error" role="alert">{formError}</div> : null}
        {!invitationId ? <div className="notice notice-error" role="alert">邀请链接无效或已过期。</div> : null}
        {error ? (
          <div className="notice notice-error" role="alert">
            <strong>{error.message}</strong>
            <span>{error.recovery}</span>
          </div>
        ) : null}

        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            <span>新密码</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <label>
            <span>确认新密码</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              type="password"
              value={confirmation}
            />
          </label>
          <button className="primary-button" disabled={submitting || !invitationId} type="submit">
            {submitting ? '正在激活…' : '完成激活'}
          </button>
        </form>
      </section>
    </main>
  )
}
