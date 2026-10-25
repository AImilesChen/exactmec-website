export const reviewOptions = Object.freeze({
  status: ['New', 'Reviewing', 'Need More Information', 'Contacted', 'Quotation Sent', 'Won', 'Lost', 'Spam'],
  authenticity: ['Unreviewed', 'Needs Verification', 'Consistent', 'Inconsistent'],
  fit: ['Needs Review', 'Mold Project', 'Out of Scope'],
  readiness: ['Self-reported', 'Awaiting Drawings or Sample', 'Received to Review', 'Ready for Quotation'],
  qualification: ['Unreviewed', 'Need More Information', 'Qualified', 'Not Qualified'],
  priority: ['A', 'B', 'C'],
});
export const drawingOptions = Object.freeze(['Clear 2D part drawings', '3D part model / drawings', 'Both 2D and 3D part drawings', 'A physical sample', 'Photos / concept only', 'Not sure yet']);

export const labels = Object.freeze({
  New: '新询盘', Reviewing: '审核中', 'Need More Information': '待补充资料', Contacted: '已联系', 'Quotation Sent': '已发报价', Won: '已成交', Lost: '未成交', Spam: '垃圾信息',
  Unreviewed: '未审核', 'Needs Verification': '待核验', Consistent: '信息一致', Inconsistent: '信息不一致',
  'Needs Review': '待判断', 'Mold Project': '模具项目', 'Out of Scope': '业务范围外',
  'Self-reported': '客户自述', 'Awaiting Drawings or Sample': '等待图纸或样品', 'Received to Review': '已收资料待审核', 'Ready for Quotation': '可进入报价审核',
  Qualified: '符合要求', 'Not Qualified': '暂不符合', pending: '等待通知', sending: '通知处理中', sent: '通知已发送', failed: '通知失败', disabled: '通知未配置',
  'Clear 2D part drawings': '清晰的 2D 零件图', '3D part model / drawings': '3D 零件模型 / 图纸', 'Both 2D and 3D part drawings': '同时有 2D 与 3D 图纸',
  'A physical sample': '实物样品', 'Photos / concept only': '仅有照片 / 概念', 'Not sure yet': '尚未确定',
});

export const defaultFilters = () => ({ search: '', status: '', qualification: '', priority: '', drawing_status: '', page: 1, pageSize: 25 });
export const emptyReview = () => ({ status: 'New', authenticity: 'Unreviewed', fit: 'Needs Review', readiness: 'Self-reported', qualification: 'Unreviewed', priority: 'B', owner: '', next_follow_up: '' });
export const isReference = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(value);

export function canContact(lead, channel) {
  if (!lead || !['email', 'whatsapp'].includes(channel)) return false;
  // The server incorporates both independent permission and retained suppression.
  // stopped means *any* channel is stopped; it must not suppress an allowed email reply.
  return lead.contact?.[`${channel}_allowed`] === true;
}

export function contactDestination(lead, channel) {
  if (!canContact(lead, channel)) return null;
  if (channel === 'email') {
    const email = lead.payload?.email;
    return typeof email === 'string' && email.length <= 240 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) && !/[\r\n]/.test(email)
      ? `mailto:${encodeURIComponent(email)}` : null;
  }
  const raw = lead.payload?.phone;
  if (typeof raw !== 'string' || !/^\+[\d\s().-]+$/.test(raw) || !isReference(lead.reference)) return null;
  const number = raw.replace(/\D/g, '');
  if (!/^[1-9]\d{6,14}$/.test(number)) return null;
  const message = `Hello, this is ExactMec following up about your mold inquiry. Reference: ${lead.reference}.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export const display = value => value == null || value === '' ? '未提供' : typeof value === 'boolean' ? (value ? '是' : '否') : String(value);
export const dateText = value => {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};
