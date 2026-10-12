import { toNextJsHandler } from 'better-auth/next-js';
import { auth,authIsConfigured } from '@/lib/auth';
import { NextResponse } from 'next/server';
export const runtime='nodejs';
const handlers=toNextJsHandler(auth);
function guard(handler:(request:Request)=>Promise<Response>){return async(request:Request)=>{if(!authIsConfigured())return NextResponse.json({error:{code:'AUTH_NOT_CONFIGURED',message:'Auth is unavailable until database and production secret settings are configured.'}},{status:503,headers:{'Cache-Control':'no-store'}});return handler(request);};}
export const GET=guard(handlers.GET);
export const POST=guard(handlers.POST);
