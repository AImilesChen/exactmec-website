import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdminApiError } from './client.mjs';
import { buildContentPatch, createContentForm } from './content-model.mjs';
import { dateText } from './model.mjs';

function ContentExportDialog({ busy, onClose, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => { if (dialog.open) dialog.close(); }; }, []);
  return <dialog className="admin-dialog" ref={ref} aria-labelledby="content-export-heading" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}><form onSubmit={event => { event.preventDefault(); onConfirm(); }}>
    <p className="admin-eyebrow">内容交接文件</p><h2 id="content-export-heading">导出这份内容草稿？</h2><p>将下载当前已保存草稿与固定版式合并后的审核文件。此操作不会更新公开网站、提交代码或触发部署。编辑内容仍须完成文案、设计与合规审核。</p><div className="admin-actions"><button className="admin-button secondary" type="button" disabled={busy} onClick={onClose}>取消</button><button className="admin-button" type="submit" disabled={busy} autoFocus>{busy ? '准备中…' : '确认导出审核文件'}</button></div>
  </form></dialog>;
}

function Baseline({ children }) { return <details className="admin-content-baseline"><summary>对照当前源文案</summary><div>{children}</div></details>; }

function ContentEditor({ detail, busy, requiresRefresh, onSave, onExport, onReload }) {
  const [form, setForm] = useState(() => createContentForm(detail));
  const [reviewedSource, setReviewedSource] = useState(false);
  const [validation, setValidation] = useState('');
  const initial = useMemo(() => createContentForm(detail), [detail]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const locked = busy || requiresRefresh;
  const page = detail.page;
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const updateSection = (index, key, value) => setForm(current => ({ ...current, sections: current.sections.map((section, at) => at === index ? { ...section, [key]: value } : section) }));
  const updateFaq = (index, key, value) => setForm(current => ({ ...current, faqs: current.faqs.map((faq, at) => at === index ? { ...faq, [key]: value } : faq) }));
  const save = event => {
    event.preventDefault();
    if (locked || (detail.stale && !reviewedSource)) return;
    const patch = buildContentPatch(form);
    if (!patch) { setValidation('请填写全部标题与 SEO 描述；描述应为单段文字，不插入换行。正文仅支持纯文字：每模块最多 20 段、每段 4,000 字；列表最多 30 项、每项 1,000 字；FAQ 最多 30 项。请勿填入 HTML。'); return; }
    setValidation('');
    onSave({ revision: detail.revision, sourceHash: detail.sourceHash, patch });
  };
  return <article className="admin-detail admin-content-editor" aria-busy={busy}>
    <div className="admin-detail-title"><div><p className="admin-eyebrow">内容草稿 · {page.phase}</p><h2>{page.h1 || page.title}</h2><p className="admin-muted">固定路径：{page.path} · 草稿版本 {detail.revision}</p></div><button type="button" className="admin-button secondary small" disabled={busy} onClick={onReload}>重新载入</button></div>
    <div className="admin-notice">编辑仅保存为内部草稿，公开网站不会自动变化。卡片、表格、链接、图片、路径与模块顺序随固定版式审核，本页不提供修改。</div>
    {requiresRefresh && <div className="admin-notice is-error" role="alert">版本或请求结果需要核对。请先重新载入再编辑；重新载入会丢弃本地未保存修改。</div>}
    {detail.stale && <div className="admin-notice is-error" role="alert">当前源文案已更新。这份草稿基于旧版，请逐项对照下方“当前源文案”后重新保存。源文案已经移除的旧模块不会带入新保存。完成核对前不能导出。</div>}
    {validation && <div className="admin-notice is-error" role="alert">{validation}</div>}
    <form onSubmit={save} autoComplete="off" noValidate>
      <fieldset className="admin-content-fields" disabled={locked}><legend>页面标题与搜索摘要</legend>
        <label className="admin-field"><span>SEO 标题 <small>{form.title.length} / 160</small></span><input value={form.title} maxLength={160} required onChange={event => update('title', event.target.value)} /></label>
        {detail.stale && <Baseline><p>{page.title}</p></Baseline>}
        <label className="admin-field"><span>主标题 H1 <small>{form.h1.length} / 240</small></span><input value={form.h1} maxLength={240} required onChange={event => update('h1', event.target.value)} /></label>
        {detail.stale && <Baseline><p>{page.h1}</p></Baseline>}
        <label className="admin-field"><span>SEO 描述 <small>{form.description.length} / 500</small></span><textarea rows={3} maxLength={500} required value={form.description} onChange={event => update('description', event.target.value)} /></label>
        <p className="admin-help">使用单段搜索摘要，不插入换行；输入框会自然折行。</p>
        {detail.stale && <Baseline><p>{page.description}</p></Baseline>}
      </fieldset>
      <section className="admin-section"><h3>正文模块</h3><p className="admin-help">展开需要修改的模块。段落以空行分隔，列表每行一项；仅修改已有文字区域。</p>
        <div className="admin-content-accordions">{form.sections.map((section, index) => {
          const source = page.sections.find(item => item.id === section.id);
          return <details className="admin-content-module" key={section.id}><summary><span>{String(index + 1).padStart(2, '0')}</span><strong>{section.heading || '未填写模块标题'}</strong></summary><fieldset disabled={locked} className="admin-content-module-fields"><legend className="admin-sr-only">模块 {index + 1}</legend><label className="admin-field"><span>模块标题</span><input maxLength={240} required value={section.heading} onChange={event => updateSection(index, 'heading', event.target.value)} /></label>
            {Object.hasOwn(section, 'paragraphsText') && <label className="admin-field"><span>正文段落 <small>空行分段</small></span><textarea rows={7} value={section.paragraphsText} onChange={event => updateSection(index, 'paragraphsText', event.target.value)} /></label>}
            {Object.hasOwn(section, 'bulletsText') && <label className="admin-field"><span>要点列表 <small>每行一项</small></span><textarea rows={5} value={section.bulletsText} onChange={event => updateSection(index, 'bulletsText', event.target.value)} /></label>}
            {(source.cards || source.table || source.cta) && <p className="admin-content-fixed">固定版式：{source.cards ? `${source.cards.length} 张卡片` : ''}{source.cards && (source.table || source.cta) ? '、' : ''}{source.table ? '表格' : ''}{source.table && source.cta ? '、' : ''}{source.cta ? '行动按钮 / 链接' : ''}。这些内容保留原样，需在版式审核中调整。</p>}
            {detail.stale && <Baseline><h4>{source.heading}</h4>{source.paragraphs?.map((text, at) => <p key={at}>{text}</p>)}{source.bullets && <ul>{source.bullets.map((text, at) => <li key={at}>{text}</li>)}</ul>}</Baseline>}
          </fieldset></details>;
        })}</div>
        {!form.sections.length && <p className="admin-muted">此页面没有可编辑正文模块。</p>}
      </section>
      <section className="admin-section"><h3>常见问题 FAQ</h3><p className="admin-help">问题最多 500 字，回答最多 4,000 字。没有新增承诺依据时，请保留业务与合规边界。</p><div className="admin-content-accordions">{form.faqs.map((faq, index) => <details className="admin-content-module" key={index}><summary><span>{String(index + 1).padStart(2, '0')}</span><strong>{faq.q || '未填写问题'}</strong></summary><fieldset className="admin-content-module-fields" disabled={locked}><legend className="admin-sr-only">问题 {index + 1}</legend><label className="admin-field"><span>问题</span><input maxLength={500} required value={faq.q} onChange={event => updateFaq(index, 'q', event.target.value)} /></label><label className="admin-field"><span>回答</span><textarea rows={5} maxLength={4000} required value={faq.a} onChange={event => updateFaq(index, 'a', event.target.value)} /></label></fieldset></details>)}</div>{!form.faqs.length && <p className="admin-muted">此页面没有 FAQ。</p>}{detail.stale && <Baseline>{page.faqs?.map((faq, index) => <div key={index}><h4>{faq.q}</h4><p>{faq.a}</p></div>)}</Baseline>}</section>
      {detail.stale && <label className="admin-content-review-choice"><input type="checkbox" checked={reviewedSource} onChange={event => setReviewedSource(event.target.checked)} disabled={locked} /><span>我已对照当前源文案审阅这份草稿，将以当前源文案为基础重新保存。</span></label>}
      <div className="admin-content-save-bar"><div><strong>{dirty ? '有未保存的修改' : '当前草稿未作本地修改'}</strong><p className="admin-help">切换页面或离开前请保存。保存和导出均不会发布。</p></div><div className="admin-actions"><button className="admin-button" type="submit" disabled={locked || (detail.stale && !reviewedSource)}>{busy ? '处理中…' : '保存草稿'}</button><button className="admin-button secondary" type="button" disabled={locked || dirty || detail.stale} onClick={onExport}>导出审核文件</button></div></div>
    </form>
  </article>;
}

export function ContentWorkspace({ client, locked, onAccessError, onBusyChange }) {
  const alive = useRef(true);
  const detailSequence = useRef(0);
  const detailPane = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [exporting, setExporting] = useState(false);

  function fail(cause) {
    if (!alive.current) return;
    const safe = cause instanceof AdminApiError ? cause : new AdminApiError('failed');
    setError(safe); setSuccess('');
    if (['auth_required', 'forbidden', 'csrf'].includes(safe.kind)) onAccessError(safe);
  }
  async function loadList() {
    setLoading(true);
    try { const result = await client.listContent(); if (alive.current) setItems(result); }
    catch (cause) { if (alive.current) { setItems([]); fail(cause); } }
    finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => { loadList(); return () => { alive.current = false; onBusyChange(false); }; }, []);
  async function select(id) {
    const sequence = ++detailSequence.current;
    setDetailLoading(true); setDetail(null); setRequiresRefresh(false); setError(null); setSuccess('');
    try {
      const result = await client.getContent(id);
      if (alive.current && detailSequence.current === sequence) {
        setDetail(result);
        if (window.matchMedia('(max-width:760px)').matches) requestAnimationFrame(() => detailPane.current?.scrollIntoView({ block: 'start', behavior: 'auto' }));
      }
    } catch (cause) { if (detailSequence.current === sequence) fail(cause); }
    finally { if (alive.current && detailSequence.current === sequence) setDetailLoading(false); }
  }
  function setWorking(value) { setBusy(value); onBusyChange(value); }
  async function save(input) {
    if (busy || locked || requiresRefresh || !detail) return;
    setWorking(true); setError(null); setSuccess('');
    try {
      const result = await client.saveContent(detail.page.id, input);
      if (!alive.current) return;
      setDetail(result); setSuccess('草稿已保存，未发布。');
      await loadList();
    } catch (cause) { if (alive.current) { if (!['invalid', 'rate_limit'].includes(cause.kind)) setRequiresRefresh(true); fail(cause); } }
    finally { if (alive.current) setWorking(false); }
  }
  async function exportDraft() {
    if (busy || locked || requiresRefresh || detail?.stale || !detail) return;
    setWorking(true); setError(null); setSuccess('');
    try {
      const blob = await client.exportContent(detail.page.id, { sourceHash: detail.sourceHash });
      if (!alive.current) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `exactmec-content-${detail.page.id}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess('审核文件已准备下载，公开网站未作更改。');
    } catch (cause) { if (alive.current) { if (['conflict', 'source_conflict'].includes(cause.kind)) setRequiresRefresh(true); fail(cause); } }
    finally { if (alive.current) { setWorking(false); setExporting(false); } }
  }
  const normalized = query.trim().toLowerCase();
  const filtered = items.filter(item => `${item.h1} ${item.title} ${item.path}`.toLowerCase().includes(normalized));
  return <section aria-label="内容草稿管理" className="admin-content-workspace">
    {error && <div className="admin-notice is-error" role="alert">{error.message}</div>}{success && <div className="admin-notice" role="status">{success}</div>}
    <div className="admin-layout admin-content-layout"><aside className="admin-list-pane"><div className="admin-content-list-search"><label className="admin-field"><span>查找页面</span><input type="search" maxLength={120} value={query} onChange={event => setQuery(event.target.value)} placeholder="标题或固定路径" disabled={busy || locked} /></label></div><div className="admin-list-heading"><h2>可编辑页面 <span>{filtered.length}</span></h2><button className="admin-text-button" type="button" disabled={busy || loading || locked} onClick={loadList}>刷新列表</button></div>
      {loading ? <div className="admin-empty" role="status">正在加载页面…</div> : !filtered.length ? <div className="admin-empty">{error ? '页面尚未加载，请修复错误后重试。' : '没有匹配页面。'}</div> : <ul className="admin-lead-list">{filtered.map(item => <li key={item.id}><button className={`admin-lead-card${detail?.page.id === item.id ? ' selected' : ''}`} type="button" aria-pressed={detail?.page.id === item.id} disabled={busy || locked} onClick={() => select(item.id)}><span className="admin-card-top"><strong>{item.phase === 'P0' ? 'P0 页面' : '后续阶段页面'}</strong><span className="admin-pill">{item.draftUpdatedAt ? '有保存草稿' : '源文案'}</span></span><span className="admin-card-project">{item.h1 || item.title}</span><span className="admin-content-route">{item.path}</span>{item.draftUpdatedAt && <span className="admin-muted">草稿更新：{dateText(item.draftUpdatedAt)}</span>}</button></li>)}</ul>}
    </aside><div className="admin-detail-pane" ref={detailPane}>{detailLoading ? <div className="admin-detail-placeholder" role="status">正在加载内容…</div> : detail ? <ContentEditor key={`${detail.page.id}-${detail.revision}`} detail={detail} busy={busy || locked} requiresRefresh={requiresRefresh} onSave={save} onExport={() => setExporting(true)} onReload={() => select(detail.page.id)} /> : <div className="admin-detail-placeholder"><span className="admin-placeholder-icon" aria-hidden="true">✎</span><h2>选择一个页面</h2><p>编辑页面文字并保存审核草稿。固定版式和公开网站保持原样。</p></div>}</div></div>
    {exporting && <ContentExportDialog busy={busy} onClose={() => setExporting(false)} onConfirm={exportDraft} />}
  </section>;
}
