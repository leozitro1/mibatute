// src/supabase/articleService.js
import { supabase } from "./supabaseClient";

const BUCKET = "articulos";
const MAX_IMAGES = 4;

// ===============================
// ✅ ESTÁNDAR DE IMÁGENES (GUARDIA EN SERVICE)
// ===============================
// Rechazar originales enormes (para evitar cuelgues al procesar canvas)
const MAX_ORIGINAL_MB = 8;

// Normalización (lo que realmente subimos)
const MAX_SIDE = 1200; // lado mayor
const OUT_FORMAT = "image/webp"; // "image/webp" o "image/jpeg"
const OUT_QUALITY = 0.75; // menor egress/storage sin sacrificar demasiado detalle

function bytesToMB(b) {
  return Math.round((b / (1024 * 1024)) * 100) / 100;
}

async function fileToImageBitmap(file) {
  // Respeta EXIF orientation en navegadores modernos
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return await createImageBitmap(file);
    }
  }

  // Fallback
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compressAndResizeImage(file) {
  if (!file) throw new Error("Archivo inválido.");
  if (!file.type?.startsWith("image/")) throw new Error("Solo se permiten imágenes.");

  // 1) Rechazar por peso original exagerado
  if (file.size > MAX_ORIGINAL_MB * 1024 * 1024) {
    throw new Error(
      `La imagen pesa ${bytesToMB(file.size)}MB. Máximo permitido: ${MAX_ORIGINAL_MB}MB.`
    );
  }

  // 2) Cargar bitmap/imagen
  const src = await fileToImageBitmap(file);
  const w = src.width;
  const h = src.height;

  // 3) Escala manteniendo proporción
  const maxDim = Math.max(w, h);
  const scale = maxDim > MAX_SIDE ? MAX_SIDE / maxDim : 1;

  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  // Si ya está pequeña y además ya es webp/jpeg razonable, podrías devolver igual.
  // Pero igual normalizamos para estandarizar formato/peso.
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No se pudo procesar la imagen (canvas).");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, outW, outH);

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), OUT_FORMAT, OUT_QUALITY);
  });

  if (!blob) throw new Error("No se pudo generar la imagen optimizada.");

  const ext = OUT_FORMAT === "image/webp" ? "webp" : "jpg";
  const baseName = (file.name || "foto").replace(/\.[^.]+$/, "");
  const newName = `${baseName}.${ext}`;

  return new File([blob], newName, { type: OUT_FORMAT });
}

async function ensureOptimizedImage(file) {
  // Si esto corre en un entorno sin DOM (muy raro en tu app),
  // no intentamos canvas y subimos original.
  if (typeof document === "undefined") return file;

  try {
    return await compressAndResizeImage(file);
  } catch (e) {
    // Si falla la optimización, mejor bloquear (para cumplir el estándar)
    // o si prefieres “no bloquear”, retorna original.
    // Yo lo dejo BLOQUEANDO para que sí se aplique el estándar.
    throw e;
  }
}

function normalizeMode(v) {
  const s = String(v || "").toLowerCase().trim();
  if (s === "regalo") return "donacion"; // ✅ alias viejo -> unificado
  if (s === "donación") return "donacion";
  if (s.includes("don")) return "donacion";
  if (s.includes("venta")) return "venta";
  return s || "donacion";
}

/**
 * ✅ Insert/Update “a prueba de columnas”
 * Intenta escribir subcategory/subcategoria solo si existen.
 */
async function safeInsertArticulos(payload) {
  const candidates = [
    payload,
    // fallback 1: sin subcategory/subcategoria
    (() => {
      const p = { ...payload };
      delete p.subcategory;
      delete p.subcategoria;
      return p;
    })(),
  ];

  let lastError = null;

  for (const p of candidates) {
    const { data, error } = await supabase.from("articulos").insert([p]).select("*").single();
    if (!error) return { data, error: null };

    lastError = error;

    if (error?.message && /Could not find the '(.+?)' column/i.test(error.message)) {
      continue;
    }
    break;
  }

  return { data: null, error: lastError || { message: "No se pudo insertar en articulos." } };
}

async function safeUpdateArticulos(articleId, patch) {
  let payload = { ...(patch || {}) };

  let { data, error } = await supabase
    .from("articulos")
    .update(payload)
    .eq("id", articleId)
    .select("*")
    .maybeSingle();

  if (error?.message && /Could not find the '(.+?)' column/i.test(error.message)) {
    const m = error.message.match(/Could not find the '(.+?)' column/i);
    const missing = m?.[1];

    if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
      delete payload[missing];
      ({ data, error } = await supabase
        .from("articulos")
        .update(payload)
        .eq("id", articleId)
        .select("*")
        .maybeSingle());
    }
  }

  return { data, error };
}

/**
 * Sube UNA imagen al bucket "articulos" en la carpeta del usuario.
 * Retorna { success, url, path }.
 *
 * ✅ NUEVO: optimiza antes de subir.
 */
export async function uploadArticleImage({ file, ownerId }) {
  if (!file) return { success: false, error: "Archivo (file) es requerido" };
  if (!ownerId) return { success: false, error: "ownerId es requerido" };

  let optimizedFile = file;

  try {
    optimizedFile = await ensureOptimizedImage(file);
  } catch (e) {
    return { success: false, error: e?.message || "No se pudo optimizar la imagen." };
  }

  const ext = (optimizedFile.name?.split(".").pop() || "jpg").toLowerCase();
  const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";

  const fileName = `${Date.now()}_${Math.random().toString(16).slice(2)}.${safeExt}`;
  const path = `${ownerId}/${fileName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, optimizedFile, {
    contentType: optimizedFile.type || "image/jpeg",
    cacheControl: "3600",
    upsert: false,
  });

  if (uploadError) return { success: false, error: uploadError.message };

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const baseUrl = pub?.publicUrl || "";
  const url = baseUrl ? `${baseUrl}?v=${Date.now()}` : "";

  return { success: true, url, path };
}

async function removeStorageFiles(paths = []) {
  const clean = Array.from(paths || []).filter(Boolean);
  if (!clean.length) return { success: true };

  const { error } = await supabase.storage.from(BUCKET).remove(clean);
  if (error) return { success: false, error: error.message };

  return { success: true };
}

/**
 * Inserta imágenes en la tabla articulo_imagenes, con positions consecutivos.
 * images: [{url, path}]
 */
async function insertArticleImages({ articuloId, ownerId, images }) {
  const list = Array.from(images || []).filter((x) => x?.url && x?.path);
  if (!list.length) return { success: true, data: [] };

  const { data: last, error: lastErr } = await supabase
    .from("articulo_imagenes")
    .select("position")
    .eq("articulo_id", articuloId)
    .order("position", { ascending: false })
    .limit(1);

  if (lastErr) return { success: false, error: lastErr.message };

  const startPos = (last?.[0]?.position ?? -1) + 1;

  const rows = list.map((img, i) => ({
    articulo_id: articuloId,
    owner_id: ownerId,
    url: img.url,
    path: img.path,
    position: startPos + i,
  }));

  const { data, error } = await supabase.from("articulo_imagenes").insert(rows).select("*");
  if (error) return { success: false, error: error.message };

  return { success: true, data };
}

/**
 * Trae un artículo y sus imágenes (ordenadas).
 */
export async function getArticleWithImages(articleId) {
  const { data, error } = await supabase
    .from("articulos")
    .select(
      `
      *,
      articulo_imagenes:articulo_imagenes (
        id, url, path, position, created_at
      )
    `
    )
    .eq("id", articleId)
    .order("position", { foreignTable: "articulo_imagenes", ascending: true })
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

/**
 * ✅ Sync opcional:
 * Mantiene articulos.imagenes = [urls...] según articulo_imagenes (ordenadas).
 * También intenta setear imagen_url_principal / image_url con la primera imagen.
 */
async function syncArticleImagesArray(articleId) {
  try {
    const { data: imgs, error } = await supabase
      .from("articulo_imagenes")
      .select("url, position")
      .eq("articulo_id", articleId)
      .order("position", { ascending: true });

    if (error) return { success: false, error: error.message };

    const urls = (Array.isArray(imgs) ? imgs : []).map((x) => x?.url).filter(Boolean);
    const first = urls[0] || null;

    await supabase
      .from("articulos")
      .update({
        imagenes: urls,
        ...(first ? { image_url: first, imagen_url_principal: first } : {}),
      })
      .eq("id", articleId);

    return { success: true, urls };
  } catch {
    return { success: true };
  }
}

/**
 * ✅ Publica un artículo nuevo y guarda de 1 a 4 imágenes.
 */
export async function publishArticle({ formData, files, user }) {
  if (!user?.id) return { success: false, error: "Usuario no autenticado" };

  const list = Array.from(files || []).filter(Boolean);
  if (list.length === 0) return { success: false, error: "Debes subir al menos 1 imagen" };
  if (list.length > MAX_IMAGES) return { success: false, error: `Máximo ${MAX_IMAGES} imágenes` };

  const rawMode = formData?.tipo ?? formData?.mode ?? "donacion";
  const mode = normalizeMode(rawMode);

  const title = String(formData?.titulo ?? formData?.title ?? "").trim();
  const category = formData?.categoria ?? formData?.category ?? null;
  const subcategory = formData?.subcategoria ?? formData?.subcategory ?? null;

  const payload = {
    owner_id: user.id,
    owner_name: user.user_metadata?.nombre || user.email || "Usuario",
    title,
    category,
    subcategory,
    subcategoria: subcategory,
    mode,
    price: mode === "venta" ? Number(formData?.precio ?? formData?.price ?? 0) : 0,
    city: formData?.ciudad ?? formData?.city ?? null,
    locality: formData?.localidad_es ?? formData?.locality ?? null,
    description: String(formData?.descripcion ?? formData?.description ?? "").trim(),
    status: "disponible",
    applicants: [],
  };

  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }

  const { data: articulo, error: artErr } = await safeInsertArticulos(payload);
  if (artErr) return { success: false, error: artErr.message || "No se pudo insertar artículo" };

  const uploaded = [];
  try {
    // ✅ Subir imágenes en paralelo (cada una se optimiza dentro de uploadArticleImage)
    const results = await Promise.all(list.map((file) => uploadArticleImage({ file, ownerId: user.id })));

    const failed = results.find((r) => !r?.success);
    if (failed) throw new Error(failed.error || "Error subiendo una imagen");

    for (const r of results) uploaded.push({ url: r.url, path: r.path });

    const ins = await insertArticleImages({
      articuloId: articulo.id,
      ownerId: user.id,
      images: uploaded,
    });

    if (!ins.success) throw new Error(ins.error);

    await syncArticleImagesArray(articulo.id);

    return { success: true, data: { ...articulo, images: ins.data } };
  } catch (e) {
    await removeStorageFiles(uploaded.map((x) => x.path));
    await supabase.from("articulos").delete().eq("id", articulo.id);
    return { success: false, error: e?.message || "Error publicando artículo" };
  }
}

/**
 * Actualiza SOLO campos del artículo (no imágenes).
 */
export async function updateArticleFields(articleId, updates = {}) {
  try {
    if (!articleId) return { success: false, error: "articleId es requerido" };

    const payload = {};
    for (const [k, v] of Object.entries(updates || {})) {
      if (v !== undefined) payload[k] = v;
    }

    let { data, error } = await supabase.from("articulos").update(payload).eq("id", articleId).select("*").single();

    if (error?.message && /Could not find the '(.+?)' column/i.test(error.message)) {
      const m = error.message.match(/Could not find the '(.+?)' column/i);
      const missingCol = m?.[1];

      if (missingCol && Object.prototype.hasOwnProperty.call(payload, missingCol)) {
        delete payload[missingCol];

        ({ data, error } = await supabase
          .from("articulos")
          .update(payload)
          .eq("id", articleId)
          .select("*")
          .single());
      }
    }

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err?.message || "Error inesperado" };
  }
}

/**
 * Agrega nuevas imágenes a un artículo (sin pasar de 4).
 */
export async function addArticleImages(articleId, newFiles, ownerId = null) {
  try {
    if (!articleId) return { success: false, error: "articleId es requerido" };

    const files = Array.from(newFiles || []).filter(Boolean);
    if (!files.length) return { success: false, error: "No hay imágenes para agregar" };

    if (!ownerId) {
      const { data: art, error: artErr } = await supabase.from("articulos").select("owner_id").eq("id", articleId).single();
      if (artErr) return { success: false, error: artErr.message };
      ownerId = art?.owner_id;
    }

    const { count, error: cErr } = await supabase
      .from("articulo_imagenes")
      .select("*", { count: "exact", head: true })
      .eq("articulo_id", articleId);

    if (cErr) return { success: false, error: cErr.message };

    const current = Number(count || 0);
    const remaining = MAX_IMAGES - current;

    if (remaining <= 0) return { success: false, error: `Este artículo ya tiene ${MAX_IMAGES} imágenes` };
    if (files.length > remaining) {
      return { success: false, error: `Solo puedes agregar ${remaining} imagen(es) más` };
    }

    // ✅ subir imágenes en paralelo (optimiza dentro)
    const results = await Promise.all(files.map((file) => uploadArticleImage({ file, ownerId })));

    const ok = results.filter((r) => r?.success);
    const fail = results.find((r) => !r?.success);

    if (fail) {
      await removeStorageFiles(ok.map((x) => x.path));
      return { success: false, error: fail.error || "Error subiendo una imagen" };
    }

    const uploaded = ok.map((r) => ({ url: r.url, path: r.path }));

    const ins = await insertArticleImages({ articuloId: articleId, ownerId, images: uploaded });
    if (!ins.success) {
      await removeStorageFiles(uploaded.map((x) => x.path));
      return ins;
    }

    await syncArticleImagesArray(articleId);
    return { success: true, data: ins.data };
  } catch (err) {
    return { success: false, error: err?.message || "Error inesperado" };
  }
}

/**
 * ✅ Reemplaza UNA imagen (mantiene posición).
 */
export async function replaceArticleImage(imageId, newFile, ownerId) {
  try {
    if (!imageId) return { success: false, error: "imageId es requerido" };
    if (!newFile) return { success: false, error: "newFile es requerido" };
    if (!ownerId) return { success: false, error: "ownerId es requerido" };

    const { data: oldImg, error: rErr } = await supabase
      .from("articulo_imagenes")
      .select("id, articulo_id, path")
      .eq("id", imageId)
      .single();

    if (rErr) return { success: false, error: rErr.message };

    const up = await uploadArticleImage({ file: newFile, ownerId });
    if (!up.success) return up;

    const { data, error: uErr } = await supabase
      .from("articulo_imagenes")
      .update({ url: up.url, path: up.path })
      .eq("id", imageId)
      .select("*")
      .single();

    if (uErr) {
      await removeStorageFiles([up.path]);
      return { success: false, error: uErr.message };
    }

    if (oldImg?.path) await removeStorageFiles([oldImg.path]);
    if (oldImg?.articulo_id) await syncArticleImagesArray(oldImg.articulo_id);

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err?.message || "Error inesperado" };
  }
}

/**
 * Elimina una imagen por id (borra DB + Storage).
 */
export async function deleteArticleImage(imageId) {
  try {
    if (!imageId) return { success: false, error: "imageId es requerido" };

    const { data: img, error: rErr } = await supabase
      .from("articulo_imagenes")
      .select("id,articulo_id,path,position")
      .eq("id", imageId)
      .single();

    if (rErr) return { success: false, error: rErr.message };
    if (!img?.path) return { success: false, error: "No se encontró path de la imagen" };

    const { error: dErr } = await supabase.from("articulo_imagenes").delete().eq("id", imageId);
    if (dErr) return { success: false, error: dErr.message };

    const del = await removeStorageFiles([img.path]);
    if (!del.success) return { success: true, warning: del.error };

    await normalizeImagePositions(img.articulo_id);
    await syncArticleImagesArray(img.articulo_id);

    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || "Error inesperado" };
  }
}

/**
 * Reordena imágenes: recibe array de IDs en el orden final.
 */
export async function reorderArticleImages(articleId, orderIds = []) {
  try {
    if (!articleId) return { success: false, error: "articleId es requerido" };

    const ids = Array.from(orderIds || []).filter(Boolean);
    if (!ids.length) return { success: false, error: "orderIds está vacío" };

    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase
        .from("articulo_imagenes")
        .update({ position: i })
        .eq("id", ids[i])
        .eq("articulo_id", articleId);

      if (error) return { success: false, error: error.message };
    }

    await syncArticleImagesArray(articleId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || "Error inesperado" };
  }
}

/**
 * Compacta positions para que queden 0..n-1.
 */
async function normalizeImagePositions(articleId) {
  const { data, error } = await supabase
    .from("articulo_imagenes")
    .select("id, position")
    .eq("articulo_id", articleId)
    .order("position", { ascending: true });

  if (error || !Array.isArray(data)) return;

  for (let i = 0; i < data.length; i++) {
    if (data[i].position !== i) {
      await supabase.from("articulo_imagenes").update({ position: i }).eq("id", data[i].id);
    }
  }
}

/**
 * ✅ updateArticle (para tu EditArticleModal)
 */
export async function updateArticle(articleId, formData = {}, file = null) {
  try {
    if (!articleId) return { success: false, error: "articleId es requerido" };

    const rawMode = formData?.tipo ?? formData?.mode;

    const updates = {
      title: formData?.titulo ?? formData?.title,
      description: formData?.descripcion ?? formData?.description,
      city: formData?.ciudad ?? formData?.city,
      locality: formData?.localidad_es ?? formData?.localidad ?? formData?.locality,
      category: formData?.categoria ?? formData?.category,
      subcategory: formData?.subcategoria ?? formData?.subcategory,
      subcategoria: formData?.subcategoria ?? formData?.subcategory,
      mode: rawMode !== undefined ? normalizeMode(rawMode) : undefined,
    };

    for (const k of Object.keys(updates)) {
      if (updates[k] === undefined) delete updates[k];
    }

    const { data, error } = await safeUpdateArticulos(articleId, updates);
    if (error) return { success: false, error: error.message };

    if (file) {
      const ownerId = data?.owner_id || null;
      const add = await addArticleImages(articleId, [file], ownerId);
      if (!add.success) return add;
    }

    await syncArticleImagesArray(articleId);

    const fresh = await getArticleWithImages(articleId);
    if (!fresh.success) return fresh;

    return { success: true, data: fresh.data };
  } catch (err) {
    return { success: false, error: err?.message || "Error inesperado" };
  }
}
