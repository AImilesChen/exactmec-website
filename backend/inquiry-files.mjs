// Inquiry documents are private R2 objects. Public references never authorize a read.
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const MAX_MULTIPART_BYTES = MAX_TOTAL_BYTES + 1024 * 1024;
const extensions = new Set(['pdf','dwg','dxf','step','stp','igs','iges','x_t','sat','sldprt','prt','jpg','jpeg','png','webp']);
const drawingExtensions = new Set(['pdf','dwg','dxf','step','stp','igs','iges','x_t','sat','sldprt','prt']);
const photoExtensions = new Set(['jpg','jpeg','png','webp']);

export function fileExtension(name) {
  if (typeof name !== 'string' || name.length < 3 || name.length > 150 || /[\\/\u0000-\u001f\u007f]/.test(name)) return null;
  const extension = name.split('.').at(-1)?.toLowerCase();
  return extensions.has(extension) ? extension : null;
}

export function checkInquiryFiles(files, drawingStatus) {
  if (!Array.isArray(files) || files.length > MAX_FILES) return { error: 'files' };
  const drawings = ['Clear 2D part drawings','3D part model / drawings','Both 2D and 3D part drawings'].includes(drawingStatus);
  const concept = ['Photos / concept only','Not sure yet'].includes(drawingStatus);
  const sample = drawingStatus === 'A physical sample';
  let total = 0;
  let drawingCount = 0;
  for (const file of files) {
    const extension = fileExtension(file?.name);
    if (!extension || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE_BYTES) return { error: 'files' };
    if ((drawings && !drawingExtensions.has(extension)) || (concept && !photoExtensions.has(extension)) || sample) return { error: 'files' };
    total += file.size;
    if (total > MAX_TOTAL_BYTES) return { error: 'files' };
    if (drawingExtensions.has(extension)) drawingCount++;
  }
  if (drawings && drawingCount === 0) return { error: 'files' };
  return { error: null };
}

export async function readInquiryRequest(request) {
  if (!/^multipart\/form-data(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return null;
  const form = await request.formData();
  if ([...form.keys()].some(key => !['payload','files'].includes(key))) return { error: 'invalid_request' };
  const raw = form.get('payload');
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > 65536 || form.getAll('payload').length !== 1) return { error: 'invalid_request' };
  let input;
  try { input = JSON.parse(raw); if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(); }
  catch { return { error: 'invalid_request' }; }
  const files = form.getAll('files');
  if (files.some(file => typeof file === 'string')) return { error: 'files' };
  const checked = checkInquiryFiles(files, input.drawing_status);
  return checked.error ? { error: checked.error } : { input, files };
}

export async function fileMetadata(files) {
  return Promise.all(files.map(async file => {
    const bytes = await file.arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return { name: file.name, size: file.size, extension: fileExtension(file.name), sha256: Array.from(digest, b => b.toString(16).padStart(2,'0')).join('') };
  }));
}

export const fileKey = (reference, index) => `inquiries/${reference}/${index}`;

export async function removeInquiryFiles(bucket, reference, count) {
  if (!bucket || !Number.isSafeInteger(count) || count < 1 || count > MAX_FILES) return;
  await Promise.allSettled(Array.from({length:count},(_,index)=>bucket.delete(fileKey(reference,index))));
}
