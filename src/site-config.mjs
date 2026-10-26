// Public business configuration only. Never put API tokens or customer data here.
export const business = Object.freeze({
  brand: 'EXACTMEC',
  siteOrigin: 'https://exactmec.com',
  operator: '台州巽风贸易有限公司',
  contactEmail: 'sales@exactmec.com',
  correspondenceAddress: 'No. 46 Jinqing Avenue, Luqiao, Taizhou, Zhejiang, China',
  correspondenceAddressNative: '中国浙江台州路桥金清大道46号',
  whatsappNumber: '8615990661727',
  whatsappDisplay: '+86 159 9066 1727',
});

export function createSiteConfig(values = {}) {
  const originValue = String(values.origin || '').trim();
  let origin = '';
  if (originValue) {
    const url = new URL(originValue);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('SITE_ORIGIN must be a confirmed HTTPS origin without a path.');
    if (['localhost', '127.0.0.1', 'example.com', 'example.test'].includes(url.hostname) || url.hostname.endsWith('.test')) throw new Error('SITE_ORIGIN must be the actual confirmed domain.');
    origin = url.origin;
  }
  const release = values.release === true;
  const legalApproved = values.legalApproved === true;
  const backendVerified = values.backendVerified === true;
  const contactEmail = String(values.contactEmail || business.contactEmail).trim();
  const contactEmailVerified = values.contactEmailVerified === true;
  const inquiryEnabled = release && legalApproved && backendVerified && contactEmailVerified && values.inquiryEnabled === true;
  return Object.freeze({
    ...business, origin, contactEmail, contactEmailVerified, release, legalApproved, backendVerified,
    inquiryEnabled, inquiryEndpoint: '/api/inquiries',
    analyticsEnabled: false, // Remains off until a provider and actual consent flow are approved.
    whatsappUrl: 'https://wa.me/' + business.whatsappNumber,
  });
}

const env = import.meta.env || {};
export const siteConfig = createSiteConfig({
  origin: env.VITE_SITE_ORIGIN || business.siteOrigin,
  contactEmail: env.VITE_CONTACT_EMAIL || business.contactEmail,
  contactEmailVerified: env.VITE_CONTACT_EMAIL_VERIFIED === 'true',
  release: env.VITE_SITE_RELEASE === 'true',
  legalApproved: env.VITE_LEGAL_APPROVED === 'true',
  backendVerified: env.VITE_BACKEND_VERIFIED === 'true',
  inquiryEnabled: env.VITE_INQUIRY_ENABLED === 'true',
});

export function releaseBlockers(config) {
  const issues = [];
  if (!config.origin) issues.push('正式域名尚未确认');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail)) issues.push('有效的域名联系邮箱尚未确认');
  if (!config.contactEmailVerified) issues.push('域名邮箱收发尚未实际验证');
  if (!config.legalApproved) issues.push('法律页面、服务商、地址与资料保留规则尚未完成发布确认');
  if (!config.backendVerified) issues.push('询价后端保存、幂等、权限与通知尚未联调验收');
  if (!config.inquiryEnabled) issues.push('线上询价采集保持关闭');
  return issues;
}
