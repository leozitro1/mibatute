import { supabase } from "../supabase/supabaseClient";
import { useLocalImages, uploadLocalImage } from './localImages';

const IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";

function normalizeEndpoint(urlEndpoint) {
  return String(urlEndpoint || import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || "").replace(/\/+$/, "");
}

function safeFileName(name = "imagen.webp") {
  return String(name || "imagen.webp")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 90);
}

function transformedUrl({ urlEndpoint, filePath, width }) {
  const endpoint = normalizeEndpoint(urlEndpoint);
  const path = String(filePath || "").startsWith("/") ? filePath : `/${filePath}`;
  return `${endpoint}/tr:w-${width},q-auto:eco,f-auto${path}`;
}

async function getImageKitAuth() {
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;

  if (!accessToken) throw new Error("Debes iniciar sesión para subir imágenes.");

  const res = await fetch("/api/imagekit-auth", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "No se pudo autenticar ImageKit.");

  return body;
}

export async function uploadImageKitImage({ file, folder, fileName }) {
  if (!file) return { success: false, error: "Archivo requerido." };

  try {
    if (useLocalImages) return await uploadLocalImage({ file, folder, fileName: safeFileName(fileName || file.name) });
    const auth = await getImageKitAuth();
    const form = new FormData();

    form.append("file", file);
    form.append("fileName", safeFileName(fileName || file.name || "imagen.webp"));
    form.append("publicKey", auth.publicKey);
    form.append("signature", auth.signature);
    form.append("expire", String(auth.expire));
    form.append("token", auth.token);
    form.append("useUniqueFileName", "true");
    if (folder) form.append("folder", folder);

    const res = await fetch(IMAGEKIT_UPLOAD_URL, {
      method: "POST",
      body: form,
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message || body?.error || "No se pudo subir la imagen.");

    const urlEndpoint = normalizeEndpoint(auth.urlEndpoint);
    const filePath = body.filePath || body.url?.replace(urlEndpoint, "") || "";

    return {
      success: true,
      fileId: body.fileId || "",
      filePath,
      url: body.url || transformedUrl({ urlEndpoint, filePath, width: 1000 }),
      thumbnailUrl: transformedUrl({ urlEndpoint, filePath, width: 500 }),
      detailUrl: transformedUrl({ urlEndpoint, filePath, width: 1000 }),
    };
  } catch (error) {
    return { success: false, error: error?.message || "Error subiendo imagen." };
  }
}
