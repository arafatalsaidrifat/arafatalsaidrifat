import { jsonError,noStoreJson } from '@/lib/http';
import { constantTimeBearerMatches } from '@/lib/rate-limit';
import { processPendingOutbox } from '@/lib/worker';
export const runtime='nodejs';export const maxDuration=60;
function authorized(request:Request){const secret=process.env.CRON_SECRET??'';if(secret.length<32||/^(replace|change|example|placeholder)/i.test(secret))return false;const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')??null;return constantTimeBearerMatches(token,secret);}
export async function GET(request:Request){if(!authorized(request))return jsonError('Worker authorization failed.',401,'UNAUTHORIZED');try{const results=await processPendingOutbox(25);return noStoreJson({ok:true,processed:results.length,results:results.map(({id,claimed,completed,retry})=>({id,claimed,completed,retry}))});}catch(e){return jsonError(e instanceof Error?e.message:'Worker failed.',503,'WORKER_FAILED');}}
export const POST=GET;
