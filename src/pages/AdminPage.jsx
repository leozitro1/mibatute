// src/pages/AdminPage.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabase/supabaseClient";

// ===================== helpers =====================
function statusPill(status) {
  const v = String(status || "").toLowerCase().trim();
  if (v === "open") return { txt: "Nuevo", cls: "bg-blue-100 text-blue-800 border-blue-200" };
  if (v === "reviewing") return { txt: "En revisión", cls: "bg-yellow-100 text-yellow-900 border-yellow-200" };
  if (v === "resolved") return { txt: "Resuelto", cls: "bg-green-100 text-green-800 border-green-200" };
  if (v === "dismissed") return { txt: "Descartado", cls: "bg-gray-100 text-gray-700 border-gray-200" };
  return { txt: v || "—", cls: "bg-gray-100 text-gray-700 border-gray-200" };
}

function normalizeEstadoArticulo(v) {
  const s = String(v || "").toLowerCase().trim();
  if (!s) return "disponible";
  if (s === "available") return "disponible";
  if (s === "reserved") return "reservado";
  if (s === "delivered") return "entregado";
  if (s === "reviewing" || s === "en_revision" || s === "en revisión") return "en_revision";
  return s;
}

function articuloEstadoPill(estadoNorm) {
  const v = String(estadoNorm || "").toLowerCase().trim();
  if (v === "en_revision") return { txt: "EN REVISIÓN", cls: "bg-yellow-100 text-yellow-900 border-yellow-300" };
  if (v === "reservado") return { txt: "RESERVADO", cls: "bg-purple-100 text-purple-900 border-purple-300" };
  if (v === "entregado") return { txt: "ENTREGADO", cls: "bg-green-100 text-green-800 border-green-300" };
  if (v === "disponible") return { txt: "DISPONIBLE", cls: "bg-blue-50 text-blue-800 border-blue-200" };
  return { txt: String(v || "—").toUpperCase(), cls: "bg-gray-100 text-gray-800 border-gray-200" };
}

function fmtDate(v) {
  try {
    return v ? new Date(v).toLocaleString() : "";
  } catch {
    return "";
  }
}

function countReasons(reports) {
  const map = {};
  for (const r of reports) {
    const k = String(r?.reason || "—").trim() || "—";
    map[k] = (map[k] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function greenStatusText({ aggStatus, artEstado, isBlocked }) {
  const inReview = aggStatus === "reviewing" || artEstado === "en_revision";
  const resolved = aggStatus === "resolved";
  if (resolved) return "Estado: RESUELTA";
  if (isBlocked) return "Estado: BLOQUEADA";
  if (inReview) return "Estado: EN REVISIÓN";
  return "Estado: NUEVA";
}

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString();
}

function notifyModerationUpdated() {
  try {
    window.dispatchEvent(new CustomEvent("mb:moderation-updated"));
  } catch {}
}

function showSupabaseError(prefix, e) {
  const msg = e?.message || e?.error_description || (typeof e === "string" ? e : "") || "Error desconocido";
  alert(`${prefix}\n\n${msg}`);
}

// ===================== main =====================
export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);

  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState("");
  const [rows, setRows] = useState([]);

  const [ownerFlags, setOwnerFlags] = useState({});
  const [ownerNames, setOwnerNames] = useState({});

  // -------- bloqueados / sancionados (lista) --------
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedError, setBlockedError] = useState("");
  const [blockedUsers, setBlockedUsers] = useState([]);

  const [cityFilter, setCityFilter] = useState("Todas");
  const [localityFilter, setLocalityFilter] = useState("Todas");

  // modo de denuncias
  const [viewMode, setViewMode] = useState("articulos"); // "articulos" | "chat"

  // preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewArticle, setPreviewArticle] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // ---------------- simple access gate (NO BD) ----------------
  const ADMIN_USER = import.meta.env.VITE_ADMIN_USER || "leo";
  const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASS || "leo";

  const [gateOk, setGateOk] = useState(false);
  const [gateUser, setGateUser] = useState("");
  const [gatePass, setGatePass] = useState("");
  const [gateErr, setGateErr] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mb_admin_gate_ok");
      if (saved === "1") setGateOk(true);
    } catch {}
  }, []);

  const handleGateSubmit = useCallback(
    (e) => {
      e.preventDefault();
      setGateErr("");

      if (!ADMIN_USER || !ADMIN_PASS) {
        setGateErr("Falta configurar VITE_ADMIN_USER y VITE_ADMIN_PASS en .env");
        return;
      }

      if (gateUser.trim() === ADMIN_USER && gatePass === ADMIN_PASS) {
        setGateOk(true);
        try {
          localStorage.setItem("mb_admin_gate_ok", "1");
        } catch {}
      } else {
        setGateErr("Usuario o contraseña incorrectos.");
      }
    },
    [ADMIN_USER, ADMIN_PASS, gateUser, gatePass]
  );

  const handleGateLogout = useCallback(() => {
    setGateOk(false);
    setGateUser("");
    setGatePass("");
    setGateErr("");
    try {
      localStorage.removeItem("mb_admin_gate_ok");
    } catch {}
  }, []);

  // anti spam
  const firstLoadRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const lastLoadAtRef = useRef(0);
  const authHydratedRef = useRef(false);

  // ---------------- auth ----------------
  const hydrateAuthOnce = useCallback(async () => {
    if (authHydratedRef.current) return;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      setAuthUser(data?.session?.user || null);
    } catch (e) {
      console.error("Admin hydrate error:", e);
      setAuthUser(null);
    } finally {
      authHydratedRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      setLoading(true);
      hydrateAuthOnce();
    }
  }, [hydrateAuthOnce]);

  // ---------------- fetch owners safely ----------------
  const fetchOwnersSafely = useCallback(async (ownerIds) => {
    const ids = (ownerIds || []).filter(Boolean);
    if (!ids.length) return { flagsMap: {}, namesMap: {} };

    const candidates = [
      { nameCol: "nombre", select: "id,is_blocked,ban_until,nombre" },
      { nameCol: "username", select: "id,is_blocked,ban_until,username" },
      { nameCol: "display_name", select: "id,is_blocked,ban_until,display_name" },
      { nameCol: "email", select: "id,is_blocked,ban_until,email" },
      { nameCol: null, select: "id,is_blocked,ban_until" },
    ];

    for (const c of candidates) {
      const { data, error } = await supabase.from("usuarios").select(c.select).in("id", ids);

      if (error) {
        if (String(error.code) === "42703") continue;
        console.log("usuarios read error:", error);
        return { flagsMap: {}, namesMap: {} };
      }

      const flagsMap = {};
      const namesMap = {};
      for (const u of Array.isArray(data) ? data : []) {
        const id = String(u.id);
        flagsMap[id] = { is_blocked: !!u.is_blocked, ban_until: u.ban_until || null };
        if (c.nameCol) {
          const n = String(u?.[c.nameCol] || "").trim();
          if (n) namesMap[id] = n;
        }
      }
      return { flagsMap, namesMap };
    }

    return { flagsMap: {}, namesMap: {} };
  }, []);

  // ---------------- load blocked users ----------------
  const loadBlockedUsers = useCallback(async () => {
    setBlockedLoading(true);
    setBlockedError("");

    const candidates = [
      { nameCol: "nombre", select: "id,is_blocked,ban_until,nombre,foto_url,email" },
      { nameCol: "username", select: "id,is_blocked,ban_until,username,foto_url,email" },
      { nameCol: "display_name", select: "id,is_blocked,ban_until,display_name,foto_url,email" },
      { nameCol: "email", select: "id,is_blocked,ban_until,email,foto_url" },
      { nameCol: null, select: "id,is_blocked,ban_until,foto_url,email" },
    ];

    try {
      for (const c of candidates) {
        const { data, error } = await supabase
          .from("usuarios")
          .select(c.select)
          .eq("is_blocked", true)
          .order("id", { ascending: true })
          .limit(300);

        if (error) {
          if (String(error.code) === "42703") continue;
          throw error;
        }

        const arr = Array.isArray(data) ? data : [];
        const mapped = arr.map((u) => {
          const id = String(u.id);
          const name =
            (c.nameCol ? String(u?.[c.nameCol] || "").trim() : "") ||
            String(u?.email || "").trim() ||
            `ID: ${id.slice(0, 8)}…`;
          return {
            id,
            name,
            email: u?.email || null,
            foto_url: u?.foto_url || null,
            is_blocked: !!u?.is_blocked,
            ban_until: u?.ban_until || null,
          };
        });

        setBlockedUsers(mapped);
        setBlockedLoading(false);
        return;
      }

      setBlockedUsers([]);
      setBlockedLoading(false);
    } catch (e) {
      console.error("loadBlockedUsers error:", e);
      setBlockedUsers([]);
      setBlockedError(e?.message || "No se pudieron cargar bloqueados (RLS/permisos).");
      setBlockedLoading(false);
    }
  }, []);

  // ---------------- load reports ----------------
  const loadReports = useCallback(
    async ({ force = false } = {}) => {
      if (loadInFlightRef.current) return;

      const now = Date.now();
      if (!force && now - lastLoadAtRef.current < 600) return;
      lastLoadAtRef.current = now;

      loadInFlightRef.current = true;
      setRowsLoading(true);
      setRowsError("");

      try {
        const { data, error } = await supabase
          .from("admin_reports_view")
          .select(
            [
              "report_id",
              "report_created_at",
              "target_type",
              "target_id",
              "reason",
              "details",
              "status",
              "handled_by_user_id",
              "handled_at",
              "resolution",

              "articulo_id",
              "articulo_titulo",
              "articulo_estado",
              "city",
              "locality",
              "owner_id",
              "owner_nombre",
              "owner_foto_url",
              "articulo_thumb",

              "report_total",
              "report_open",
              "report_reviewing",
              "report_resolved",
              "report_dismissed",
              "last_report_at",
            ].join(",")
          )
          .eq("target_type", viewMode === "chat" ? "chat" : "articulo")
          .order("last_report_at", { ascending: false })
          .limit(800);

        if (error) throw error;

        const arr = Array.isArray(data) ? data : [];
        setRows(arr);

        const ownerIds = Array.from(new Set(arr.map((x) => x?.owner_id).filter(Boolean).map(String)));
        const { flagsMap, namesMap } = await fetchOwnersSafely(ownerIds);

        setOwnerFlags(flagsMap || {});
        setOwnerNames(namesMap || {});
      } catch (e) {
        console.error("loadReports error:", e);
        setRows([]);
        setOwnerFlags({});
        setOwnerNames({});
        setRowsError(e?.message || "No se pudieron cargar reportes (permisos/RLS).");
      } finally {
        setRowsLoading(false);
        loadInFlightRef.current = false;
      }
    },
    [fetchOwnersSafely]
  );

  useEffect(() => {
    if (!authUser?.id) return;
    loadReports({ force: true });
    loadBlockedUsers();
  }, [authUser?.id, loadReports, loadBlockedUsers]);

  // ---------------- grouping ----------------
  const groups = useMemo(() => {
    const map = {};
    for (const r of rows) {
      const t = String(r?.target_type || "articulo");
      const id = String(r?.target_id || "");
      if (!id) continue;
      const key = `${t}:${id}`;
      if (!map[key]) map[key] = { key, target_type: t, target_id: id, rows: [] };
      map[key].rows.push(r);
    }

    const out = Object.values(map);
    out.sort((a, b) => {
      const da = a.rows?.[0]?.last_report_at ? new Date(a.rows[0].last_report_at).getTime() : 0;
      const db = b.rows?.[0]?.last_report_at ? new Date(b.rows[0].last_report_at).getTime() : 0;
      return db - da;
    });
    return out;
  }, [rows, viewMode]);

  // ---------------- city/locality options ----------------
  const cities = useMemo(() => {
    if (viewMode === "chat") return ["Todas"];
    const set = new Set();
    for (const r of rows) {
      const c = String(r?.city || "").trim();
      if (c) set.add(c);
    }
    return ["Todas", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows, viewMode]);

  const localities = useMemo(() => {
    if (viewMode === "chat") return ["Todas"];
    const set = new Set();
    for (const r of rows) {
      const c = String(r?.city || "").trim();
      const l = String(r?.locality || "").trim();
      if (!l) continue;
      if (cityFilter !== "Todas" && c !== cityFilter) continue;
      set.add(l);
    }
    return ["Todas", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows, cityFilter]);

  const filteredGroups = useMemo(() => {
    const passCityLocality = (g) => {
      if (viewMode === "chat") return true;
      const r0 = g.rows?.[0] || {};
      const c = String(r0?.city || "").trim();
      const l = String(r0?.locality || "").trim();
      if (cityFilter !== "Todas" && c !== cityFilter) return false;
      if (localityFilter !== "Todas" && l !== localityFilter) return false;
      return true;
    };
    return groups.filter((g) => passCityLocality(g));
  }, [groups, cityFilter, localityFilter, viewMode]);

  // ---------------- actions ----------------
  const bulkUpdateReports = useCallback(async ({ reportIds, patch }) => {
    const ids = (reportIds || []).filter(Boolean);
    if (!ids.length) return { ok: true };

    try {
      const mergedPatch = {
        ...patch,
        handled_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("reports").update(mergedPatch).in("id", ids);
      if (error) throw error;

      return { ok: true };
    } catch (e) {
      console.error("bulkUpdateReports error:", e);
      showSupabaseError("No se pudieron actualizar los reportes.", e);
      return { ok: false };
    }
  }, []);

  const setArticleStatus = useCallback(async ({ articleId, nextEstado }) => {
    try {
      const patch = { estado: nextEstado, status: nextEstado };
      const { error } = await supabase.from("articulos").update(patch).eq("id", articleId);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.error("setArticleStatus error:", e);
      showSupabaseError("No se pudo actualizar el estado del artículo (RLS).", e);
      return { ok: false };
    }
  }, []);

  const deleteArticleDeep = useCallback(async (articleId) => {
    try {
      // 1) Buscar paths de imágenes (antes de borrar DB)
      const { data: imgs, error: imgErr } = await supabase
        .from("articulo_imagenes")
        .select("path")
        .eq("articulo_id", articleId);

      if (imgErr) throw imgErr;

      const paths = (imgs || [])
        .map((r) => (typeof r?.path === "string" ? r.path : ""))
        .filter(Boolean);

      // 2) Borrar archivos del Storage (bucket: articulos)
      //    Si no hay policies de delete para admin, esto fallará con "not authorized".
      if (paths.length) {
        const { error: storageErr } = await supabase.storage.from("articulos").remove(paths);
        if (storageErr) throw storageErr;
      }

      // 3) Borrar DB (chats/postulaciones/imagenes/articulo) vía RPC
      const { error } = await supabase.rpc("delete_article_deep", { p_articulo_id: articleId });
      if (error) throw error;

      return { ok: true };
    } catch (e) {
      console.error("deleteArticleDeep error:", e);
      showSupabaseError("No se pudo eliminar el artículo (RPC/RLS/Storage/relaciones).", e);
      return { ok: false };
    }
  }, []);

  const deleteReportsByIds = useCallback(async (reportIds) => {
    const ids = (reportIds || []).filter(Boolean);
    if (!ids.length) return { ok: true };

    try {
      const { error } = await supabase.rpc("delete_reports_by_ids", { p_ids: ids });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.error("deleteReportsByIds error:", e);
      showSupabaseError("No se pudieron borrar las denuncias (RPC/RLS).", e);
      return { ok: false };
    }
  }, []);

  const openPreview = useCallback(async (articleId) => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewArticle(null);

    try {
      const { data, error } = await supabase
        .from("articulos")
        .select(
          "id, titulo, title, descripcion, description, estado, status, city, ciudad, locality, localidad_es, imagen_url_principal, image_url, imagenes"
        )
        .eq("id", articleId)
        .maybeSingle();

      if (error) throw error;
      setPreviewArticle(data || null);
    } catch (e) {
      console.error("preview load error:", e);
      setPreviewError(e?.message || "No se pudo cargar el artículo.");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const applyBanDays = useCallback(
    async (ownerId, days) => {
      if (!ownerId) return false;
      const ok = confirm(`¿Sancionar ${days} día(s) a este usuario?`);
      if (!ok) return false;

      try {
        const until = addDaysISO(days);
        const { error } = await supabase.from("usuarios").update({ ban_until: until }).eq("id", ownerId);
        if (error) throw error;

        notifyModerationUpdated();
        await loadReports({ force: true });
        await loadBlockedUsers();
        alert(`✅ Usuario sancionado por ${days} día(s).`);
        return true;
      } catch (e) {
        console.error("applyBanDays error:", e);
        showSupabaseError("No se pudo aplicar la sanción (RLS/policies).", e);
        return false;
      }
    },
    [loadReports, loadBlockedUsers]
  );

  const clearBan = useCallback(
    async (ownerId) => {
      if (!ownerId) return false;
      const ok = confirm("¿Quitar sanción a este usuario?");
      if (!ok) return false;

      try {
        const { error } = await supabase.from("usuarios").update({ ban_until: null }).eq("id", ownerId);
        if (error) throw error;

        notifyModerationUpdated();
        await loadReports({ force: true });
        await loadBlockedUsers();
        alert("✅ Sanción retirada.");
        return true;
      } catch (e) {
        console.error("clearBan error:", e);
        showSupabaseError("No se pudo quitar la sanción (RLS/policies).", e);
        return false;
      }
    },
    [loadReports, loadBlockedUsers]
  );

  const setBlocked = useCallback(
    async (ownerId, next) => {
      if (!ownerId) return false;
      const ok = confirm(next ? "¿Bloquear este usuario? (no podrá publicar ni usar chats)" : "¿Desbloquear este usuario?");
      if (!ok) return false;

      try {
        const { error } = await supabase.from("usuarios").update({ is_blocked: !!next }).eq("id", ownerId);
        if (error) throw error;

        setOwnerFlags((prev) => {
          const id = String(ownerId);
          const cur = prev?.[id] || {};
          return { ...(prev || {}), [id]: { ...cur, is_blocked: !!next } };
        });

        notifyModerationUpdated();
        await loadReports({ force: true });
        await loadBlockedUsers();
        alert(next ? "✅ Usuario bloqueado." : "✅ Usuario desbloqueado.");
        return true;
      } catch (e) {
        console.error("setBlocked error:", e);
        showSupabaseError("No se pudo actualizar el bloqueo (RLS/policies).", e);
        return false;
      }
    },
    [loadReports, loadBlockedUsers]
  );

  // ---------------- UI ----------------
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm px-6 py-4">
          <p className="font-black text-gray-800">Cargando panel…</p>
        </div>
      </div>
    );
  }

  // Primero: requiere sesión (tu control actual)
  if (!authUser?.id) {
    return (
      <div className="min-h-screen bg-[#F5F5F5]">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
            <h1 className="text-2xl font-black text-gray-800">Panel de Moderación</h1>
            <p className="text-sm text-gray-500 font-bold mt-1">Debes iniciar sesión para entrar.</p>
            <div className="mt-6 flex gap-3">
              <Link to="/" className="px-4 py-2 rounded-2xl bg-gray-900 text-white font-black text-sm">
                Volver al Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Segundo: Gate adicional usuario/clave (NO BD)
  if (!gateOk) {
    return (
      <div className="min-h-screen bg-[#F5F5F5]">
        <div className="max-w-md mx-auto px-4 py-10">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
            <h1 className="text-2xl font-black text-gray-800">Acceso restringido</h1>
            <p className="text-sm text-gray-500 font-bold mt-1">Ingresa usuario y contraseña para ver el panel.</p>

            <form onSubmit={handleGateSubmit} className="mt-6 space-y-3">
              <div>
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Usuario</label>
                <input
                  value={gateUser}
                  onChange={(e) => setGateUser(e.target.value)}
                  className="mt-2 w-full px-3 py-3 rounded-2xl border border-gray-200 font-bold text-sm"
                  placeholder="Usuario"
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Contraseña</label>
                <input
                  value={gatePass}
                  onChange={(e) => setGatePass(e.target.value)}
                  type="password"
                  className="mt-2 w-full px-3 py-3 rounded-2xl border border-gray-200 font-bold text-sm"
                  placeholder="Contraseña"
                  autoComplete="current-password"
                />
              </div>

              {gateErr ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-3">
                  <p className="text-xs font-black text-red-700">{gateErr}</p>
                </div>
              ) : null}

              <button type="submit" className="w-full px-4 py-3 rounded-2xl bg-gray-900 text-white font-black text-sm">
                Entrar
              </button>

              <Link
                to="/"
                className="block text-center px-4 py-3 rounded-2xl bg-gray-100 text-gray-900 font-black text-sm border border-gray-200"
              >
                Volver al Home
              </Link>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-gray-800">Panel de Moderación</h1>
              <p className="text-sm text-gray-500 font-bold mt-1">{viewMode === "chat" ? "Denuncias de chat (sin filtros por ciudad)" : "Denuncias de publicaciones (filtro Ciudad / Localidad)"}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setViewMode("articulos");
                  setCityFilter("Todas");
                  setLocalityFilter("Todas");
                  loadReports({ force: true });
                }}
                className={
                  "px-4 py-2 rounded-2xl font-black text-sm border " +
                  (viewMode === "articulos"
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-900 border-gray-200 hover:border-gray-900")
                }
                disabled={rowsLoading}
                title="Ver denuncias relacionadas con publicaciones"
              >
                Publicaciones
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode("chat");
                  setCityFilter("Todas");
                  setLocalityFilter("Todas");
                  loadReports({ force: true });
                }}
                className={
                  "px-4 py-2 rounded-2xl font-black text-sm border " +
                  (viewMode === "chat"
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-900 border-gray-200 hover:border-gray-900")
                }
                disabled={rowsLoading}
                title="Ver denuncias hechas desde el chat"
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => loadReports({ force: true })}
                className="px-4 py-2 rounded-2xl bg-gray-100 text-gray-900 font-black text-sm border border-gray-200 hover:border-gray-900"
                disabled={rowsLoading}
              >
                Refrescar
              </button>

              <button
                type="button"
                onClick={handleGateLogout}
                className="px-4 py-2 rounded-2xl bg-white text-gray-900 font-black text-sm border border-gray-200 hover:border-gray-900"
              >
                Salir
              </button>

              <Link to="/" className="px-4 py-2 rounded-2xl bg-gray-900 text-white font-black text-sm">
                Volver al Home
              </Link>
            </div>
          </div>

          {viewMode !== "chat" && (
            <div className="mt-6 bg-gray-50 border border-gray-100 rounded-3xl p-5">
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Filtros</p>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Ciudad</p>
                <select
                  value={cityFilter}
                  onChange={(e) => {
                    setCityFilter(e.target.value);
                    setLocalityFilter("Todas");
                  }}
                  className="mt-2 w-full px-3 py-3 rounded-2xl border border-gray-200 font-bold text-sm"
                >
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Localidad / Barrio</p>
                <select
                  value={localityFilter}
                  onChange={(e) => setLocalityFilter(e.target.value)}
                  className="mt-2 w-full px-3 py-3 rounded-2xl border border-gray-200 font-bold text-sm"
                >
                  {localities.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            </div>
          )}

          <div className="mt-6">

            {rowsLoading ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <p className="text-sm font-black text-gray-700">Cargando reportes…</p>
              </div>
            ) : rowsError ? (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                <p className="text-sm font-black text-red-700">Error cargando reportes</p>
                <p className="text-xs text-red-700 mt-1">{rowsError}</p>
              </div>
            ) : null}
          </div>

          {/* ---------------- Usuarios bloqueados ---------------- */}
          <div className="mt-6 bg-white border border-gray-100 rounded-3xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Usuarios</p>
                <h2 className="text-lg font-black text-gray-900 mt-1">Bloqueados</h2>
                <p className="text-xs text-gray-500 font-bold mt-1">
                  Lista directa desde <span className="font-black">usuarios.is_blocked = true</span>
                </p>
              </div>

              <button
                type="button"
                onClick={loadBlockedUsers}
                className="px-4 py-2 rounded-2xl bg-gray-100 text-gray-900 font-black text-sm border border-gray-200 hover:border-gray-900"
                disabled={blockedLoading}
              >
                Refrescar bloqueados
              </button>
            </div>

            <div className="mt-4">
              {blockedLoading ? (
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                  <p className="text-sm font-black text-gray-700">Cargando bloqueados…</p>
                </div>
              ) : blockedError ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                  <p className="text-sm font-black text-red-700">Error cargando bloqueados</p>
                  <p className="text-xs text-red-700 mt-1">{blockedError}</p>
                </div>
              ) : blockedUsers.length === 0 ? (
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                  <p className="text-sm font-black text-gray-700">No hay usuarios bloqueados.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {blockedUsers.map((u) => (
                    <div key={u.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 border border-red-200 text-[10px] font-black">
                              BLOQUEADO
                            </span>

                            <span className="text-sm font-black text-gray-900 truncate">{u.name}</span>

                            <span className="text-xs text-gray-500 font-bold">{u.email ? u.email : `ID: ${u.id}`}</span>

                            {u.ban_until ? (
                              <span className="text-xs font-black text-orange-900 bg-orange-100 border border-orange-200 px-2 py-1 rounded-full">
                                Sanción hasta: {fmtDate(u.ban_until)}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setBlocked(u.id, false)}
                            className="px-4 py-2 rounded-2xl bg-white text-gray-900 font-black text-xs border border-gray-200 hover:border-gray-900"
                          >
                            Desbloquear
                          </button>

                          <button
                            type="button"
                            onClick={() => clearBan(u.id)}
                            className="px-4 py-2 rounded-2xl bg-white text-gray-900 font-black text-xs border border-gray-200 hover:border-gray-900"
                          >
                            Quitar sanción
                          </button>

                          <button
                            type="button"
                            onClick={() => setBlocked(u.id, true)}
                            className="px-4 py-2 rounded-2xl bg-red-100 text-red-800 font-black text-xs border border-red-200 hover:border-red-800"
                          >
                            Mantener bloqueado
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {!rowsLoading && !rowsError && filteredGroups.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <p className="text-sm font-black text-gray-700">No hay reportes con esos filtros.</p>
              </div>
            ) : null}

            {filteredGroups.map((g) => {
              const repList = g.rows || [];
              const head = repList[0] || {};

              const targetType = String(head?.target_type || "articulo").toLowerCase().trim();
              const isChat = targetType === "chat";

              const artTitle = !isChat
                ? String(head?.articulo_titulo || "Artículo").trim()
                : (() => {
                    const a = String(head?.buyer_nombre || head?.buyer_name || "").trim();
                    const b = String(head?.seller_nombre || head?.seller_name || "").trim();
                    const pair = [a, b].filter(Boolean).join(" ↔ ");
                    const id = String(head?.target_id || "").trim();
                    return pair || (id ? `Chat ${id}` : "Chat");
                  })();
              const artEstado = normalizeEstadoArticulo(head?.articulo_estado);
              const artEstadoP = articuloEstadoPill(artEstado);

              const ownerId = head?.owner_id ? String(head.owner_id) : "";

              const ownerNameReal =
                (ownerId && ownerNames[ownerId]) ||
                String(head?.owner_nombre || "").trim() ||
                (ownerId ? `ID: ${ownerId.slice(0, 8)}…` : "—");

              const openCount = Number(head?.report_open || 0);
              const reviewingCount = Number(head?.report_reviewing || 0);
              const resolvedCount = Number(head?.report_resolved || 0);
              const dismissedCount = Number(head?.report_dismissed || 0);
              const total = Number(head?.report_total || repList.length);

              const aggStatus =
                reviewingCount > 0 ? "reviewing" : openCount > 0 ? "open" : resolvedCount > 0 ? "resolved" : "dismissed";

              const pill = statusPill(aggStatus);
              const reasons = countReasons(repList).slice(0, 4);
              const reportIds = repList.map((x) => x.report_id).filter(Boolean);

              const flags = ownerId ? ownerFlags[ownerId] : null;
              const banUntilMs = flags?.ban_until ? new Date(flags.ban_until).getTime() : 0;
              const isBannedNow = !!(banUntilMs && banUntilMs > Date.now());
              const isBlocked = !!flags?.is_blocked;

              const greenTxt = greenStatusText({ aggStatus, artEstado, isBlocked });

              return (
                <div key={g.key} className="bg-white border border-gray-100 rounded-3xl p-5">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-black border ${pill.cls}`}>{pill.txt}</span>
                        <span className="text-sm font-black text-gray-900">{artTitle}</span>
                        {!isChat && (
                          <span className="text-xs text-gray-500 font-bold">
                            {head?.city ? `${head.city}${head.locality ? `, ${head.locality}` : ""}` : ""}
                          </span>
                        )}
                        {isChat && (
                          <span className="text-xs text-gray-500 font-bold">
                            {head?.target_id ? `Chat ID: ${head.target_id}` : "Chat"}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 font-bold">Último: {fmtDate(head?.last_report_at)}</span>
                        <span className="ml-1 text-xs font-black text-green-700">{greenTxt}</span>
                      </div>

                      <div className="mt-2 text-[12px] font-bold text-gray-600">
                        <span className="font-black text-gray-900">{total}</span> reportes —{" "}
                        <span className="text-blue-700 font-black">{openCount}</span> nuevos,{" "}
                        <span className="text-yellow-800 font-black">{reviewingCount}</span> en revisión,{" "}
                        <span className="text-green-800 font-black">{resolvedCount}</span> resueltos,{" "}
                        <span className="text-gray-700 font-black">{dismissedCount}</span> descartados.
                      </div>

                      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                          <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Motivos (top)</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {reasons.length ? (
                              reasons.map(([k, c]) => (
                                <span
                                  key={`${k}-${c}`}
                                  className="px-3 py-1 rounded-full text-[11px] font-black border border-gray-200 bg-white text-gray-800"
                                  title={k}
                                >
                                  {k} ({c})
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-gray-500 font-bold">—</span>
                            )}
                          </div>

                          <div className="mt-3 text-xs text-gray-600 font-bold">
                            Usuario: <span className="font-black text-gray-900">{ownerNameReal}</span>{" "}
                            {isBlocked ? (
                              <span className="ml-2 px-2 py-1 rounded-full bg-red-100 text-red-800 border border-red-200 text-[10px] font-black">
                                BLOQUEADO
                              </span>
                            ) : null}
                            {isBannedNow ? (
                              <span className="ml-2 px-2 py-1 rounded-full bg-orange-100 text-orange-900 border border-orange-200 text-[10px] font-black">
                                SANCIONADO
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <span className="text-xs text-gray-600 font-bold">{isChat ? "Estado chat" : "Estado artículo"}:</span>
                            <span className={`px-3 py-1 rounded-full text-[11px] font-black border ${artEstadoP.cls}`}>
                              {artEstadoP.txt}
                            </span>
                          </div>
                        </div>

                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                          <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Acciones rápidas</p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {!isChat && (
                              <button
                                type="button"
                                onClick={() => openPreview(head?.articulo_id)}
                                className="px-4 py-2 rounded-2xl bg-white text-gray-900 font-black text-xs border border-gray-200 hover:border-gray-900"
                              >
                                Ver artículo (preview)
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={async () => {
                                const ok = confirm("¿Marcar EN REVISIÓN y bloquear el artículo?");
                                if (!ok) return;

                                const idsToReview = repList
                                  .filter((x) => {
                                    const st = String(x.status || "").toLowerCase();
                                    return st === "open" || st === "reviewing";
                                  })
                                  .map((x) => x.report_id);

                                const okR = await bulkUpdateReports({
                                  reportIds: idsToReview,
                                  patch: { status: "reviewing", resolution: "" },
                                });
                                if (!okR.ok) return;

                                if (!isChat) await setArticleStatus({ articleId: head?.articulo_id, nextEstado: "en_revision" });
                                await loadReports({ force: true });
                              }}
                              className="px-4 py-2 rounded-2xl bg-yellow-100 text-yellow-900 font-black text-xs border border-yellow-200 hover:border-yellow-900"
                            >
                              En revisión (bloquear)
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                const ok = confirm("¿Descartar reportes y desbloquear si estaba en revisión?");
                                if (!ok) return;

                                const okR = await bulkUpdateReports({
                                  reportIds,
                                  patch: { status: "dismissed", resolution: "" },
                                });
                                if (!okR.ok) return;

                                if (normalizeEstadoArticulo(head?.articulo_estado) === "en_revision") {
                                  if (!isChat) await setArticleStatus({ articleId: head?.articulo_id, nextEstado: "disponible" });
                                }

                                await loadReports({ force: true });
                              }}
                              className="px-4 py-2 rounded-2xl bg-gray-200 text-gray-900 font-black text-xs border border-gray-300 hover:border-gray-900"
                            >
                              Descartar (desbloquear)
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                const ok = confirm(
                                  "¿Marcar como RESUELTO y BORRAR las denuncias?\n\nEsto las elimina y ya no aparecerán en este panel."
                                );
                                if (!ok) return;

                                if (normalizeEstadoArticulo(head?.articulo_estado) === "en_revision") {
                                  if (!isChat) await setArticleStatus({ articleId: head?.articulo_id, nextEstado: "disponible" });
                                }

                                const del = await deleteReportsByIds(reportIds);
                                if (!del.ok) return;

                                await loadReports({ force: true });
                              }}
                              className="px-4 py-2 rounded-2xl bg-green-100 text-green-800 font-black text-xs border border-green-200 hover:border-green-800"
                            >
                              Resuelto (borrar denuncia)
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                const ok = confirm("¿Eliminar el ARTÍCULO? Esto borra anuncio y relaciones.");
                                if (!ok) return;

                                const del = await deleteArticleDeep(head?.articulo_id);
                                if (!del.ok) return;

                                await bulkUpdateReports({
                                  reportIds,
                                  patch: { status: "resolved", resolution: "Artículo eliminado por moderación." },
                                });

                                await loadReports({ force: true });
                              }}
                              className="px-4 py-2 rounded-2xl bg-red-100 text-red-800 font-black text-xs border border-red-200 hover:border-red-800"
                            >
                              Eliminar artículo
                            </button>
                          </div>

                          {ownerId ? (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <p className="text-xs font-black text-gray-500 uppercase tracking-widest">
                                Usuario (sanción / bloqueo)
                              </p>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => applyBanDays(ownerId, 1)}
                                  className="px-4 py-2 rounded-2xl bg-orange-50 text-orange-900 font-black text-xs border border-orange-200 hover:border-orange-900"
                                >
                                  Sancionar 1 día
                                </button>

                                <button
                                  type="button"
                                  onClick={() => applyBanDays(ownerId, 3)}
                                  className="px-4 py-2 rounded-2xl bg-orange-50 text-orange-900 font-black text-xs border border-orange-200 hover:border-orange-900"
                                >
                                  3 días
                                </button>

                                <button
                                  type="button"
                                  onClick={() => applyBanDays(ownerId, 7)}
                                  className="px-4 py-2 rounded-2xl bg-orange-50 text-orange-900 font-black text-xs border border-orange-200 hover:border-orange-900"
                                >
                                  7 días
                                </button>

                                <button
                                  type="button"
                                  onClick={() => clearBan(ownerId)}
                                  className="px-4 py-2 rounded-2xl bg-white text-gray-900 font-black text-xs border border-gray-200 hover:border-gray-900"
                                >
                                  Quitar sanción
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setBlocked(ownerId, true)}
                                  className="px-4 py-2 rounded-2xl bg-red-100 text-red-800 font-black text-xs border border-red-200 hover:border-red-800"
                                >
                                  Bloquear usuario
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setBlocked(ownerId, false)}
                                  className="px-4 py-2 rounded-2xl bg-white text-gray-900 font-black text-xs border border-gray-200 hover:border-gray-900"
                                >
                                  Desbloquear
                                </button>
                              </div>

                              <p className="mt-3 text-xs text-gray-600 font-bold">
                                Sanción hasta:{" "}
                                <span className="font-black text-gray-900">{flags?.ban_until ? fmtDate(flags.ban_until) : "—"}</span>
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 w-full md:w-56">
                      <div className="rounded-3xl overflow-hidden border border-gray-100 bg-gray-50">
                        {head?.articulo_thumb ? (
                          <img
                            src={head.articulo_thumb}
                            alt="thumb"
                            className="w-full h-40 object-cover"
                            onError={(e) => (e.currentTarget.style.display = "none")}
                          />
                        ) : (
                          <div className="h-40 flex items-center justify-center text-xs font-black text-gray-400">Sin imagen</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4"
          onClick={() => {
            setPreviewOpen(false);
            setPreviewArticle(null);
            setPreviewError("");
          }}
        >
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Preview artículo</p>
                <h3 className="text-lg font-black text-gray-900 mt-1 leading-tight">
                  {previewArticle?.titulo || previewArticle?.title || "Artículo"}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPreviewOpen(false);
                  setPreviewArticle(null);
                  setPreviewError("");
                }}
                className="px-4 py-2 rounded-2xl bg-gray-900 text-white font-black text-sm"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4">
              {previewLoading ? (
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                  <p className="text-sm font-black text-gray-700">Cargando…</p>
                </div>
              ) : previewError ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                  <p className="text-sm font-black text-red-700">Error</p>
                  <p className="text-xs text-red-700 mt-1">{previewError}</p>
                </div>
              ) : previewArticle ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Estado</p>
                    <p className="text-sm font-black text-gray-900 mt-1">{String(previewArticle?.estado || previewArticle?.status || "—")}</p>
                  </div>

                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Descripción</p>
                    <p className="text-sm text-gray-700 font-bold mt-1 whitespace-pre-wrap">
                      {previewArticle?.descripcion || previewArticle?.description || "—"}
                    </p>
                  </div>

                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Ubicación</p>
                    <p className="text-sm font-bold text-gray-700 mt-1">
                      {previewArticle?.localidad_es || previewArticle?.locality || ""}{" "}
                      {previewArticle?.ciudad || previewArticle?.city
                        ? `, ${previewArticle?.ciudad || previewArticle?.city}`
                        : ""}
                    </p>
                  </div>

                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Imagen</p>
                    <div className="mt-2 rounded-2xl overflow-hidden bg-white border border-gray-100">
                      <img
                        src={
                          previewArticle?.imagen_url_principal ||
                          previewArticle?.image_url ||
                          (Array.isArray(previewArticle?.imagenes) ? previewArticle.imagenes?.[0] : "") ||
                          ""
                        }
                        alt="preview"
                        className="w-full h-64 object-cover"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                      <div className="p-3 text-xs text-gray-500 font-bold">Si no aparece imagen, puede ser ruta privada o vacía.</div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs text-gray-500 font-bold">
                      ID: <span className="font-black">{String(previewArticle?.id || "")}</span>
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}