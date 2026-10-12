import { prisma } from '@/lib/prisma';
import { tenantContext,isResponse } from '@/lib/tenant';
import { noStoreJson } from '@/lib/http';
export const runtime='nodejs';
export async function GET(request:Request){const t=await tenantContext(request);if(isResponse(t))return t;const u=new URL(request.url);const q=u.searchParams.get('q')?.trim();const status=u.searchParams.get('status');const rows=await prisma.conversation.findMany({where:{merchantId:t.merchantId,...(q?{OR:[{customer:{name:{contains:q,mode:'insensitive'}}},{externalThreadId:{contains:q,mode:'insensitive'}}]}:{}),...(status&&['OPEN','PENDING','RESOLVED','HUMAN_REVIEW'].includes(status)?{status:status as never}:{})},include:{customer:{select:{id:true,name:true,phone:true,city:true}},channelConnection:{select:{displayName:true,status:true}},assignedTo:{select:{id:true,name:true}},messages:{orderBy:{sentAt:'desc'},take:1}},orderBy:{lastMessageAt:'desc'},take:100});return noStoreJson({conversations:rows});}
