import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const key = (secret: string) => createHmac('sha256', secret).update('push-encryption:v1').digest();
/** Domain-separated verifier provides unique token ownership without storing a plaintext index. */
export const tokenDigest = (secret: string, token: string) => createHmac('sha256', secret).update(`push-token:v1:${token}`).digest('hex');
/** AES-GCM protects token storage; neither ciphertext nor decrypted tokens belong in diagnostics. */
export function encryptToken(secret: string, token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const data = Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');
}
/** Authentication failure propagates only to the caller's safe internal-error boundary. */
export function decryptToken(secret: string, value: string): string {
  const data = Buffer.from(value,'base64url');
  const cipher = createDecipheriv('aes-256-gcm',key(secret),data.subarray(0,12));
  cipher.setAuthTag(data.subarray(12,28));
  return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8');
}
