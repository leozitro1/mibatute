import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { imageUploadPolicy } from '../src/imagekit/uploadPolicy.js';
import { signImageKitUpload } from '../server/imagekitUploadToken.js';
import { reserveImageUpload } from '../src/imagekit/uploadQuota.js';

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Recarga la página para subir imágenes con la autorización actualizada." });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const imagekitPublicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const imagekitPrivateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const imagekitUrlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT || process.env.VITE_IMAGEKIT_URL_ENDPOINT;

  if (!supabaseUrl || !supabaseAnonKey || !imagekitPublicKey || !imagekitPrivateKey || !imagekitUrlEndpoint) {
    return sendJson(res, 500, { error: "ImageKit o Supabase no están configurados." });
  }

  const authHeader = req.headers.authorization || "";
  const accessToken = typeof authHeader === "string" ? authHeader.match(/^Bearer (\S+)$/i)?.[1] : "";

  if (!accessToken) {
    return sendJson(res, 401, { error: "No autenticado." });
  }

  let policy;
  try {
    policy = imageUploadPolicy(req.body || {});
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user?.id) {
    return sendJson(res, 401, { error: "Sesión inválida." });
  }

  if (policy.ownerId !== data.user.id) {
    return sendJson(res, 403, { error: "Solo puedes subir imágenes a tu propia carpeta." });
  }
  try {
    await reserveImageUpload(supabase, policy.scope);
  } catch (error) {
    if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
    return sendJson(res, error.status || 503, { error: error.message, code: error.code,
      retryAt: error.retryAt, retryAfter: error.retryAfter });
  }
  const authorization = signImageKitUpload({
    folder: req.body.folder,
    fileType: req.body.fileType,
    extension: policy.extension,
    maxBytes: policy.maxBytes,
    publicKey: imagekitPublicKey,
    privateKey: imagekitPrivateKey,
  });

  return sendJson(res, 200, {
    ...authorization,
    urlEndpoint: imagekitUrlEndpoint.replace(/\/+$/, ""),
  });
}
