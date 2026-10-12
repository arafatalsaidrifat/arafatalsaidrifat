import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { tenantContext,isResponse,writeAudit } from '@/lib/tenant';
import { jsonError,noStoreJson } from '@/lib/http';
export const runtime='nodejs';
const schema=z.object({name:z.string().trim().min(2).max(100).optional(),timezone:z.enum(['Asia/Dhaka','UTC']).optional(),insideDhakaPaisa:z.number().int().min(0).max(10_000_000).optional(),outsideDhakaPaisa:z.number().int().min(0).max(10_000_000).optional()}).refine(x=>Object.keys(x).length>0);
export async function PATCH(request:Request,route:{params:Promise<{id:string}>}){const t=await tenantContext(request,['OWNER','ADMIN']);if(isResponse(t))return t;const {id}=await route.params;if(id!==t.merchantId)return jsonError('Workspace scope mismatch.',403,'TENANT_FORBIDDEN');let raw;try{raw=await request.json();}catch{return jsonError('Invalid JSON.');}const p=schema.safeParse(raw);if(!p.success)return jsonError(p.error?.issues[0]?.message??'Invalid workspace settings.');const merchant=await prisma.merchant.update({where:{id:t.merchantId},data:p.data});await writeAudit({merchantId:t.merchantId,actorId:t.user.id,action:'workspace.settings_updated',entityType:'Merchant',entityId:id,details:p.data});return noStoreJson({merchant});}
