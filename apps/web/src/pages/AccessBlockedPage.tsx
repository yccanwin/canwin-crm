import { useAuth } from '../auth/auth-context'

export function AccessBlockedPage() {
  const { error, signOut, status } = useAuth()
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="blocked-title">
        <p className="eyebrow">CANWIN CRM</p>
        <h1 id="blocked-title">暂时无法进入</h1>
        <div className="notice notice-error" role="alert">
          <strong>{error?.message ?? '当前账号没有可用的 CRM 权限。'}</strong>
          <span>{error?.recovery ?? '请联系管理员确认成员和主营部门。'}</span>
        </div>
        <button className="secondary-button" disabled={status === 'signing_out'} onClick={() => void signOut()} type="button">
          退出当前账号
        </button>
      </section>
    </main>
  )
}
