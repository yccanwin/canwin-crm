import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { accessContext, fakeAuthAdapter } from './test/auth-fixtures'

describe('CanWin CRM authentication experience', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  test('restores a verified active session and renders the workbench', async () => {
    const fake = fakeAuthAdapter()
    render(<App adapter={fake.adapter} />)

    expect(await screen.findByRole('heading', { name: '工作台' })).toBeVisible()
    expect(screen.getByText('测试成员 · 测试部门')).toBeVisible()
    expect(fake.getAuthenticatedUser).toHaveBeenCalled()
    expect(fake.getAccessContext).toHaveBeenCalled()
  })

  test('signs in independently and never offers self registration', async () => {
    const fake = fakeAuthAdapter({ authenticated: false })
    render(<App adapter={fake.adapter} />)

    expect(await screen.findByRole('heading', { name: '独立登录' })).toBeVisible()
    expect(screen.getByText(/不开放自行注册/)).toBeVisible()
    fake.setAuthenticated(true)
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'member@example.com' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'correct-password' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByRole('heading', { name: '工作台' })).toBeVisible()
    expect(fake.signIn).toHaveBeenCalledWith('member@example.com', 'correct-password')
  })

  test('shows a stable Chinese error for invalid credentials', async () => {
    const fake = fakeAuthAdapter({ authenticated: false })
    fake.signIn.mockRejectedValueOnce({ code: 'invalid_credentials', message: 'raw provider detail' })
    render(<App adapter={fake.adapter} />)

    await screen.findByRole('heading', { name: '独立登录' })
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'member@example.com' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByText('邮箱或密码不正确，请重新输入。')).toBeVisible()
    expect(screen.queryByText('raw provider detail')).not.toBeInTheDocument()
  })

  test('passes the validated invitation id when setting a password and accepting an invitation', async () => {
    const invitationId = '44444444-4444-4444-8444-444444444444'
    window.history.replaceState(null, '', `/invite/accept?invitation_id=${invitationId}`)
    const fake = fakeAuthAdapter({ context: { ...accessContext(), member: null } })
    render(<App adapter={fake.adapter} />)

    expect(await screen.findByRole('heading', { name: '接受邀请' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'strong-pass-123' } })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'strong-pass-123' } })
    fireEvent.click(screen.getByRole('button', { name: '完成激活' }))

    await waitFor(() => expect(fake.setPassword).toHaveBeenCalledWith('strong-pass-123'))
    expect(fake.acceptInvitation).toHaveBeenCalledWith(invitationId)
  })

  test('does not show member invitation controls without the server capability', async () => {
    const fake = fakeAuthAdapter({ context: accessContext({ canInvite: true }) })
    render(<App adapter={fake.adapter} />)

    await screen.findByRole('heading', { name: '工作台' })
    expect(screen.queryByRole('heading', { name: '邀请成员' })).not.toBeInTheDocument()
  })

  test('shows only allowed target roles and prevents duplicate invitation submission', async () => {
    const fake = fakeAuthAdapter({
      context: accessContext({ canInvite: true, canInviteSales: true, canInviteManager: false }),
    })
    let finishInvite: (() => void) | undefined
    fake.inviteMember.mockImplementation(
      () => new Promise<void>((resolve) => {
        finishInvite = resolve
      }),
    )
    render(<App adapter={fake.adapter} />)

    expect(await screen.findByRole('heading', { name: '邀请成员' })).toBeVisible()
    expect(screen.getByRole('option', { name: '销售' })).toBeVisible()
    expect(screen.queryByRole('option', { name: '部门负责人' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('成员邮箱'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('成员姓名'), { target: { value: '新成员' } })
    const submit = screen.getByRole('button', { name: '发送邀请' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(fake.inviteMember).toHaveBeenCalledTimes(1)
    expect(fake.inviteMember).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        display_name: '新成员',
        target_role: 'sales',
        department_id: '33333333-3333-4333-8333-333333333333',
        idempotency_key: expect.any(String),
      }),
    )
    await act(async () => finishInvite?.())
    expect(await screen.findByText('邀请已提交发送。')).toBeVisible()
  })

  test('moves a revoked session to login and uses local sign out for user logout', async () => {
    const fake = fakeAuthAdapter()
    render(<App adapter={fake.adapter} />)
    await screen.findByRole('heading', { name: '工作台' })

    fireEvent.click(screen.getByRole('button', { name: '退出' }))
    await waitFor(() => expect(fake.signOutLocal).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('heading', { name: '独立登录' })).toBeVisible()
  })
})
