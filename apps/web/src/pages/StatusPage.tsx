import { useAuth } from '../auth/auth-context'

export function LoadingPage() {
  return (
    <main className="auth-shell" aria-busy="true">
      <section className="auth-card" aria-labelledby="loading-title">
        <p className="eyebrow">CANWIN CRM</p>
        <h1 id="loading-title">正在确认登录状态</h1>
        <p className="description">请稍候，不会在本地推测您的权限。</p>
      </section>
    </main>
  )
}

export function RetryPage() {
  const { error, retry } = useAuth()
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="retry-title">
        <p className="eyebrow">CANWIN CRM</p>
        <h1 id="retry-title">连接暂时中断</h1>
        <div className="notice notice-error" role="alert">
          <strong>{error?.message ?? '暂时无法连接服务。'}</strong>
          <span>{error?.recovery ?? '检查网络后重试。'}</span>
        </div>
        <button className="primary-button" onClick={() => void retry()} type="button">重新连接</button>
      </section>
    </main>
  )
}
