import { prisma } from '@/lib/prisma';
import { tenantContext,isResponse } from '@/lib/tenant';
import { noStoreJson } from '@/lib/http';
export const runtime='nodejs';
export async function GET(request:Request){
 const ctx=await tenantContext(request);if(isResponse(ctx))return ctx;
 const [orders,products,payments,conversations,shipments,revenue,recentOrders,lowStockProducts]=await Promise.all([
  prisma.order.count({where:{merchantId:ctx.merchantId}}),
  prisma.product.count({where:{merchantId:ctx.merchantId,active:true}}),
  prisma.payment.count({where:{merchantId:ctx.merchantId,status:{in:['PENDING','REVIEW']}}}),
  prisma.conversation.count({where:{merchantId:ctx.merchantId,status:{in:['OPEN','PENDING','HUMAN_REVIEW']}}}),
  prisma.shipment.count({where:{merchantId:ctx.merchantId,status:{in:['BOOKED','PICKED_UP','IN_TRANSIT']}}}),
  prisma.order.aggregate({where:{merchantId:ctx.merchantId,status:{not:'CANCELLED'}},_sum:{totalPaisa:true}}),
  prisma.order.findMany({where:{merchantId:ctx.merchantId},include:{customer:{select:{name:true,city:true}},items:{select:{id:true,quantity:true,productName:true}},payment:{select:{status:true,method:true}},shipment:{select:{status:true,provider:true,trackingCode:true}}},orderBy:{createdAt:'desc'},take:8}),
  prisma.product.findMany({where:{merchantId:ctx.merchantId,active:true},select:{stockQuantity:true,lowStockThreshold:true}})
 ]);
 const lowStock=lowStockProducts.filter(p=>p.stockQuantity<=p.lowStockThreshold).length;
 return noStoreJson({metrics:{orders,products,paymentsNeedingReview:payments,openConversations:conversations,activeShipments:shipments,revenuePaisa:revenue._sum.totalPaisa??0,lowStock},recentOrders});
}
