import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { handleOutboxJob } from '@/lib/worker';
if(!process.env.REDIS_URL)throw new Error('REDIS_URL is required to start the BullMQ worker.');
const connection=new IORedis(process.env.REDIS_URL,{maxRetriesPerRequest:null});
const worker=new Worker('fcommerce-outbox',async job=>{const id=String((job.data as {outboxJobId:string}).outboxJobId);return handleOutboxJob(id);},{connection,concurrency:8});
worker.on('failed',(job,err)=>console.error('outbox_job_failed',{jobId:job?.id,errorName:err.name}));
console.info('F-Commerce OS outbox worker started.');
const shutdown=async()=>{await worker.close();await connection.quit();process.exit(0);};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
