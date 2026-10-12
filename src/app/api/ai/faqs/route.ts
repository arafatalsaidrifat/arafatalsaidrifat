import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { tenantContext,isResponse,writeAudit } from '@/lib/tenant';
import { jsonError,noStoreJson } from '@/lib/http';
export const runtime='nodejs';
const schema=z.object({question:z.string().trim().min(3).max(500),answer:z.string().trim().min(3).max(2500),enabled:z.boolean().default(true)});
export async function GET(request:Request){const t=await tenantContext(request);if(isResponse(t))return t;const faqs=await prisma.aiFaq.findMany({where:{merchantId:t.merchantId},orderBy:{createdAt:'asc'}});return noStoreJson({faqs});}
export async function POST(request:Request){const t=await tenantContext(request,['OWNER','ADMIN']);if(isResponse(t))return t;let raw;try{raw=await request.json();}catch{return jsonError('Invalid JSON.');}const p=schema.safeParse(raw);if(!p.success)return jsonError(p.error.issues[0]?.message??'Invalid FAQ.');const faq=await prisma.aiFaq.create({data:{merchantId:t.merchantId,...p.data}});await writeAudit({merchantId:t.merchantId,actorId:t.user.id,action:'ai.faq_created',entityType:'AiFaq',entityId:faq.id});return noStoreJson({faq},201);}
