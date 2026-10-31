const googleManagement = () => typeof window !== 'undefined' && window.location?.pathname?.startsWith('/manage/');

export const adminApiPath = path => googleManagement() ? path.replace(/^\/api\/admin\//, '/api/manage/') : path;
export const adminPagePath = path => googleManagement() ? path.replace(/^\/admin\//, '/manage/') : path;
