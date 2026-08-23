import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptBackup, encryptBackup, isEncryptedBackup } from '../js/backup-crypto.js';

test('encrypted backups round-trip and reject a wrong password', async () => {
  const original = { version: 3, transactions: [{ amountCents: 1234, date: '2026-08-23' }] };
  const envelope = await encryptBackup(original, 'correct horse battery staple');
  assert.equal(isEncryptedBackup(envelope), true);
  assert.deepEqual(await decryptBackup(envelope, 'correct horse battery staple'), original);
  await assert.rejects(() => decryptBackup(envelope, 'wrong-password'), /密码错误/);
});

test('backup passwords must be at least eight characters', async () => {
  await assert.rejects(() => encryptBackup({}, 'short'), /至少需要 8 个字符/);
});
