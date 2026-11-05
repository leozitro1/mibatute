import { supabase } from "../supabase/supabaseClient";
import { useLocalImages, uploadLocalImage } from './localImages';
import { uploadDirectImage } from './uploadTransport.js';
import { imageUploadPolicy } from './uploadPolicy.js';

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

export async function uploadImageKitImage({ file, folder, fileName }) {
  if (!file) return { success: false, error: "Archivo requerido." };

  try {
    imageUploadPolicy({ folder, fileSize: file.size, fileType: file.type });
    if (useLocalImages) return await uploadLocalImage({ file, folder, fileName: safeFileName(fileName || file.name) });
    const { data } = await supabase.auth.getSession();
    const upload = await uploadDirectImage({ file, folder, accessToken: data?.session?.access_token });
    const { body } = upload;
    const urlEndpoint = normalizeEndpoint(upload.urlEndpoint);
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
