import { prisma } from '@/lib/prisma';
import { tenantContext,isResponse } from '@/lib/tenant';
import { noStoreJson } from '@/lib/http';
export const runtime='nodejs';
export async function GET(request:Request){const t=await tenantContext(request);if(isResponse(t))return t;const u=new URL(request.url),status=u.searchParams.get('status');const rows=await prisma.payment.findMany({where:{merchantId:t.merchantId,...(status&&['PENDING','REVIEW','VERIFIED','REJECTED','FAILED','REFUNDED'].includes(status)?{status:status as never}:{})},include:{order:{select:{id:true,orderNumber:true,shippingName:true,totalPaisa:true,customer:{select:{name:true}}}},reviewedBy:{select:{name:true}}},orderBy:{createdAt:'desc'},take:200});return noStoreJson({payments:rows});}
