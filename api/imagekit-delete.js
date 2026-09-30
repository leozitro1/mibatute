import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const reply = (status, body) => res.status(status).json(body);
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!privateKey || !url || !key) return reply(500, { error: "Servicio de imagenes no configurado." });
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return reply(401, { error: "Sesion invalida." });
  const fileIds = req.body?.fileIds;
  if (!Array.isArray(fileIds) || fileIds.length > 4 || fileIds.some(id => typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id))) {
    return reply(400, { error: "Imagenes invalidas." });
  }
  const headers = { Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}` };
  try {
    // Validate every file before deleting any of them.
    const ids = [...new Set(fileIds)];
    for (const id of ids) {
      const details = await fetch(`https://api.imagekit.io/v1/files/${id}/details`, { headers });
      if (details.status === 404) continue;
      if (!details.ok) throw new Error("No se pudo verificar la imagen en ImageKit.");
      const file = await details.json();
      if (!file.filePath?.startsWith(`/mibatute/articulos/${data.user.id}/`)) {
        return reply(403, { error: "No tienes permiso para eliminar esta imagen." });
      }
    }
    for (const id of ids) {
      const result = await fetch(`https://api.imagekit.io/v1/files/${id}`, { method: "DELETE", headers });
      if (!result.ok && result.status !== 404) throw new Error("No se pudo eliminar la imagen de ImageKit. Intenta nuevamente.");
    }
    return reply(200, { success: true });
  } catch (err) {
    return reply(502, { error: err.message });
  }
}
