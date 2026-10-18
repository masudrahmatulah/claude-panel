import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth.js';

/** Utilitas sekali jalan: cetak PANEL_PASSWORD_HASH dan PANEL_SESSION_SECRET. */
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = process.argv[2] ?? (await rl.question('Password baru: '));
rl.close();

if (password.length < 10) {
  console.error('Password minimal 10 karakter.');
  process.exit(1);
}

console.log(`PANEL_PASSWORD_HASH='${await hashPassword(password)}'`);
console.log(`PANEL_SESSION_SECRET='${randomBytes(32).toString('base64url')}'`);
