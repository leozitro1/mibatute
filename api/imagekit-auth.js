import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed" });
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
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!accessToken) {
    return sendJson(res, 401, { error: "No autenticado." });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user?.id) {
    return sendJson(res, 401, { error: "Sesión inválida." });
  }

  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 10 * 60;
  const signature = crypto.createHmac("sha1", imagekitPrivateKey).update(`${token}${expire}`).digest("hex");

  return sendJson(res, 200, {
    token,
    expire,
    signature,
    publicKey: imagekitPublicKey,
    urlEndpoint: imagekitUrlEndpoint.replace(/\/+$/, ""),
  });
}
