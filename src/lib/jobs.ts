import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@/lib/prisma';
let redis:IORedis | null = null;
let queue:Queue | null = null;
function getQueue(){if(!process.env.REDIS_URL)return null;if(!queue){redis=new IORedis(process.env.REDIS_URL,{maxRetriesPerRequest:null,tls:process.env.REDIS_URL.startsWith('rediss:')?{}:undefined});queue=new Queue('fcommerce-outbox',{connection:redis,defaultJobOptions:{attempts:8,backoff:{type:'exponential',delay:1000},removeOnComplete:1000,removeOnFail:5000}});}return queue;}
export async function enqueueOutbox(input:{merchantId?:string|null;type:string;payload:unknown;idempotencyKey:string}){
 const row=await prisma.outboxJob.upsert({where:{idempotencyKey:input.idempotencyKey},update:{},create:{merchantId:input.merchantId??null,type:input.type,payload:input.payload as never,idempotencyKey:input.idempotencyKey}});
 const q=getQueue();if(q)await q.add(input.type,{outboxJobId:row.id},{jobId:row.id});return row;
}
export async function closeQueue(){if(queue)await queue.close();if(redis)await redis.quit();queue=null;redis=null;}
