import './portrait-evidence-panel.css'
import type { PortraitEvidenceScenario } from './portrait-evidence-scenarios'

interface EvidenceRowProps {
  label: string
  value: string
  badge?: string
  muted?: boolean
}

function EvidenceRow({ label, value, badge, muted = false }: EvidenceRowProps) {
  return (
    <li className={`portrait-evidence-row${muted ? ' portrait-evidence-row--muted' : ''}`}>
      <span className="portrait-evidence-row__label">{label}</span>
      <strong>{value}</strong>
      {badge ? <span className="portrait-evidence-badge">{badge}</span> : null}
    </li>
  )
}

function ScenarioBody({ scenario }: { scenario: PortraitEvidenceScenario }) {
  if (scenario === 'types') {
    return (
      <ul className="portrait-evidence-list" aria-label="五种画像类型">
        <EvidenceRow label="文本" value="社区型门店" />
        <EvidenceRow label="单选" value="餐饮" />
        <EvidenceRow label="多选" value="外卖 · 堂食" />
        <EvidenceRow label="布尔" value="否" />
        <EvidenceRow label="数值" value="0" badge="规范十进制" />
      </ul>
    )
  }

  if (scenario === 'clear') {
    return (
      <div className="portrait-evidence-stack">
        <p>清空是独立操作，不会把 false、0、空字符串或空数组误当成删除。</p>
        <ul className="portrait-evidence-list" aria-label="明确清空语义">
          <EvidenceRow label="布尔正式值" value="false" badge="保留" />
          <EvidenceRow label="数值正式值" value="0" badge="保留" />
          <EvidenceRow label="字段操作" value="clear" badge="明确清空" />
        </ul>
        <button type="button" disabled>清空画像值</button>
      </div>
    )
  }

  if (scenario === 'unsupported') {
    return (
      <div className="portrait-evidence-notice" role="status">
        <span className="portrait-evidence-badge">只读</span>
        <h3>此画像类型暂不受支持</h3>
        <p>已保留服务端字段占位，不猜测编辑，也不会通过批量替换删除未知值。</p>
      </div>
    )
  }

  if (scenario === 'inactive-history') {
    return (
      <ul className="portrait-evidence-list" aria-label="停用历史">
        <EvidenceRow label="经营模式" value="旧版直营网点" badge="字段已停用" muted />
        <EvidenceRow label="历史选项" value="传统零售" badge="选项已停用" muted />
      </ul>
    )
  }

  if (scenario === 'derived') {
    return (
      <ul className="portrait-evidence-list" aria-label="系统派生三态">
        <EvidenceRow label="营业执照" value="具备" badge="fresh" />
        <EvidenceRow label="法人身份证" value="不具备" badge="fresh" />
        <EvidenceRow label="证件齐全度" value="未计算 / 数据未就绪" badge="unknown" />
        <EvidenceRow label="证件齐全度" value="待刷新" badge="stale" />
      </ul>
    )
  }

  if (scenario === 'department-switch') {
    return (
      <div className="portrait-evidence-notice" role="status" aria-live="polite">
        <span className="portrait-evidence-spinner" aria-hidden="true" />
        <h3>正在加载当前主营部门</h3>
        <p>上一部门的证件齐全度缓存已清除，旧请求结果不会回写。</p>
      </div>
    )
  }

  return (
    <div className="portrait-evidence-notice portrait-evidence-notice--error" role="alert">
      <h3>画像暂时无法加载</h3>
      <p>请稍后重试。错误详情不会写入日志、缓存或分析服务。</p>
      <button type="button">重新加载</button>
    </div>
  )
}

export function PortraitEvidencePanel({ scenario }: { scenario: PortraitEvidenceScenario }) {
  return (
    <section className="portrait-evidence-panel" aria-labelledby="portrait-evidence-title">
      <header className="portrait-evidence-panel__header">
        <p className="portrait-evidence-panel__eyebrow">共享门店画像</p>
        <h2 id="portrait-evidence-title">画像安全状态</h2>
        <p>合成移动端证据 · 不接生产路由</p>
      </header>
      <div className="portrait-evidence-panel__body">
        <ScenarioBody scenario={scenario} />
      </div>
    </section>
  )
}
