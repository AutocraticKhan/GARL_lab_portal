#!/usr/bin/env node
/* ============================================================
   generate_key_blob.js — encode the Supabase anon/publishable key
   so it can live in js/supabase.js without being readable in
   plain text.

   Produces an XOR-encrypted base64 blob plus a split passphrase.
   js/supabase.js decodes them synchronously once at load, so all
   existing consumers keep working unchanged.

   Usage:
     node tools/generate_key_blob.js "<ANON_KEY>" ["<PASSPHRASE>"]

   If the passphrase is omitted, a random one is generated
   (recommended). Paste the printed values into js/supabase.js
   (_KEY_B64 and _KEY_PASS_FRAGMENTS). Re-run this after rotating
   the key in Supabase → Settings → API.
   ============================================================ */

'use strict';

const crypto = require('crypto');

const [, , key, passArg] = process.argv;

if (!key) {
  console.error('Usage: node tools/generate_key_blob.js "<ANON_KEY>" ["<PASSPHRASE>"]');
  process.exit(1);
}

const pass = passArg || crypto.randomBytes(12).toString('hex');

function xorEncode(text, passphrase) {
  const bytes = Buffer.from(text, 'utf8');
  const out = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ (passphrase.charCodeAt(i % passphrase.length) & 0xff);
  }
  return out.toString('base64');
}

function xorDecode(b64, passphrase) {
  const buf = Buffer.from(b64, 'base64');
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ (passphrase.charCodeAt(i % passphrase.length) & 0xff);
  }
  return out.toString('utf8');
}

const blob = xorEncode(key, pass);
if (xorDecode(blob, pass) !== key) {
  console.error('Round-trip check FAILED — do not use this output.');
  process.exit(1);
}

// Split the passphrase into 3 fragments so no single string in the
// source is the decode key.
const n = Math.ceil(pass.length / 3);
const frags = [pass.slice(0, n), pass.slice(n, 2 * n), pass.slice(2 * n)];
if (frags.join('') !== pass) {
  console.error('Fragment split check FAILED — do not use this output.');
  process.exit(1);
}

console.log('Round-trip check: OK');
console.log('\nPaste into js/supabase.js:\n');
console.log("const _KEY_B64 = '" + blob + "';");
console.log(
  'const _KEY_PASS_FRAGMENTS = [' +
    frags.map((f) => "'" + f + "'").join(', ') +
    '];'
);