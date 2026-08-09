import { type FormEvent, useRef, useState } from 'react'
import { useAuth } from '../auth/auth-context'
import type { InviteMemberInput, SafeAuthError } from '../auth/auth-types'

export function HomePage() {
  const { context, inviteMember, signOut, status } = useAuth()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [targetRole, setTargetRole] = useState<InviteMemberInput['target_role']>('sales')
  const [idempotencyKey, setIdempotencyKey] = useState(() => window.crypto.randomUUID())
  const [inviteError, setInviteError] = useState<SafeAuthError | null>(null)
  const [inviteSent, setInviteSent] = useState(false)
  const [submittingInvite, setSubmittingInvite] = useState(false)
  const inviteInFlight = useRef(false)
  const department = context?.primary_department
  const canInviteSales = context?.capabilities.can_invite_sales.allowed === true
  const canInviteManager = context?.capabilities.can_invite_department_manager.allowed === true
  const canInvite =
    context?.capabilities.can_invite_member.allowed === true &&
    Boolean(department) &&
    (canInviteSales || canInviteManager)
  const effectiveTargetRole = targetRole === 'sales' && canInviteSales ? 'sales' : 'department_manager'

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inviteInFlight.current || !department) return
    inviteInFlight.current = true
    setSubmittingInvite(true)
    setInviteError(null)
    setInviteSent(false)
    const error = await inviteMember({
      email: email.trim(),
      display_name: displayName.trim(),
      target_role: effectiveTargetRole,
      department_id: department.id,
      idempotency_key: idempotencyKey,
    })
    inviteInFlight.current = false
    setSubmittingInvite(false)
    if (error) {
      setInviteError(error)
      return
    }
    setInviteSent(true)
    setEmail('')
    setDisplayName('')
    setTargetRole(canInviteSales ? 'sales' : 'department_manager')
    setIdempotencyKey(window.crypto.randomUUID())
  }

  return (
    <main className="app-shell">
      <div className="app-grid">
        <section className="welcome-card" aria-labelledby="home-title">
          <div className="header-row">
            <div>
              <p className="eyebrow">CANWIN CRM</p>
              <h1 id="home-title">工作台</h1>
            </div>
            <button className="text-button" disabled={status === 'signing_out'} onClick={() => void signOut()} type="button">
              退出
            </button>
          </div>
          <p className="description">
            {context?.member?.display_name ?? '当前成员'} · {department?.name ?? '未配置主营部门'}
          </p>
          <div className="notice notice-success" role="status">
            身份、成员状态和主营部门已由服务端确认。
          </div>
        </section>

        {canInvite ? (
          <section className="welcome-card" aria-labelledby="member-invite-title">
            <p className="eyebrow">成员管理</p>
            <h2 id="member-invite-title">邀请成员</h2>
            <p className="description">邀请成员加入 {department?.name}。目标部门由服务端能力限定。</p>

            {inviteError ? (
              <div className="notice notice-error" role="alert">
                <strong>{inviteError.message}</strong>
                <span>{inviteError.recovery}</span>
              </div>
            ) : null}
            {inviteSent ? <div className="notice notice-success" role="status">邀请已提交发送。</div> : null}

            <form className="form-stack" onSubmit={handleInvite}>
              <label>
                <span>成员邮箱</span>
                <input
                  autoComplete="off"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label>
                <span>成员姓名</span>
                <input onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
              </label>
              <label>
                <span>目标角色</span>
                <select
                  onChange={(event) => setTargetRole(event.target.value as InviteMemberInput['target_role'])}
                  value={effectiveTargetRole}
                >
                  {canInviteSales ? <option value="sales">销售</option> : null}
                  {canInviteManager ? <option value="department_manager">部门负责人</option> : null}
                </select>
              </label>
              <label>
                <span>主营部门</span>
                <input disabled readOnly value={department?.name ?? ''} />
              </label>
              <button className="primary-button" disabled={submittingInvite} type="submit">
                {submittingInvite ? '正在发送…' : '发送邀请'}
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  )
}
