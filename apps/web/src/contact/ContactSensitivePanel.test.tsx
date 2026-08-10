import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { ContactSensitivePanel, ContactSensitivePanelView } from './ContactSensitivePanel'
import type { ContactStructure } from './contact-contract'
import { safeContactError } from './contact-errors'
import { contactViewMachine, initialContactViewState } from './contact-state'

const structure: ContactStructure = {
  public_id: '11111111-1111-4111-8111-111111111111',
  store_id: 1,
  role_label: '负责人',
  is_primary: true,
  status: 'active',
  version: 1,
}

const locked = contactViewMachine(initialContactViewState, { type: 'STRUCTURE_LOADED', structure })
const noop = () => undefined

function renderView(state = locked) {
  return render(
    <ContactSensitivePanelView
      state={state}
      reason="合成质检理由"
      onOpenReason={noop}
      onReasonChange={noop}
      onSubmitReason={noop}
      onRetry={noop}
    />,
  )
}

describe('ContactSensitivePanel mobile-safe states', () => {
  test('renders the locked state at a 360px viewport without revealing contact values', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 })
    renderView()
    expect(screen.getByRole('button', { name: '申请查看联系方式' })).toBeVisible()
    expect(screen.queryByText('contact@example.test')).not.toBeInTheDocument()
  })

  test('collects a reason and shows an explicit loading state before rendering an empty result', async () => {
    let resolveRead: ((value: { allowed: true; full_name: null; channels: [] }) => void) | undefined
    const read = vi.fn(() => new Promise<{ allowed: true; full_name: null; channels: [] }>((resolve) => {
      resolveRead = resolve
    }))
    render(<ContactSensitivePanel structure={structure} readSensitiveContact={read} />)

    fireEvent.click(screen.getByRole('button', { name: '申请查看联系方式' }))
    fireEvent.change(screen.getByLabelText('查看理由'), { target: { value: '合成质检理由' } })
    fireEvent.click(screen.getByRole('button', { name: '确认并查看' }))
    expect(screen.getByRole('status')).toHaveTextContent('正在验证查看权限')
    resolveRead?.({ allowed: true, full_name: null, channels: [] })
    expect(await screen.findByText('该联系人暂无可展示的身份或联系方式。')).toBeVisible()
    expect(read).toHaveBeenCalledWith({
      contact_public_id: structure.public_id,
      reason: '合成质检理由',
    })
  })

  test('rejects an unsafe reason locally without calling the reader', () => {
    const read = vi.fn()
    render(<ContactSensitivePanel structure={structure} readSensitiveContact={read} />)
    fireEvent.click(screen.getByRole('button', { name: '申请查看联系方式' }))
    fireEvent.change(screen.getByLabelText('查看理由'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '确认并查看' }))
    expect(screen.getByText(/请填写 1–500 个字符/)).toBeVisible()
    expect(read).not.toHaveBeenCalled()
  })

  test('renders only the stable safe error and recovery copy', async () => {
    const read = vi.fn().mockRejectedValue({
      code: 'session_invalid',
      message: 'raw provider detail contact@example.test',
    })
    render(<ContactSensitivePanel structure={structure} readSensitiveContact={read} />)
    fireEvent.click(screen.getByRole('button', { name: '申请查看联系方式' }))
    fireEvent.change(screen.getByLabelText('查看理由'), { target: { value: '合成质检理由' } })
    fireEvent.click(screen.getByRole('button', { name: '确认并查看' }))

    expect(await screen.findByText('登录状态已过期。')).toBeVisible()
    expect(screen.getByText('重新登录后再查看联系人。')).toBeVisible()
    expect(screen.queryByText(/raw provider detail/)).not.toBeInTheDocument()
  })

  test('renders the frozen loading and stable error view states', async () => {
    renderView(contactViewMachine(locked, { type: 'ACCESS_REQUESTED', request_id: 'synthetic-request' }))
    expect(screen.getByRole('status')).toHaveTextContent('正在验证查看权限')

    const { unmount } = renderView({
      ...locked,
      status: 'error',
      error: safeContactError('UNEXPECTED'),
    })
    await waitFor(() => expect(screen.getByText('联系人信息暂时未能读取。')).toBeVisible())
    unmount()
  })
})
