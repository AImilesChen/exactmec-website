// Private customer workspace routes are deliberately outside the marketing
// route/sitemap contract. They never contain credentials or personal details.
export function resolveCustomerRoute(pathname) {
  if (pathname === '/account' || pathname === '/account/') return {status: 308, redirect: '/account/login/'};
  if (pathname === '/account/login' || pathname === '/account/inquiries') return {status: 308, redirect: pathname + '/'};
  if (pathname === '/account/login/' || pathname === '/account/inquiries/') return {status: 200, path: pathname};
  const match = pathname?.match(/^\/account\/inquiries\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})(\/?)$/);
  if (match) return match[2] ? {status: 200, path: pathname} : {status: 308, redirect: pathname + '/'};
  return {status: 404};
}
