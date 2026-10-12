import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/crypto';
import { providerFetch } from './couriers/types';
export class MetaDeliveryOutcomeUnknownError extends Error { constructor(message:string){super(message);this.name='MetaDeliveryOutcomeUnknownError';} }
export class MetaPermanentDeliveryError extends Error { constructor(message:string){super(message);this.name='MetaPermanentDeliveryError';} }
export async function sendMetaText(input:{merchantId:string;conversationId:string;text:string}){
  const conversation=await prisma.conversation.findFirst({where:{id:input.conversationId,merchantId:input.merchantId},include:{channelConnection:true}});
  if(!conversation)throw new Error('Conversation not found in the current workspace.');
  const connection=conversation.channelConnection;
  if(!connection||connection.status!=='CONNECTED'||!connection.accessTokenCiphertext)throw new Error('This social channel is not connected. The message was not sent externally.');
  const version=process.env.META_GRAPH_API_VERSION;
  if(!version||!/^v\d+\.\d+$/.test(version))throw new Error('META_GRAPH_API_VERSION must be configured before outbound sending.');
  const token=decryptSecret(connection.accessTokenCiphertext);
  const base=(process.env.META_GRAPH_API_BASE_URL||'https://graph.facebook.com').replace(/\/$/,'');
  let path:string,body:unknown;
  if(conversation.platform==='WHATSAPP'){
    const recipient=conversation.externalThreadId?.replace(/^WHATSAPP:/,'');if(!recipient)throw new Error('WhatsApp recipient ID is missing.');
    path=`/${version}/${connection.externalAccountId}/messages`;
    body={messaging_product:'whatsapp',to:recipient,type:'text',text:{body:input.text}};
  } else {
    const recipient=conversation.externalThreadId?.replace(/^(MESSENGER|INSTAGRAM):/,'');if(!recipient)throw new Error('Social recipient ID is missing.');
    path=`/${version}/${connection.externalAccountId}/messages`;
    body={recipient:{id:recipient},message:{text:input.text},messaging_type:'RESPONSE'};
  }
  let res:Response;
  try { res=await providerFetch(`${base}${path}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)}); }
  catch { throw new MetaDeliveryOutcomeUnknownError('The connection ended before the send result could be confirmed. Delivery is marked UNKNOWN and will not be automatically resent. Check the provider inbox before any manual retry.'); }
  const raw=await res.json().catch(()=>({}));
  if(!res.ok){
    if(res.status>=500)throw new MetaDeliveryOutcomeUnknownError(`Meta returned HTTP ${res.status}; provider-side delivery may be uncertain. The message will not be automatically resent.`);
    if(res.status===429)throw new Error('Meta rate-limited this send. The queued job can safely retry after backoff.');
    throw new MetaPermanentDeliveryError(`Meta rejected the send with HTTP ${res.status}. Check channel scopes, recipient, and messaging policy; the message was not retried.`);
  }
  const externalId=String((raw as {message_id?:string;messages?:Array<{id?:string}>}).message_id??(raw as {messages?:Array<{id?:string}>}).messages?.[0]?.id??'');
  if(!externalId)throw new MetaDeliveryOutcomeUnknownError('Meta accepted the HTTP request but did not return a message ID. Delivery is marked UNKNOWN and will not be automatically resent. Check the provider inbox before any manual retry.');
  return raw;
}
