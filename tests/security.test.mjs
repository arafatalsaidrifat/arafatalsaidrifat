import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  verifyMetaSignature,
  stableWebhookKey,
  validateWebhookVerifyToken,
  validateBengaliPhone,
} from '../src/lib/core/security.mjs';

test('Meta signature verification is HMAC-SHA256 over the exact raw body', () => {
  const body = Buffer.from('{"object":"page","entry":[]}');
  const secret = 'test-app-secret';
  const signature = `sha256=${createHmac('sha256',secret).update(body).digest('hex')}`;
  assert.equal(verifyMetaSignature(body,signature,secret),true);
  assert.equal(verifyMetaSignature(body,signature,'wrong-secret'),false);
  assert.equal(verifyMetaSignature(Buffer.from(body.toString()+' '),signature,secret),false);
  assert.equal(verifyMetaSignature(body,'sha1=abc',secret),false);
  assert.equal(verifyMetaSignature(body,null,secret),false);
  assert.equal(verifyMetaSignature(body,signature,''),false);
});

test('webhook verification tokens compare exact values and fail closed', () => {
  assert.equal(validateWebhookVerifyToken('expected-token','expected-token'),true);
  assert.equal(validateWebhookVerifyToken('expected-token','other-token'),false);
  assert.equal(validateWebhookVerifyToken('short','longer'),false);
  assert.equal(validateWebhookVerifyToken(null,'expected-token'),false);
  assert.equal(validateWebhookVerifyToken('expected-token',null),false);
});

test('stable webhook keys are deterministic and change with external message IDs', () => {
  const body = Buffer.from('raw webhook');
  assert.equal(stableWebhookKey('page','mid.123',body),stableWebhookKey('page','mid.123',body));
  assert.notEqual(stableWebhookKey('page','mid.123',body),stableWebhookKey('page','mid.124',body));
  assert.notEqual(stableWebhookKey('page','mid.123',body),stableWebhookKey('instagram','mid.123',body));
  assert.match(stableWebhookKey('page','',body),/^page:[a-f0-9]{64}$/);
});

test('Bangladesh phone validator accepts local and +88 format, rejects invalid ranges', () => {
  assert.equal(validateBengaliPhone('01712345678'),true);
  assert.equal(validateBengaliPhone('+8801712345678'),true);
  assert.equal(validateBengaliPhone('8801712345678'),true);
  assert.equal(validateBengaliPhone('01112345678'),false);
  assert.equal(validateBengaliPhone('0171234567'),false);
  assert.equal(validateBengaliPhone('abc'),false);
});
