import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { PortraitEvidencePanel } from './PortraitEvidencePanel'
import {
  PORTRAIT_EVIDENCE_SCENARIOS,
  type PortraitEvidenceScenario,
} from './portrait-evidence-scenarios'

const expectedCopy: Record<PortraitEvidenceScenario, string> = {
  types: '规范十进制',
  clear: '明确清空',
  unsupported: '此画像类型暂不受支持',
  'inactive-history': '字段已停用',
  derived: '未计算 / 数据未就绪',
  'department-switch': '上一部门的证件齐全度缓存已清除',
  error: '画像暂时无法加载',
}

describe('PortraitEvidencePanel 360px synthetic states', () => {
  test.each(PORTRAIT_EVIDENCE_SCENARIOS)('renders the %s scenario at a 360px viewport', (scenario) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 })
    render(<PortraitEvidencePanel scenario={scenario} />)
    expect(screen.getByText(expectedCopy[scenario], { exact: false })).toBeVisible()
    expect(screen.getByRole('heading', { name: '画像安全状态' })).toBeVisible()
  })

  test('renders all five supported types without treating false or zero as empty', () => {
    render(<PortraitEvidencePanel scenario="types" />)
    expect(screen.getByRole('list', { name: '五种画像类型' }).children).toHaveLength(5)
    expect(screen.getByText('0')).toBeVisible()
    expect(screen.getByText('否')).toBeVisible()
  })

  test('renders unknown and stale derived values without an old boolean conclusion', () => {
    render(<PortraitEvidencePanel scenario="derived" />)
    expect(screen.getByText('未计算 / 数据未就绪')).toBeVisible()
    expect(screen.getByText('待刷新')).toBeVisible()
    expect(screen.getAllByText('证件齐全度')).toHaveLength(2)
  })

  test('keeps unsupported fields read-only', () => {
    render(<PortraitEvidencePanel scenario="unsupported" />)
    expect(screen.getByText('只读')).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  test('uses a stable safe error without provider detail', () => {
    render(<PortraitEvidencePanel scenario="error" />)
    expect(screen.getByRole('alert')).toHaveTextContent('请稍后重试')
    expect(screen.queryByText(/stack|token|provider|sql/i)).not.toBeInTheDocument()
  })
})
