import { type FormEvent, useState } from 'react'
import { useAuth } from '../auth/auth-context'

export function LoginPage() {
  const { error, login, status } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const submitting = status === 'signing_in' || status === 'resolving_access'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    await login(email, password)
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">CANWIN CRM</p>
        <h1 id="login-title">独立登录</h1>
        <p className="description">使用管理员邀请的内部账号登录。</p>

        {error ? (
          <div className="notice notice-error" role="alert">
            <strong>{error.message}</strong>
            <span>{error.recovery}</span>
          </div>
        ) : null}

        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            <span>邮箱</span>
            <input
              autoComplete="email"
              inputMode="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            <span>密码</span>
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? '正在验证…' : '登录'}
          </button>
        </form>

        <p className="help-text">本系统不开放自行注册；没有账号请联系部门负责人。</p>
      </section>
    </main>
  )
}
