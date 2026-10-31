/**
 * Encrypt data/solutions.json (AES-256-CBC) so it can be fetched by the database from a public URL
 * without exposing answers, then decrypted in SQL with pgcrypto's decrypt_iv(). Prints the one-time
 * key and IV; they are never written to disk. Only needed when loading without psql access
 * (with psql, apply the gitignored supabase/seed/solutions.sql instead).
 */
import { createCipheriv, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const key = randomBytes(32)
const iv = randomBytes(16)
const cipher = createCipheriv('aes-256-cbc', key, iv)
const plain = readFileSync(join(ROOT, 'data', 'solutions.json'))
const enc = Buffer.concat([cipher.update(plain), cipher.final()])
writeFileSync(join(ROOT, 'data', 'solutions.enc'), enc.toString('base64'))
console.log(JSON.stringify({ bytes: enc.length, key: key.toString('hex'), iv: iv.toString('hex') }))
