import { prisma } from '@/lib/prisma';
import { tenantContext,isResponse } from '@/lib/tenant';
import { noStoreJson } from '@/lib/http';
export const runtime='nodejs';
export async function GET(request:Request){const t=await tenantContext(request);if(isResponse(t))return t;const reviews=await prisma.aiReview.findMany({where:{merchantId:t.merchantId},include:{conversation:{select:{id:true,platform:true,customer:{select:{name:true}}}},requestedBy:{select:{name:true}},},orderBy:{createdAt:'desc'},take:200});return noStoreJson({reviews});}
