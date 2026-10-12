import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDER_STAGES,
  validOrderTransition,
  calculateOrderTotal,
  shippingFeePaisa,
  duplicateReferenceKey,
  safeProviderName,
} from '../src/lib/core/commerce.mjs';

test('order state machine only permits the defined forward transitions', () => {
  assert.deepEqual(ORDER_STAGES, ['PENDING','CONFIRMED','PROCESSING','PACKED','SHIPPED','DELIVERED','CANCELLED']);
  assert.equal(validOrderTransition('PENDING','CONFIRMED').ok, true);
  assert.equal(validOrderTransition('PACKED','SHIPPED').ok, true);
  assert.equal(validOrderTransition('SHIPPED','CANCELLED').ok, false);
  assert.equal(validOrderTransition('DELIVERED','PROCESSING').ok, false);
  assert.equal(validOrderTransition('CANCELLED','PENDING').ok, false);
  assert.equal(validOrderTransition('BOGUS','PENDING').ok, false);
});

test('order total calculations reconcile poisha exactly', () => {
  assert.deepEqual(calculateOrderTotal({items:[{quantity:2,unitPricePaisa:15999},{quantity:1,unitPricePaisa:10000}],discountPaisa:1999,shippingPaisa:8000}), {
    subtotalPaisa:41998, discountPaisa:1999, shippingPaisa:8000, totalPaisa:47999,
  });
});

test('money arithmetic rejects fractional or unsafe inputs', () => {
  assert.throws(() => calculateOrderTotal({items:[]}), /At least one/);
  assert.throws(() => calculateOrderTotal({items:[{quantity:0,unitPricePaisa:10}]}), /Quantity/);
  assert.throws(() => calculateOrderTotal({items:[{quantity:1.2,unitPricePaisa:10}]}), /Quantity/);
  assert.throws(() => calculateOrderTotal({items:[{quantity:1,unitPricePaisa:-1}]}), /Price/);
  assert.throws(() => calculateOrderTotal({items:[{quantity:1,unitPricePaisa:10}],discountPaisa:11}), /Discount/);
  assert.throws(() => calculateOrderTotal({items:[{quantity:2,unitPricePaisa:Number.MAX_SAFE_INTEGER}]}), /safe integer/);
});

test('shipping fees use configured rates with illustrative Bangladesh defaults', () => {
  assert.equal(shippingFeePaisa('Dhaka'),8000);
  assert.equal(shippingFeePaisa('ঢাকা'),8000);
  assert.equal(shippingFeePaisa('Gaibandha'),15000);
  assert.equal(shippingFeePaisa('Dhaka',9500,18000),9500);
  assert.equal(shippingFeePaisa('Chattogram',9500,18000),18000);
});

test('payment reference keys normalize whitespace and case but remain tenant-scoped', () => {
  assert.equal(duplicateReferenceKey('m-1','BKASH',' Ab c 123 '),'m-1:BKASH:ABC123');
  assert.equal(duplicateReferenceKey('m-1','BKASH','ABC123'),duplicateReferenceKey('m-1','BKASH',' ab c123'));
  assert.notEqual(duplicateReferenceKey('m-1','BKASH','ABC123'),duplicateReferenceKey('m-2','BKASH','ABC123'));
  assert.notEqual(duplicateReferenceKey('m-1','BKASH','ABC123'),duplicateReferenceKey('m-1','NAGAD','ABC123'));
  assert.equal(duplicateReferenceKey('m-1','BKASH','  '),null);
});

test('provider identifiers are sanitized before adapter selection', () => {
  assert.equal(safeProviderName('Pathao Courier!'),'pathao courier'.replaceAll(' ',''));
  assert.equal(safeProviderName('../../api'), 'api');
  assert.equal(safeProviderName('x'.repeat(100)).length,50);
});

import { normalizeShipmentStatus } from '../src/lib/core/shipment-status.mjs';
import { staleSendRecovery } from '../src/lib/core/outbox-recovery.mjs';

test('courier status parsing is conservative and does not infer transit for unknown values', () => {
  assert.equal(normalizeShipmentStatus('Delivered'), 'DELIVERED');
  assert.equal(normalizeShipmentStatus('in_transit'), 'IN_TRANSIT');
  assert.equal(normalizeShipmentStatus('shipment booked'), 'BOOKED');
  assert.equal(normalizeShipmentStatus('RTO returned to merchant'), 'RETURNED');
  assert.equal(normalizeShipmentStatus('shipment cancelled'), 'CANCELLED');
  assert.throws(() => normalizeShipmentStatus('undelivered'), /ambiguous/);
  assert.throws(() => normalizeShipmentStatus('unknown'), /Unrecognized/);
  assert.throws(() => normalizeShipmentStatus(''), /did not provide/);
});


test('stale outbound jobs retry only before external I/O begins', () => {
  assert.deepEqual(staleSendRecovery('QUEUED'), { action:'retry', messageStatus:'QUEUED', retry:true });
  assert.deepEqual(staleSendRecovery('RETRYABLE'), { action:'retry', messageStatus:'RETRYABLE', retry:true });
  assert.deepEqual(staleSendRecovery('SENDING'), { action:'mark_unknown', messageStatus:'UNKNOWN', retry:false });
  assert.deepEqual(staleSendRecovery('SENT'), { action:'complete', messageStatus:'SENT', retry:false });
  assert.equal(staleSendRecovery('UNKNOWN').retry, false);
  assert.equal(staleSendRecovery('FAILED').retry, false);
  assert.equal(staleSendRecovery('SOME_NEW_STATE').retry, false);
});
