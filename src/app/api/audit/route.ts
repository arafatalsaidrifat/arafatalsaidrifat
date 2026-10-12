import { prisma } from '@/lib/prisma';
import { tenantContext,isResponse } from '@/lib/tenant';
import { noStoreJson } from '@/lib/http';
export const runtime='nodejs';
export async function GET(request:Request){const t=await tenantContext(request,['OWNER','ADMIN']);if(isResponse(t))return t;const rows=await prisma.auditLog.findMany({where:{merchantId:t.merchantId},include:{actor:{select:{name:true,email:true}}},orderBy:{createdAt:'desc'},take:250});return noStoreJson({auditLogs:rows});}
