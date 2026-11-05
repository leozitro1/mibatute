import { randomUUID, createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';

export function signImageKitUpload({ folder, fileType, extension, maxBytes, publicKey, privateKey }) {
  const uploadParameters = {
    folder,
    fileName: `${randomUUID()}.${extension}`,
    useUniqueFileName: 'true',
    overwriteFile: 'false',
    checks: `"file.mime" = "${fileType}" AND "file.size" <= ${maxBytes}`,
  };
  const iat = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: publicKey })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ ...uploadParameters, iat, exp: iat + 300 })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', privateKey).update(signingInput).digest('base64url');
  return { token: `${signingInput}.${signature}`, uploadParameters };
}
