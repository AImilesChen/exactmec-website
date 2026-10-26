import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdminApiError, createAdminClient } from './client.mjs';
import { budgetOptions, canContact, contactDestination, dateText, defaultFilters, display, drawingOptions, emptyReview, isReference, labels, reviewOptions, timingOptions } from './model.mjs';
import { ContentWorkspace } from './ContentWorkspace.jsx';
import { MetricsSummary } from './MetricsSummary.jsx';

const fieldLabels = { status: '跟进状态', authenticity: '信息核验', fit: '业务匹配', readiness: '资料准备', qualification: '审核结论', priority: '跟进优先级' };
const originalFields = [
  ['country', '国家 / 地区'], ['city', '城市'], ['component', '产品 / 零件'], ['description', '模具需求'],
  ['drawing_status', '客户自述的图纸 / 样品状态'], ['mold_sets', '模具套数'], ['mold_sets_unsure', '套数待确定'],
  ['industry', '应用行业'], ['requirements', '其他要求'], ['purchase_timing', '采购时间'], ['budget_status', '预算选项'],
  ['budget_min', '预算下限'], ['budget_max', '预算上限'], ['currency', '币种'], ['budget_basis', '预算单位'],
];
const consentFields = [
  ['processing_choice', '本次询价处理选择'], ['whatsapp_messages_opt_in', 'WhatsApp 项目消息许可'], ['calls_opt_in', '电话 / 语音许可'],
  ['notice_version', '询价告知版本'], ['privacy_version', '隐私说明版本'], ['privacy_processing_basis', '处理依据版本'],
  ['whatsapp_choice_text_version', 'WhatsApp 许可文本版本'], ['choice_recorded_at', '许可记录时间'], ['submitted_at', '提交时间'],
];
const sourceFields = [['page', '公开页面'], ['referrer', '来源网站'], ['utm_source', 'UTM 来源'], ['utm_medium', 'UTM 媒介'], ['utm_campaign', 'UTM 活动'], ['utm_content', 'UTM 内容'], ['utm_term', 'UTM 词条']];
const historyLabels = { created: '收到询盘', submitted: '收到询盘', reviewed: '更新审核与跟进', review_updated: '更新审核与跟进', updated: '更新审核与跟进', opt_out: '记录禁联请求', opt_out_whatsapp: '停止 WhatsApp 联系', opt_out_all: '停止所有主动联系', notification_retry: '重试内部提醒',customer_supplement:'客户补充项目说明',customer_withdrawn:'客户撤回本条询价' };

function OptionSelect({ name, value, onChange, all = false, disabled = false, label = fieldLabels[name] }) {
  return <label className="admin-field"><span>{label}</span><select name={name} value={value || ''} onChange={event => onChange(event.target.value)} disabled={disabled}>
    {all && <option value="">全部</option>}{reviewOptions[name].map(option => <option key={option} value={option}>{labels[option] || option}</option>)}
  </select></label>;
}

function PurchaseFilter({ name, value, onChange, disabled }) {
  const options = name === 'purchase_timing' ? timingOptions : budgetOptions;
  return <label className="admin-field"><span>{name === 'purchase_timing' ? '计划采购时间' : '预算状态'}</span><select name={name} value={value || ''} onChange={event => onChange(event.target.value)} disabled={disabled}><option value="">全部</option>{[...options, '__not_provided__'].map(option => <option key={option} value={option}>{labels[option] || option}</option>)}</select></label>;
}

function Notice({ children, error = false }) {
  return <div className={`admin-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>;
}

function ConfirmDialog({ action, onClose, onConfirm, busy }) {
  const ref = useRef(null);
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [channel, setChannel] = useState('whatsapp');
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  const deleting = action.type === 'delete';
  const exporting = action.type === 'export';
  return <dialog ref={ref} className="admin-dialog" aria-labelledby="confirm-heading" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); onConfirm({ confirmation, reason, channel }); }} autoComplete="off">
      <p className="admin-eyebrow">{deleting ? '不可恢复的操作' : exporting ? '客户资料导出' : '尊重客户的联系选择'}</p>
      <h2 id="confirm-heading">{deleting ? '确认删除此询盘？' : exporting ? '导出当前筛选结果？' : '记录禁联请求'}</h2>
      {deleting ? <><p>客户资料、许可记录、跟进备注与通知记录将被删除。最少的禁联记录仍会保留，避免再次联系已退出的客户。</p><label className="admin-field"><span>输入完整询盘编号以确认：<strong>{action.reference}</strong></span><input value={confirmation} onChange={event => setConfirmation(event.target.value)} spellCheck="false" required autoFocus disabled={busy} /></label></>
        : exporting ? <p>导出包含客户资料，最多 1,000 条。请仅用于本次询价管理，并妥善保存下载文件。导出不会更改筛选或发送任何客户消息。</p>
          : <><p>记录客户停止联系的请求。已有许可不会覆盖禁联设置。</p><label className="admin-field"><span>停止联系范围</span><select value={channel} onChange={event => setChannel(event.target.value)} disabled={busy}><option value="whatsapp">停止 WhatsApp 联系，保留允许的邮件回复</option><option value="all">停止所有主动联系</option></select></label><label className="admin-field"><span>请求说明（选填）</span><textarea rows={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></label></>}
      <div className="admin-actions"><button type="button" className="admin-button secondary" onClick={onClose} disabled={busy}>取消</button><button type="submit" className={`admin-button${deleting ? ' danger' : ''}`} disabled={busy || (deleting && confirmation !== action.reference)}>{busy ? '处理中…' : deleting ? '永久删除' : exporting ? '下载 CSV' : '确认禁联'}</button></div>
    </form>
  </dialog>;
}

function ContactPanel({ lead, locked }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [lead.reference]);
  const openContact = channel => {
    if (locked || !revealed) return;
    const destination = contactDestination(lead, channel);
    if (!destination) return;
    // Construct external contact URLs only after an explicit user action.
    // No form values or customer names enter the generic message.
    if (channel === 'whatsapp') window.open(destination, '_blank', 'noopener,noreferrer');
    else window.location.assign(destination);
  };
  return <section className="admin-section"><div className="admin-section-heading"><h3>联系人资料</h3><button className="admin-text-button" type="button" onClick={() => setRevealed(value => !value)} disabled={locked}>{revealed ? '收起联系方式' : '显示联系方式'}</button></div>
    {!revealed ? <p className="admin-muted">联系方式默认收起，按需查看。</p> : <dl className="admin-facts">{[['name', '姓名'], ['company', '公司'], ['email', '邮箱'], ['phone', '电话号码'], ['website', '公司网站']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{display(lead.payload?.[key])}</dd></div>)}</dl>}
    <div className="admin-permission-row"><span className={`admin-pill${canContact(lead, 'email') ? ' allowed' : ' blocked'}`}>邮箱{canContact(lead, 'email') ? '可回复本次项目' : '禁止主动联系'}</span><span className={`admin-pill${canContact(lead, 'whatsapp') ? ' allowed' : ' blocked'}`}>WhatsApp {canContact(lead, 'whatsapp') ? '项目消息已许可' : '不可主动联系'}</span></div>
    {lead.contact?.withdrawal_requested===true?<p className="admin-warning-text">客户已撤回本条项目询价，暂停此项目的主动跟进。其他项目与原始许可记录单独处理。</p>:lead.contact?.stopped === true && <p className="admin-warning-text">此客户已有渠道禁联记录，请严格按各渠道当前权限处理。</p>}
    <div className="admin-actions"><button type="button" className="admin-button secondary" disabled={locked || !revealed || !contactDestination(lead, 'email')} onClick={() => openContact('email')}>打开邮件客户端</button><button type="button" className="admin-button secondary" disabled={locked || !revealed || !contactDestination(lead, 'whatsapp')} onClick={() => openContact('whatsapp')}>在 WhatsApp 打开项目对话</button></div>
    <p className="admin-help">点击只会打开对应应用，不会自动发送。WhatsApp 消息许可不包含营销或语音通话。</p>
  </section>;
}

function LeadDetail({ lead, busy, locked, requiresRefresh, onReload, onUpdate, onRetry, onAction }) {
  const [review, setReview] = useState(() => ({ ...emptyReview(), ...lead.review }));
  const [note, setNote] = useState('');
  useEffect(() => { setReview({ ...emptyReview(), ...lead.review }); setNote(''); }, [lead.reference, lead.revision]);
  const changeReview = (key, value) => setReview(current => ({ ...current, [key]: value }));
  const notificationState = lead.notification?.state;
  return <article className="admin-detail" aria-busy={busy}>
    <div className="admin-detail-title"><div><p className="admin-eyebrow">询盘详情</p><h2>{lead.reference}</h2><p className="admin-muted">收到于 {dateText(lead.created_at)} · 更新于 {dateText(lead.updated_at)}</p></div><button type="button" className="admin-button secondary small" onClick={onReload} disabled={busy}>重新载入</button></div>
    {requiresRefresh && <Notice error>当前显示的版本可能已过期。请先重新载入并核对，再继续保存或联系客户。本地未保存的修改会在重新载入后丢弃。</Notice>}
    <ContactPanel lead={lead} locked={locked || busy || requiresRefresh} />
    {lead.customer&&<section className="admin-section"><h3>客户自助更新</h3>{lead.customer.withdrawn&&<Notice>客户已于{dateText(lead.customer.withdrawn_at)}撤回本条询价。请核对已有邮件和WhatsApp中的项目跟进，后台不会替你删除外部对话。</Notice>}{!lead.customer.supplements?.length?<p className="admin-muted">暂无客户补充说明。</p>:<ol className="admin-history">{lead.customer.supplements.map(item=><li key={item.id}><time>{dateText(item.created_at)}</time><p>{display(item.note)}</p></li>)}</ol>}<p className="admin-help">补充说明单独保存，原始询价与内部审核保持可追溯。客户看不到内部备注和筛选结果。</p></section>}
    <details className="admin-section admin-disclosure"><summary>询价来源快照</summary><p className="admin-help">仅保留可用的公开页面、来源网站和活动标签。未知来源显示未提供；这些是浏览器提供的参考，不代表身份核验或确定的广告归因。首次来源仅限本次页面会话，不跨刷新追踪。</p>{[['first', '首次可用来源'], ['submission', '提交时来源']].map(([touch, heading]) => <section key={touch}><h4>{heading}</h4><dl className="admin-facts">{sourceFields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{display(lead.payload?.source?.[touch]?.[key])}</dd></div>)}</dl></section>)}</details>
    <section className="admin-section"><h3>客户原始项目资料</h3><p className="admin-help">以下保留客户提交内容。自述资料不代表已经核验或收到图纸。</p><dl className="admin-facts">{originalFields.map(([key, label]) => <div className={['description', 'requirements'].includes(key) ? 'full' : ''} key={key}><dt>{label}</dt><dd>{key === 'budget_basis' && lead.payload?.[key] === 'per_mold_set' ? '每套模具' : display(lead.payload?.[key])}</dd></div>)}</dl></section>
    <section className="admin-section"><h3>审核与跟进</h3><p className="admin-help">按观察事实判断。单套模具、2D 图纸 / 样品、免费邮箱、缺少预算或未选 WhatsApp 都不应自动降级。</p>
      <form onSubmit={event => { event.preventDefault(); onUpdate({ revision: lead.revision, review, note }); }} autoComplete="off">
        <fieldset className="admin-review-grid" disabled={busy || locked || requiresRefresh}><legend className="admin-sr-only">审核字段</legend>{Object.keys(reviewOptions).map(key => <OptionSelect key={key} name={key} value={review[key]} onChange={value => changeReview(key, value)} />)}<label className="admin-field"><span>负责人</span><input maxLength={120} value={review.owner || ''} onChange={event => changeReview('owner', event.target.value)} /></label><label className="admin-field"><span>下次跟进日期</span><input type="date" value={review.next_follow_up || ''} onChange={event => changeReview('next_follow_up', event.target.value)} /></label><label className="admin-field full"><span>本次跟进备注（选填）</span><textarea rows={4} maxLength={4000} value={note} onChange={event => setNote(event.target.value)} placeholder="记录客观核验、项目进展或客户请求" /></label></fieldset>
        <div className="admin-actions"><button className="admin-button" type="submit" disabled={busy || locked || requiresRefresh}>{busy ? '保存中…' : '保存审核与备注'}</button><span className="admin-help">版本 {lead.revision} · 并发更新时会提示核对</span></div>
      </form>
    </section>
    <section className="admin-section"><div className="admin-section-heading"><h3>内部提醒</h3><span className={`admin-pill${notificationState === 'sent' ? ' allowed' : notificationState === 'failed' ? ' blocked' : ''}`}>{labels[notificationState] || '状态待确认'}</span></div><p className="admin-muted">尝试次数：{Number.isSafeInteger(lead.notification?.attempts) ? lead.notification.attempts : 0}</p><p className="admin-help">内部提醒失败不会撤销已保存的询盘。尚未配置通知服务时，重试也不会被标记为发送成功。</p><button type="button" className="admin-button secondary" disabled={busy || locked || requiresRefresh || ['sent', 'sending'].includes(notificationState)} onClick={onRetry}>重试内部提醒</button></section>
    <details className="admin-section admin-disclosure"><summary>独立许可与告知记录</summary><dl className="admin-facts">{consentFields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{display(lead.consents?.[key])}</dd></div>)}</dl><p className="admin-help">许可原始记录与当前禁联权限分开保留；已有许可不能覆盖后续退出请求。</p></details>
    <section className="admin-section"><h3>操作与跟进记录</h3>{!lead.history?.length ? <p className="admin-muted">暂无记录。</p> : <ol className="admin-history">{lead.history.map((item, index) => <li key={index}><div><strong>{historyLabels[item.action] || '记录更新'}</strong><time>{dateText(item.created_at)}</time></div>{item.note && <p>{display(item.note)}</p>}</li>)}</ol>}</section>
    <section className="admin-section admin-danger-zone"><h3>客户退出与删除</h3><p className="admin-help">禁联用于执行停止联系请求；删除用于移除询盘资料。请按客户请求范围操作。</p><div className="admin-actions"><button type="button" className="admin-button secondary" disabled={busy || locked || requiresRefresh} onClick={() => onAction('opt-out')}>记录禁联请求</button><button type="button" className="admin-button danger-outline" disabled={busy || locked || requiresRefresh} onClick={() => onAction('delete')}>删除此询盘</button></div></section>
  </article>;
}

export function AdminApp() {
  const client = useMemo(() => createAdminClient(), []);
  const alive = useRef(true);
  const detailSequence = useRef(0);
  const listSequence = useRef(0);
  const detailPane = useRef(null);
  const [session, setSession] = useState(null);
  const [view, setView] = useState('leads');
  const [authLoading, setAuthLoading] = useState(true);
  const [credentialExpired, setCredentialExpired] = useState(false);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [list, setList] = useState({ items: [], total: 0, page: 1, pageSize: 25 });
  const [listLoading, setListLoading] = useState(false);
  const [lead, setLead] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [dialog, setDialog] = useState(null);

  function fail(cause) {
    if (!alive.current) return;
    const safeError = cause instanceof AdminApiError ? cause : new AdminApiError('failed');
    setError(safeError);
    setSuccess('');
    if (['auth_required', 'forbidden'].includes(safeError.kind)) {
      detailSequence.current++; listSequence.current++;
      setSession(null); setLead(null); setList({ items: [], total: 0, page: 1, pageSize: 25 }); setDialog(null); setDetailLoading(false); setListLoading(false);
    }
    if (safeError.kind === 'csrf') { setCredentialExpired(true); setDialog(null); }
  }

  async function loadList(nextFilters) {
    const sequence = ++listSequence.current;
    setListLoading(true); setError(null);
    try {
      const result = await client.search(nextFilters);
      if (!alive.current || sequence !== listSequence.current) return;
      setList(result); setAppliedFilters(nextFilters);
    } catch (cause) {
      if (alive.current && sequence === listSequence.current) { setList({ items: [], total: 0, page: nextFilters.page, pageSize: nextFilters.pageSize }); fail(cause); }
    } finally { if (alive.current && sequence === listSequence.current) setListLoading(false); }
  }

  async function authenticate() {
    detailSequence.current++; listSequence.current++;
    setAuthLoading(true); setError(null); setSuccess(''); setSession(null); setLead(null); setDialog(null); setDetailLoading(false); setListLoading(false); setRequiresRefresh(false);
    setList({ items: [], total: 0, page: 1, pageSize: 25 });
    try {
      const nextSession = await client.session();
      if (!alive.current) return;
      setSession(nextSession); setCredentialExpired(false);
      await loadList({ ...defaultFilters(), ...draftFilters, page: 1 });
      const linked=window.location.pathname.match(/^\/admin\/leads\/([^/]+)\/?$/)?.[1];
      if(alive.current&&isReference(linked))await selectLead(linked);
    } catch (cause) { fail(cause); }
    finally { if (alive.current) setAuthLoading(false); }
  }

  useEffect(() => { authenticate(); return () => { alive.current = false; client.destroy(); }; }, []);

  async function selectLead(reference) {
    const sequence = ++detailSequence.current;
    setDetailLoading(true); setLead(null); setRequiresRefresh(false); setError(null); setSuccess('');
    try {
      const result = await client.get(reference);
      if (alive.current && sequence === detailSequence.current) {
        setLead(result);
        window.history.replaceState(null,'','/admin/leads/'+encodeURIComponent(reference)+'/');
        if (window.matchMedia('(max-width:760px)').matches) requestAnimationFrame(() => detailPane.current?.scrollIntoView({ block: 'start', behavior: 'auto' }));
      }
    } catch (cause) { if (sequence === detailSequence.current) fail(cause); }
    finally { if (alive.current && sequence === detailSequence.current) setDetailLoading(false); }
  }

  async function saveReview(input) {
    if (!lead || busy || credentialExpired || requiresRefresh) return;
    setBusy(true); setError(null); setSuccess('');
    try {
      const result = await client.update(lead.reference, input);
      if (!alive.current) return;
      setLead(result); setSuccess('审核与跟进记录已保存。');
      await loadList(appliedFilters);
    } catch (cause) { if (alive.current) { setRequiresRefresh(true); fail(cause); } }
    finally { if (alive.current) setBusy(false); }
  }

  async function retryNotification() {
    if (!lead || busy || credentialExpired || requiresRefresh) return;
    setBusy(true); setError(null); setSuccess('');
    try {
      const notification = await client.retryNotification(lead.reference);
      if (!alive.current) return;
      setLead(current => current && { ...current, notification });
      setSuccess(notification.state === 'sent' ? '内部提醒已发送。' : notification.state === 'failed' ? '内部提醒仍未发送，请检查通知服务。' : '已核对通知状态；尚未确认发送成功。');
    } catch (cause) { if (alive.current) { setRequiresRefresh(true); fail(cause); } }
    finally { if (alive.current) setBusy(false); }
  }

  async function confirmAction(input) {
    if (!dialog || busy || credentialExpired) return;
    setBusy(true); setError(null); setSuccess('');
    try {
      if (dialog.type === 'export') {
        const blob = await client.export(appliedFilters);
        if (!alive.current) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `exactmec-inquiries-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.append(anchor); anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setSuccess('CSV 已准备下载，请妥善保管客户资料。');
      } else if (dialog.type === 'delete') {
        await client.delete(dialog.reference, { revision: dialog.revision, confirmation: input.confirmation });
        if (!alive.current) return;
        setLead(null); setSuccess('询盘已删除。必要的禁联记录仍保留。');
        await loadList({ ...appliedFilters, page: 1 });
      } else {
        const result = await client.optOut(dialog.reference, { revision: dialog.revision, channel: input.channel, reason: input.reason });
        if (!alive.current) return;
        setLead(result); setSuccess('禁联请求已记录，当前联系权限已更新。');
        await loadList(appliedFilters);
      }
      if (alive.current) setDialog(null);
    } catch (cause) {
      if (alive.current) {
        if (dialog.type !== 'export') setRequiresRefresh(true);
        setDialog(null); fail(cause);
      }
    } finally { if (alive.current) setBusy(false); }
  }

  const updateFilter = (key, value) => setDraftFilters(current => ({ ...current, [key]: value }));
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return <div className="admin-app"><a className="admin-skip-link" href="#admin-main">跳转到管理内容</a><header className="admin-header"><a className="admin-brand" href="/" aria-label="返回 ExactMec 网站"><img src="/brand/horizontal-web.webp?v=2" alt="ExactMec" /></a><span className="admin-header-divider" /><span className="admin-workspace-name">运营工作台</span><div className="admin-account">{session && <span>{session.user.email}</span>}<button type="button" className="admin-button secondary small" onClick={authenticate} disabled={authLoading || busy}>{authLoading ? '验证中…' : '重新验证'}</button></div></header>
    <nav className="admin-workspace-tabs" aria-label="后台功能"><button type="button" aria-current={view === 'leads' ? 'page' : undefined} disabled={busy || !session} onClick={() => { setView('leads'); setError(null); setSuccess(''); }}>询价管理</button><button type="button" aria-current={view === 'content' ? 'page' : undefined} disabled={busy || !session} onClick={() => { setView('content'); setError(null); setSuccess(''); }}>内容与发布</button></nav>
    <main id="admin-main" className="admin-main"><div className="admin-page-heading"><div><p className="admin-eyebrow">EXACTMEC · {view === 'leads' ? 'INQUIRIES' : 'CONTENT & PUBLISHING'}</p><h1>{view === 'leads' ? '询盘与项目跟进' : '网站内容与发布'}</h1><p>{view === 'leads' ? '审核客户资料，记录项目进度，按许可安排联系。' : '编辑页面与素材，预览保存的草稿，确认后发布或撤回。'}</p></div>{session && view === 'leads' && <button type="button" className="admin-button secondary" disabled={busy || credentialExpired || listLoading} onClick={() => setDialog({ type: 'export' })}>导出当前结果</button>}</div>
      {session?.localSynthetic === true && <Notice>本机联调环境 · 仅使用合成测试记录。此处的会话和操作不代表生产访问权限或真实通知服务已启用。</Notice>}
      {error && <Notice error>{error.message}{credentialExpired && ' 使用页面右上角的“重新验证”刷新凭据。'}</Notice>}
      {success && view === 'leads' && <Notice>{success}</Notice>}
      {session && view === 'leads' && <MetricsSummary/>}
      {!session ? <section className="admin-auth-panel"><div className="admin-lock-symbol" aria-hidden="true">◎</div><h2>{authLoading ? '正在验证访问权限' : '需要授权访问'}</h2><p>{authLoading ? '验证完成后加载受保护的后台资料。' : '请先完成已配置的访问验证，再重新载入。本页不会使用示例记录替代接口结果。'}</p>{!authLoading && <button className="admin-button" type="button" onClick={authenticate}>重新验证并加载</button>}</section> : view === 'content' ? <ContentWorkspace client={client} locked={credentialExpired} onAccessError={fail} onBusyChange={setBusy} /> : <>
        <form className="admin-filter-panel" onSubmit={event => { event.preventDefault(); loadList({ ...draftFilters, page: 1 }); }} autoComplete="off"><div className="admin-search-row"><label className="admin-field admin-search"><span>搜索询盘</span><input type="search" placeholder="公司、联系人、邮箱或项目关键词" maxLength={120} value={draftFilters.search} onChange={event => updateFilter('search', event.target.value)} disabled={credentialExpired} /></label><OptionSelect name="status" value={draftFilters.status} all onChange={value => updateFilter('status', value)} disabled={credentialExpired} /><button className="admin-button" type="submit" disabled={listLoading || credentialExpired || busy}>查询</button><button className="admin-text-button" type="button" disabled={listLoading || credentialExpired || busy} onClick={() => { const fresh = defaultFilters(); setDraftFilters(fresh); loadList(fresh); }}>重置</button></div>
          <details className="admin-filter-more"><summary>更多筛选</summary><div className="admin-filter-grid">
            {['authenticity', 'fit', 'readiness', 'qualification', 'priority'].map(key => <OptionSelect key={key} name={key} value={draftFilters[key]} all onChange={value => updateFilter(key, value)} disabled={credentialExpired} />)}
            <label className="admin-field"><span>图纸 / 样品自述</span><select value={draftFilters.drawing_status} onChange={event => updateFilter('drawing_status', event.target.value)} disabled={credentialExpired}><option value="">全部</option>{drawingOptions.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
            {['purchase_timing', 'budget_status'].map(key => <PurchaseFilter key={key} name={key} value={draftFilters[key]} onChange={value => updateFilter(key, value)} disabled={credentialExpired} />)}
            <label className="admin-field"><span>每页条数</span><select value={draftFilters.pageSize} onChange={event => updateFilter('pageSize', Number(event.target.value))} disabled={credentialExpired}>{[10, 25, 50, 100].map(size => <option key={size} value={size}>{size} 条</option>)}</select></label>
          </div><p className="admin-help">预算和采购时间仅作辅助筛选；未填资料与未定 / 不便透露分别显示，不比较不同币种金额。</p></details>
        </form>
        <div className="admin-layout"><section className="admin-list-pane" aria-label="询盘列表" aria-busy={listLoading}><div className="admin-list-heading"><h2>询盘列表 <span>{list.total}</span></h2><span className="admin-muted">{listLoading ? '加载中…' : `第 ${list.page} / ${totalPages} 页`}</span></div>
          {listLoading ? <div className="admin-empty" role="status">正在加载询盘…</div> : !list.items.length ? <div className="admin-empty">{error ? '尚未加载有效结果，请修复上方错误后重试。' : '没有符合条件的询盘。'}</div> : <ul className="admin-lead-list">{list.items.map(item => <li key={item.reference}><button type="button" className={`admin-lead-card${lead?.reference === item.reference ? ' selected' : ''}`} aria-pressed={lead?.reference === item.reference} onClick={() => selectLead(item.reference)} disabled={busy || credentialExpired}><span className="admin-card-top"><strong>{item.reference}</strong><span className="admin-priority">{reviewOptions.priority.includes(item.review?.priority) ? item.review.priority : '—'}</span></span><span className="admin-card-project">{display(item.payload?.component)}</span><span className="admin-card-meta"><span>{display(item.payload?.country)}</span><time>{dateText(item.created_at)}</time></span><span className="admin-card-bottom"><span className="admin-pill">{item.customer?.withdrawn?'客户已撤回':labels[item.review?.status] || '待核对'}</span><span className="admin-muted">{labels[item.notification?.state] || '通知状态待确认'}</span></span></button></li>)}</ul>}
          <nav className="admin-pagination" aria-label="询盘分页"><button type="button" className="admin-button secondary small" disabled={listLoading || list.page <= 1 || credentialExpired || busy} onClick={() => loadList({ ...appliedFilters, page: list.page - 1 })}>上一页</button><span>{list.page} / {totalPages}</span><button type="button" className="admin-button secondary small" disabled={listLoading || list.page >= totalPages || credentialExpired || busy} onClick={() => loadList({ ...appliedFilters, page: list.page + 1 })}>下一页</button></nav>
        </section><div className="admin-detail-pane" ref={detailPane}>{detailLoading ? <div className="admin-detail-placeholder" role="status">正在加载询盘详情…</div> : lead ? <LeadDetail key={lead.reference} lead={lead} busy={busy} locked={credentialExpired} requiresRefresh={requiresRefresh} onReload={() => selectLead(lead.reference)} onUpdate={saveReview} onRetry={retryNotification} onAction={type => setDialog({ type, reference: lead.reference, revision: lead.revision })} /> : <div className="admin-detail-placeholder"><span className="admin-placeholder-icon" aria-hidden="true">↗</span><h2>选择一条询盘</h2><p>查看原始项目资料、独立许可和跟进记录。</p></div>}</div></div>
      </>}
    </main><footer className="admin-footer">ExactMec · 仅限授权运营人员 · 客户资料仅用于本次询价与项目跟进 · 草稿需确认发布后才对外生效</footer>{dialog && <ConfirmDialog action={dialog} busy={busy} onClose={() => setDialog(null)} onConfirm={confirmAction} />}
  </div>;
}
