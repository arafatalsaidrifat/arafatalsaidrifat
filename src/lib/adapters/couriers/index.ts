import { pathaoAdapter } from './pathao';
import { steadfastAdapter } from './steadfast';
import { shiprocketAdapter } from './shiprocket';
export const courierAdapters={PATHAO:pathaoAdapter,STEADFAST:steadfastAdapter,SHIPROCKET:shiprocketAdapter} as const;
export type CourierProvider=keyof typeof courierAdapters;
export function getCourierAdapter(provider:string){const p=provider.toUpperCase() as CourierProvider;const adapter=courierAdapters[p];if(!adapter)throw new Error('Unsupported courier provider.');return adapter;}
