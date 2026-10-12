import { verifyBkashTransaction } from './bkash';
export { verifyBkashTransaction };
export function isPaymentProviderConfigured(method:string){if(method==='BKASH')return Boolean(process.env.BKASH_API_BASE_URL&&process.env.BKASH_APP_KEY&&process.env.BKASH_APP_SECRET&&process.env.BKASH_USERNAME&&process.env.BKASH_PASSWORD);if(method==='NAGAD')return Boolean(process.env.NAGAD_API_BASE_URL&&process.env.NAGAD_MERCHANT_ID&&process.env.NAGAD_PUBLIC_KEY&&process.env.NAGAD_PRIVATE_KEY);if(method==='ROCKET')return Boolean(process.env.ROCKET_VERIFICATION_URL&&process.env.ROCKET_API_KEY);return false;}
