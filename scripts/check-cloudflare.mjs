import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--outdir','dist/worker-dry-run'],{
 cwd:root,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.join(root,'.wrangler/logs/dry-run.log')},
});
process.exitCode=result.status??1;
