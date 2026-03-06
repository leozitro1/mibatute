// src/pages/MasterPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabase/supabaseClient";

// ===================== helpers =====================
function fmtDate(v) {
  try {
    return v ? new Date(v).toLocaleString() : "";
  } catch {
    return "";
  }
}
function fmtDateOnly(v) {
  try {
    return v ? new Date(v).toLocaleDateString() : "";
  } catch {
    return "";
  }
}
function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString();
}
function showSupabaseError(prefix, e) {
  const msg =
    e?.message ||
    e?.error_description ||
    (typeof e === "string" ? e : "") ||
    "Error desconocido";
  alert(`${prefix}\n\n${msg}`);
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
function safeStr(v) {
  return String(v ?? "").trim();
}
function isActiveEstado(norm) {
  const v = String(norm || "").toLowerCase().trim();
  return v === "disponible" || v === "reservado";
}

// ===================== main =====================
export default function MasterPage() {
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);

  // ---------------- Gate extra (solo frontend) ----------------
  // Cambia la clave aquí o (mejor) en tu .env: VITE_MASTER_PASS=tu_clave
  const MASTER_PASS = import.meta.env.VITE_MASTER_PASS || "156215621562";
  const [gateOk, setGateOk] = useState(false);
  const [gatePass, setGatePass] = useState("");
  const [gateErr, setGateErr] = useState("");

  // 3 pestañas
  const [tab, setTab] = useState("publicaciones"); // publicaciones | usuarios | mensajes
  const [q, setQ] = useState("");

  // filtros rápidos (usuarios)
  const [userQuickFilter, setUserQuickFilter] = useState("all"); // all | blocked | banned
  const [userSort, setUserSort] = useState("newest"); // newest | oldest | name_az | name_za

  // filtros rápidos (publicaciones)
  const [pubQuickFilter, setPubQuickFilter] = useState("all"); // all | en_revision
  const [pubSort, setPubSort] = useState("newest"); // newest | oldest

  // Filtro por usuario (click en usuario)
  const [selectedOwnerId, setSelectedOwnerId] = useState("");

  // publicaciones
  const [artLoading, setArtLoading] = useState(false);
  const [artError, setArtError] = useState("");
  const [articulos, setArticulos] = useState([]);

  // usuarios
  const [usrLoading, setUsrLoading] = useState(false);
  const [usrError, setUsrError] = useState("");
  const [usuarios, setUsuarios] = useState([]);

  // mapa id -> nombre (para mostrar owner en publicaciones)
  const [ownerNames, setOwnerNames] = useState({});
  const ownerNamesRef = useRef({});
  useEffect(() => {
    ownerNamesRef.current = ownerNames || {};
  }, [ownerNames]);

  // conteo de publicaciones activas por usuario (owner_id)
  const [activeCountByOwner, setActiveCountByOwner] = useState({});
  const activeCountRef = useRef({});
  useEffect(() => {
    activeCountRef.current = activeCountByOwner || {};
  }, [activeCountByOwner]);

  const selectedOwnerName = useMemo(() => {
    if (!selectedOwnerId) return "";
    return ownerNames[selectedOwnerId] || "Usuario";
  }, [selectedOwnerId, ownerNames]);

  // preview artículo
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewArticle, setPreviewArticle] = useState(null);

  // anti spam (SEPARADO para evitar bloquear artículos por cargar usuarios)
  const artInFlightRef = useRef(false);
  const usrInFlightRef = useRef(false);
  const didInitialLoadRef = useRef(false);

  // ===================== MENSAJES (Buzón) =====================
  const [canSendMsgs, setCanSendMsgs] = useState(false);
  const [canSendLoading, setCanSendLoading] = useState(false);

  const [msgMode, setMsgMode] = useState("all"); // all | one | many
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgSeverity, setMsgSeverity] = useState("info"); // info | warning | critical
  const [msgSending, setMsgSending] = useState(false);

  const [msgUserQuery, setMsgUserQuery] = useState("");
  const [msgSelectedOne, setMsgSelectedOne] = useState("");
  const [msgSelectedMany, setMsgSelectedMany] = useState(() => new Set());

  const toggleMany = useCallback((id) => {
    setMsgSelectedMany((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearMsgSelection = useCallback(() => {
    setMsgSelectedOne("");
    setMsgSelectedMany(new Set());
    setMsgUserQuery("");
  }, []);

  const filteredUsersForMsg = useMemo(() => {
    const s = String(msgUserQuery || "").trim().toLowerCase();
    if (!s) return usuarios || [];
    return (usuarios || []).filter((u) => {
      const hay = [u?.name, u?.email, u?.ciudad, u?.localidad, u?.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [usuarios, msgUserQuery]);

  // ---------------- auth ----------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!alive) return;
        setAuthUser(data?.session?.user || null);
      } catch (e) {
        console.error("Master auth error:", e);
        if (!alive) return;
        setAuthUser(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setAuthUser(session?.user || null);
    });

    return () => {
      alive = false;
      try {
        authSub?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, []);

  // ---------------- gate hydrate ----------------
  useEffect(() => {
    if (!authUser?.id) return;
    try {
      const k = `mb_master_gate_ok_${authUser.id}`;
      const saved = localStorage.getItem(k);
      if (saved === "1") setGateOk(true);
    } catch {}
  }, [authUser?.id]);

  const handleGateSubmit = useCallback(
    (e) => {
      e.preventDefault();
      setGateErr("");

      if (!MASTER_PASS) {
        setGateErr("Falta configurar la clave del Master.");
        return;
      }

      if (gatePass === MASTER_PASS) {
        setGateOk(true);
        setGatePass("");
        try {
          const k = `mb_master_gate_ok_${authUser?.id || "anon"}`;
          localStorage.setItem(k, "1");
        } catch {}
      } else {
        setGateErr("Contraseña incorrecta.");
      }
    },
    [MASTER_PASS, gatePass, authUser?.id]
  );

  const handleGateLogout = useCallback(() => {
    setGateOk(false);
    setGatePass("");
    setGateErr("");
    try {
      const k = `mb_master_gate_ok_${authUser?.id || "anon"}`;
      localStorage.removeItem(k);
    } catch {}
  }, [authUser?.id]);

  // ---------------- permiso para enviar mensajes ----------------
  // DEV MODE: cualquier usuario logueado puede enviar
  // TODO PRODUCCION: reemplazar por consulta a admin_users
  const loadCanSendFlag = useCallback(async () => {
    if (!authUser?.id) return;
    setCanSendLoading(true);
    try {
      setCanSendMsgs(true); // DEV: bypass, cualquier usuario logueado puede enviar
    } catch (e) {
      console.warn("loadCanSendFlag warn:", e?.message || e);
      setCanSendMsgs(false);
    } finally {
      setCanSendLoading(false);
    }
  }, [authUser?.id]);

  // ---------------- loaders ----------------
  const loadUsuarios = useCallback(async ({ force = false } = {}) => {
    if (usrInFlightRef.current && !force) return;
    usrInFlightRef.current = true;
    setUsrLoading(true);
    setUsrError("");

    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("id,created_at,nombre,email,ciudad,localidad,foto_url,is_blocked,ban_until")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) throw error;

      const arr = Array.isArray(data) ? data : [];
      const mapped = arr.map((u) => {
        const id = String(u?.id || "");
        const name = safeStr(u?.nombre) || safeStr(u?.email) || "Usuario";
        return {
          id,
          name,
          email: u?.email || null,
          ciudad: u?.ciudad || null,
          localidad: u?.localidad || null,
          foto_url: u?.foto_url || null,
          is_blocked: !!u?.is_blocked,
          ban_until: u?.ban_until || null,
          created_at: u?.created_at || null,
        };
      });

      setUsuarios(mapped);

      const map = {};
      for (const u of mapped) map[u.id] = u.name;
      setOwnerNames(map);
    } catch (e) {
      console.error("loadUsuarios error:", e);
      setUsuarios([]);
      setUsrError(e?.message || "No se pudieron cargar usuarios (RLS/permisos).");
    } finally {
      setUsrLoading(false);
      usrInFlightRef.current = false;
    }
  }, []);

  const loadOwnersByIds = useCallback(async (ids) => {
    const uniq = Array.from(new Set((ids || []).filter(Boolean).map(String)));
    if (!uniq.length) return;

    const chunks = [];
    for (let i = 0; i < uniq.length; i += 200) chunks.push(uniq.slice(i, i + 200));

    const map = {};
    try {
      for (const ch of chunks) {
        const { data, error } = await supabase.from("usuarios").select("id,nombre,email").in("id", ch);
        if (error) throw error;

        for (const u of Array.isArray(data) ? data : []) {
          const id = String(u?.id || "");
          const name = safeStr(u?.nombre) || safeStr(u?.email) || "Usuario";
          if (id) map[id] = name;
        }
      }
      setOwnerNames((prev) => ({ ...(prev || {}), ...map }));
    } catch (e) {
      console.warn("loadOwnersByIds warn:", e?.message || e);
    }
  }, []);

  const loadActiveCounts = useCallback(async ({ force = false } = {}) => {
    if (!force && Object.keys(activeCountRef.current || {}).length > 0) return;

    try {
      let rows = null;

      {
        const { data, error } = await supabase
          .from("articulos")
          .select("owner_id,estado,created_at")
          .order("created_at", { ascending: false })
          .limit(5000);

        if (!error) rows = data;
      }

      if (!rows) {
        const { data, error } = await supabase
          .from("articulos")
          .select("owner_id,status,created_at")
          .order("created_at", { ascending: false })
          .limit(5000);

        if (error) throw error;
        rows = data;
      }

      const map = {};
      for (const r of Array.isArray(rows) ? rows : []) {
        const ownerId = r?.owner_id ? String(r.owner_id) : "";
        if (!ownerId) continue;
        const st = normalizeEstadoArticulo(r?.estado ?? r?.status);
        if (!isActiveEstado(st)) continue;
        map[ownerId] = (map[ownerId] || 0) + 1;
      }

      setActiveCountByOwner(map);
    } catch (e) {
      console.warn("loadActiveCounts warn:", e?.message || e);
      setActiveCountByOwner({});
    }
  }, []);

  const loadArticulos = useCallback(
    async ({ force = false } = {}) => {
      if (artInFlightRef.current && !force) return;
      artInFlightRef.current = true;
      setArtLoading(true);
      setArtError("");

      try {
        let data = null;

        {
          const { data: d, error } = await supabase
            .from("articulos")
            .select("id,created_at,titulo,estado,city,locality,imagen_url_principal,owner_id")
            .order("created_at", { ascending: false })
            .limit(800);

          if (!error) data = d;
        }

        if (!data) {
          const { data: d, error } = await supabase
            .from("articulos")
            .select("id,created_at,title,status,city,locality,image_url,owner_id")
            .order("created_at", { ascending: false })
            .limit(800);

          if (error) throw error;
          data = d;
        }

        const arr = Array.isArray(data) ? data : [];
        const mapped = arr.map((a) => {
          const id = String(a?.id || "");
          const titulo = safeStr(a?.titulo) || safeStr(a?.title) || "Publicación";
          const estadoRaw = a?.estado ?? a?.status;
          const estadoNorm = normalizeEstadoArticulo(estadoRaw);
          const img = a?.imagen_url_principal || a?.image_url || null;
          const ownerId = a?.owner_id ? String(a.owner_id) : "";
          return {
            id,
            titulo,
            estadoNorm,
            city: a?.city || a?.ciudad || "",
            locality: a?.locality || a?.localidad_es || "",
            created_at: a?.created_at || null,
            img,
            ownerId,
          };
        });

        setArticulos(mapped);

        const known = ownerNamesRef.current || {};
        const ownerIds = Array.from(new Set(mapped.map((x) => x.ownerId).filter(Boolean)));
        const missing = ownerIds.filter((id) => !known?.[id]);
        if (missing.length) loadOwnersByIds(missing);
      } catch (e) {
        console.error("loadArticulos error:", e);
        setArticulos([]);
        setArtError(e?.message || "No se pudieron cargar publicaciones (RLS/permisos).");
      } finally {
        setArtLoading(false);
        artInFlightRef.current = false;
      }
    },
    [loadOwnersByIds]
  );

  // carga inicial UNA sola vez
  useEffect(() => {
    if (!authUser?.id) return;
    if (didInitialLoadRef.current) return;
    didInitialLoadRef.current = true;

    loadUsuarios();
    loadArticulos();
    loadActiveCounts();
    loadCanSendFlag();
  }, [authUser?.id, loadArticulos, loadUsuarios, loadActiveCounts, loadCanSendFlag]);

  // ---------------- actions ----------------
  const setArticleStatus = useCallback(
    async (articleId, nextEstado) => {
      try {
        const patch = { estado: nextEstado, status: nextEstado };
        const { error } = await supabase.from("articulos").update(patch).eq("id", articleId);
        if (error) throw error;

        setArticulos((prev) =>
          (prev || []).map((a) =>
            a.id === String(articleId) ? { ...a, estadoNorm: normalizeEstadoArticulo(nextEstado) } : a
          )
        );

        setActiveCountByOwner({});
        loadActiveCounts({ force: true });
        return true;
      } catch (e) {
        console.error("setArticleStatus error:", e);
        showSupabaseError("No se pudo actualizar el estado del artículo.", e);
        return false;
      }
    },
    [loadActiveCounts]
  );

  const deleteArticleDeep = useCallback(
    async (articleId) => {
      const ok = confirm("¿Eliminar esta publicación? (Se borran relaciones según tu RPC)");
      if (!ok) return false;

      try {
        const { error } = await supabase.rpc("delete_article_deep", { p_articulo_id: articleId });
        if (error) throw error;

        setArticulos((prev) => (prev || []).filter((a) => a.id !== String(articleId)));

        setActiveCountByOwner({});
        loadActiveCounts({ force: true });

        alert("✅ Publicación eliminada.");
        return true;
      } catch (e) {
        console.error("deleteArticleDeep error:", e);
        showSupabaseError("No se pudo eliminar la publicación (RPC/RLS).", e);
        return false;
      }
    },
    [loadActiveCounts]
  );

  const setBlocked = useCallback(async (userId, next) => {
    const ok = confirm(next ? "¿Bloquear este usuario?" : "¿Desbloquear este usuario?");
    if (!ok) return false;

    try {
      const { error } = await supabase.from("usuarios").update({ is_blocked: !!next }).eq("id", userId);
      if (error) throw error;

      setUsuarios((prev) => (prev || []).map((u) => (u.id === String(userId) ? { ...u, is_blocked: !!next } : u)));
      alert(next ? "✅ Usuario bloqueado." : "✅ Usuario desbloqueado.");
      return true;
    } catch (e) {
      console.error("setBlocked error:", e);
      showSupabaseError("No se pudo actualizar bloqueo (RLS/policies).", e);
      return false;
    }
  }, []);

  const applyBanDays = useCallback(async (userId, days) => {
    const ok = confirm(`¿Sancionar ${days} día(s) a este usuario?`);
    if (!ok) return false;

    try {
      const until = addDaysISO(days);
      const { error } = await supabase.from("usuarios").update({ ban_until: until }).eq("id", userId);
      if (error) throw error;

      setUsuarios((prev) => (prev || []).map((u) => (u.id === String(userId) ? { ...u, ban_until: until } : u)));
      alert(`✅ Usuario sancionado por ${days} día(s).`);
      return true;
    } catch (e) {
      console.error("applyBanDays error:", e);
      showSupabaseError("No se pudo aplicar sanción (RLS/policies).", e);
      return false;
    }
  }, []);

  const clearBan = useCallback(async (userId) => {
    const ok = confirm("¿Quitar sanción a este usuario?");
    if (!ok) return false;

    try {
      const { error } = await supabase.from("usuarios").update({ ban_until: null }).eq("id", userId);
      if (error) throw error;

      setUsuarios((prev) => (prev || []).map((u) => (u.id === String(userId) ? { ...u, ban_until: null } : u)));
      alert("✅ Sanción retirada.");
      return true;
    } catch (e) {
      console.error("clearBan error:", e);
      showSupabaseError("No se pudo quitar sanción (RLS/policies).", e);
      return false;
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
          "id,titulo,title,descripcion,description,estado,status,city,ciudad,locality,localidad_es,imagen_url_principal,image_url,imagenes,created_at,owner_id,usuario_id"
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

  // ===================== ENVIAR MENSAJES =====================
  const sendSystemMessage = useCallback(async () => {
    if (!authUser?.id) return;
    if (canSendLoading) return;

    if (!canSendMsgs) {
      alert("No permitido. Activa usuarios.can_send_system_messages para tu usuario.");
      return;
    }

    const msg = String(msgBody || "").trim();
    if (!msg) return alert("Escribe el mensaje.");

    let target_all = false;
    let user_ids = null;

    if (msgMode === "all") {
      target_all = true;
      user_ids = null;
    } else if (msgMode === "one") {
      if (!msgSelectedOne) return alert("Elige un usuario.");
      target_all = false;
      user_ids = [msgSelectedOne];
    } else {
      const ids = Array.from(msgSelectedMany || []);
      if (!ids.length) return alert("Selecciona al menos 1 usuario.");
      target_all = false;
      user_ids = ids;
    }

    setMsgSending(true);
    try {
      const { data, error } = await supabase.rpc("send_system_message", {
        p_title: msgTitle ? String(msgTitle).trim() : null,
        p_message: msg,
        p_severity: msgSeverity,
        p_target_all: target_all,
        p_user_ids: user_ids,
      });

      if (error) throw error;

      if (!data?.ok) {
        alert("No se pudo enviar: " + (data?.error || "Error"));
        return;
      }

      alert(`✅ Enviado. Recibos: ${Number(data?.receipts || 0)}`);

      setMsgTitle("");
      setMsgBody("");
      setMsgSeverity("info");
      setMsgMode("all");
      clearMsgSelection();
    } catch (e) {
      console.error("sendSystemMessage error:", e);
      showSupabaseError("No se pudo enviar el mensaje.", e);
    } finally {
      setMsgSending(false);
    }
  }, [
    authUser?.id,
    canSendMsgs,
    canSendLoading,
    msgBody,
    msgTitle,
    msgSeverity,
    msgMode,
    msgSelectedOne,
    msgSelectedMany,
    clearMsgSelection,
  ]);

  // ---------------- filtering ----------------
  const qNorm = useMemo(() => String(q || "").toLowerCase().trim(), [q]);

  const articulosFiltered = useMemo(() => {
    let list = articulos || [];

    if (selectedOwnerId) {
      list = list.filter((a) => String(a.ownerId || "") === String(selectedOwnerId));
    }

    if (pubQuickFilter === "en_revision") {
      list = list.filter((a) => String(a?.estadoNorm || "").toLowerCase().trim() === "en_revision");
    }

    if (qNorm) {
      list = list.filter((a) => {
        const ownerName = ownerNames?.[a.ownerId] || "";
        const hay = [a?.id, a?.titulo, a?.estadoNorm, a?.city, a?.locality, a?.ownerId, ownerName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(qNorm);
      });
    }

    const byCreated = (a, b) =>
      (new Date(a?.created_at || 0).getTime() || 0) - (new Date(b?.created_at || 0).getTime() || 0);
    if (pubSort === "oldest") list = [...list].sort(byCreated);
    if (pubSort === "newest") list = [...list].sort((a, b) => -byCreated(a, b));

    return list;
  }, [articulos, qNorm, selectedOwnerId, ownerNames, pubQuickFilter, pubSort]);

  const usuariosFiltered = useMemo(() => {
    let list = usuarios || [];

    if (userQuickFilter === "blocked") list = list.filter((u) => !!u?.is_blocked);
    if (userQuickFilter === "banned")
      list = list.filter((u) => (u?.ban_until ? new Date(u.ban_until).getTime() > Date.now() : false));
    if (userQuickFilter === "hide_blocked") list = list.filter((u) => !u?.is_blocked);

    if (qNorm) {
      list = list.filter((u) => {
        const hay = [
          u?.name,
          u?.email,
          u?.ciudad,
          u?.localidad,
          u?.is_blocked ? "bloqueado" : "",
          u?.ban_until ? "sancionado" : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(qNorm);
      });
    }

    const byName = (a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), "es", { sensitivity: "base" });
    const byCreated = (a, b) =>
      (new Date(a?.created_at || 0).getTime() || 0) - (new Date(b?.created_at || 0).getTime() || 0);

    if (userSort === "name_az") list = [...list].sort(byName);
    if (userSort === "name_za") list = [...list].sort((a, b) => -byName(a, b));
    if (userSort === "oldest") list = [...list].sort(byCreated);
    if (userSort === "newest") list = [...list].sort((a, b) => -byCreated(a, b));

    return list;
  }, [usuarios, qNorm, userQuickFilter, userSort]);

  // ---------------- UI ----------------
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F7FB] flex items-center justify-center">
        <div className="bg-white rounded-3xl border border-gray-200/70 shadow-[0_10px_30px_rgba(17,24,39,0.06)] px-6 py-4">
          <p className="font-semibold text-gray-800">Cargando…</p>
        </div>
      </div>
    );
  }

  if (!authUser?.id) {
    return (
      <div className="min-h-screen bg-[#F6F7FB]">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="bg-white rounded-3xl shadow-[0_10px_30px_rgba(17,24,39,0.06)] border border-gray-200/70 p-6">
            <h1 className="text-2xl font-semibold text-gray-800">Master</h1>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-50 border border-gray-200/70 text-[11px] font-semibold text-gray-600">
              Panel maestro
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
              Usuarios y publicaciones
            </div>
            <p className="text-sm text-gray-500 font-medium mt-1">Debes iniciar sesión para entrar.</p>
            <div className="mt-6 flex gap-3">
              <Link
                to="/"
                className="px-4 py-2 rounded-2xl bg-gray-900 text-white font-semibold text-sm transition hover:shadow-sm active:scale-[0.99]"
              >
                Volver al Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!gateOk) {
    return (
      <div
        className="min-h-screen bg-[#F5F5F5]"
        style={{
          fontFamily: 'Arial, "DIN Alternate", "DIN", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        <div className="max-w-md mx-auto px-4 py-10">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
            <h1 className="text-2xl font-semibold text-gray-800">Acceso Master</h1>
            <p className="text-sm text-gray-500 font-medium mt-1">Ingresa la contraseña para entrar a esta página.</p>

            <form onSubmit={handleGateSubmit} className="mt-6 space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Contraseña</label>
                <input
                  value={gatePass}
                  onChange={(e) => setGatePass(e.target.value)}
                  type="password"
                  className="mt-2 w-full px-3 py-3 rounded-2xl border border-gray-200 font-medium text-sm"
                  placeholder="Contraseña"
                  autoComplete="current-password"
                />
              </div>

              {gateErr ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-3">
                  <p className="text-xs font-semibold text-red-700">{gateErr}</p>
                </div>
              ) : null}

              <button type="submit" className="w-full px-4 py-3 rounded-2xl bg-gray-900 text-white font-semibold text-sm">
                Entrar
              </button>

              <div className="flex gap-2">
                <Link
                  to="/"
                  className="flex-1 text-center px-4 py-3 rounded-2xl bg-gray-100 text-gray-900 font-semibold text-sm border border-gray-200 hover:border-gray-900"
                >
                  Home
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await supabase.auth.signOut();
                    } catch {}
                    window.location.href = "/";
                  }}
                  className="flex-1 px-4 py-3 rounded-2xl bg-white text-gray-900 font-semibold text-sm border border-gray-200 hover:border-gray-900"
                >
                  Cerrar sesión
                </button>
              </div>
            </form>

            <div className="mt-4 text-xs text-gray-500 font-medium">
              * Esta protección es solo frontend. Luego la reforzamos con roles/policies.
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={handleGateLogout}
                className="w-full px-4 py-3 rounded-2xl bg-gray-100 text-gray-900 font-semibold text-sm border border-gray-200 hover:border-gray-900"
              >
                Limpiar acceso guardado
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const showCount =
    tab === "publicaciones" ? articulosFiltered.length : tab === "usuarios" ? usuariosFiltered.length : 0;

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="bg-white rounded-3xl shadow-[0_10px_30px_rgba(17,24,39,0.06)] border border-gray-200/70 p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800">Master</h1>
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-50 border border-gray-200/70 text-[11px] font-semibold text-gray-600">
                Panel maestro
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                Usuarios · Publicaciones · Mensajes
              </div>
              <p className="text-sm text-gray-500 font-medium mt-1">
                Publicaciones + Usuarios (búsqueda, sanción, bloqueo, revisión y eliminación) + Mensajes al buzón.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setTab("publicaciones")}
                className={
                  "px-4 py-2 rounded-2xl font-semibold text-sm border " +
                  (tab === "publicaciones"
                    ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                    : "bg-white text-gray-900 border-gray-200 hover:border-gray-300 transition hover:shadow-sm active:scale-[0.99]")
                }
              >
                Publicaciones
              </button>

              <button
                type="button"
                onClick={() => { setTab("usuarios"); loadUsuarios(); loadActiveCounts(); }}
                className={
                  "px-4 py-2 rounded-2xl font-semibold text-sm border " +
                  (tab === "usuarios"
                    ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                    : "bg-white text-gray-900 border-gray-200 hover:border-gray-300 transition hover:shadow-sm active:scale-[0.99]")
                }
              >
                Usuarios
              </button>

              <button
                type="button"
                onClick={() => {
                  setTab("mensajes");
                  loadUsuarios({ force: true });
                  loadCanSendFlag();
                }}
                className={
                  "px-4 py-2 rounded-2xl font-semibold text-sm border " +
                  (tab === "mensajes"
                    ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                    : "bg-white text-gray-900 border-gray-200 hover:border-gray-300 transition hover:shadow-sm active:scale-[0.99]")
                }
              >
                Mensajes
              </button>

              <button
                type="button"
                onClick={() => {
                  loadUsuarios({ force: true });
                  loadArticulos({ force: true });
                  setActiveCountByOwner({});
                  loadActiveCounts({ force: true });
                  loadCanSendFlag();
                }}
                className="px-4 py-2 rounded-2xl bg-gray-100 text-gray-900 font-semibold text-sm border border-gray-200 hover:border-gray-300 transition hover:shadow-sm active:scale-[0.99]"
              >
                Refrescar
              </button>


            </div>
          </div>

          {/* Search + filtro activo (solo publicaciones/usuarios) */}
          {tab !== "mensajes" ? (
            <div className="mt-6 bg-gray-50 border border-gray-200/70 rounded-3xl p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Búsqueda</p>

              <div className="mt-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full md:flex-1 px-4 py-3 rounded-2xl border border-gray-200 font-medium text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                  placeholder={
                    tab === "publicaciones"
                      ? "Buscar por título, estado, ciudad, usuario…"
                      : "Buscar por nombre, email, ciudad, localidad…"
                  }
                />

                <div className="text-xs font-semibold text-gray-500">
                  Mostrando: <span className="text-gray-900">{showCount}</span>
                </div>

                {tab === "publicaciones" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl p-1">
                      <button
                        type="button"
                        onClick={() => setPubQuickFilter("all")}
                        className={
                          "px-3 py-2 rounded-2xl text-xs font-semibold " +
                          (pubQuickFilter === "all" ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50")
                        }
                      >
                        Todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setPubQuickFilter("en_revision")}
                        className={
                          "px-3 py-2 rounded-2xl text-xs font-semibold " +
                          (pubQuickFilter === "en_revision"
                            ? "bg-yellow-500 text-white"
                            : "text-gray-700 hover:bg-gray-50")
                        }
                      >
                        En revisión
                      </button>
                    </div>

                    <select
                      value={pubSort}
                      onChange={(e) => setPubSort(e.target.value)}
                      className="px-3 py-2 rounded-2xl border border-gray-200 bg-white text-xs font-semibold"
                      title="Ordenar publicaciones"
                    >
                      <option value="newest">Más nuevas</option>
                      <option value="oldest">Más antiguas</option>
                    </select>
                  </div>
                ) : null}

                {tab === "usuarios" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl p-1">
                      <button
                        type="button"
                        onClick={() => setUserQuickFilter("all")}
                        className={
                          "px-3 py-2 rounded-2xl text-xs font-semibold " +
                          (userQuickFilter === "all" ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50")
                        }
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserQuickFilter("blocked")}
                        className={
                          "px-3 py-2 rounded-2xl text-xs font-semibold " +
                          (userQuickFilter === "blocked"
                            ? "bg-red-600 text-white"
                            : "text-gray-700 hover:bg-gray-50")
                        }
                      >
                        Bloqueados
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserQuickFilter("banned")}
                        className={
                          "px-3 py-2 rounded-2xl text-xs font-semibold " +
                          (userQuickFilter === "banned"
                            ? "bg-orange-500 text-white"
                            : "text-gray-700 hover:bg-gray-50")
                        }
                      >
                        Sancionados
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserQuickFilter("hide_blocked")}
                        className={
                          "px-3 py-2 rounded-2xl text-xs font-semibold " +
                          (userQuickFilter === "hide_blocked"
                            ? "bg-gray-500 text-white"
                            : "text-gray-700 hover:bg-gray-50")
                        }
                      >
                        Ocultar bloqueados
                      </button>
                    </div>

                    <select
                      value={userSort}
                      onChange={(e) => setUserSort(e.target.value)}
                      className="px-3 py-2 rounded-2xl border border-gray-200 bg-white text-xs font-semibold"
                      title="Ordenar usuarios"
                    >
                      <option value="newest">Más recientes</option>
                      <option value="oldest">Más antiguos</option>
                      <option value="name_az">Nombre A → Z</option>
                      <option value="name_za">Nombre Z → A</option>
                    </select>
                  </div>
                ) : null}
              </div>

              {selectedOwnerId ? (
                <div className="mt-3 flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-2xl p-3">
                  <div className="text-xs font-medium text-gray-700">
                    Filtrando publicaciones de:{" "}
                    <span className="font-semibold text-gray-900">{selectedOwnerName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedOwnerId("")}
                    className="px-3 py-2 rounded-2xl bg-gray-100 text-gray-900 font-semibold text-xs border border-gray-200 hover:border-gray-900"
                  >
                    Quitar filtro
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* CONTENT */}
          {tab === "mensajes" ? (
            <div className="mt-6">
              <div className="bg-gray-50 border border-gray-200/70 rounded-3xl p-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Mensajes</p>
                    <h2 className="text-lg font-semibold text-gray-900 mt-1">Enviar al Buzón del usuario</h2>
                    <p className="text-sm text-gray-600 font-medium mt-1">
                      Sin roles. Solo: usuario logueado + <code>usuarios.can_send_system_messages=true</code>.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={loadCanSendFlag}
                      className="px-4 py-2 rounded-2xl bg-white text-gray-900 font-semibold text-sm border border-gray-200 hover:border-gray-900"
                    >
                      Verificar permiso
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearMsgSelection();
                        setMsgTitle("");
                        setMsgBody("");
                        setMsgSeverity("info");
                        setMsgMode("all");
                      }}
                      className="px-4 py-2 rounded-2xl bg-white text-gray-900 font-semibold text-sm border border-gray-200 hover:border-gray-900"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  {canSendLoading ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-3">
                      <p className="text-sm font-semibold text-gray-700">Verificando permiso…</p>
                    </div>
                  ) : !canSendMsgs ? (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                      <p className="text-sm font-semibold text-red-700">No permitido</p>
                      <p className="text-xs text-red-700 mt-1">
                        Activa <code>can_send_system_messages</code> en tu fila de <code>usuarios</code>.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
                      <p className="text-sm font-semibold text-green-800">Permitido ✅</p>
                      <p className="text-xs text-green-800 mt-1">Puedes enviar mensajes al Buzón.</p>
                    </div>
                  )}
                </div>

                <div className="mt-5 grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Modo</label>
                    <select
                      value={msgMode}
                      onChange={(e) => {
                        setMsgMode(e.target.value);
                        clearMsgSelection();
                      }}
                      disabled={msgSending}
                      className="mt-2 w-full px-3 py-3 rounded-2xl border border-gray-200 font-medium text-sm bg-white"
                    >
                      <option value="all">A todos</option>
                      <option value="one">A un usuario</option>
                      <option value="many">A varios</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Severidad</label>
                    <select
                      value={msgSeverity}
                      onChange={(e) => setMsgSeverity(e.target.value)}
                      disabled={msgSending}
                      className="mt-2 w-full px-3 py-3 rounded-2xl border border-gray-200 font-medium text-sm bg-white"
                    >
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Título (opcional)</label>
                    <input
                      value={msgTitle}
                      onChange={(e) => setMsgTitle(e.target.value)}
                      disabled={msgSending}
                      className="mt-2 w-full px-3 py-3 rounded-2xl border border-gray-200 font-medium text-sm bg-white"
                      placeholder="Ej: Aviso importante"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Mensaje</label>
                  <textarea
                    value={msgBody}
                    onChange={(e) => setMsgBody(e.target.value)}
                    disabled={msgSending}
                    className="mt-2 w-full px-3 py-3 rounded-2xl border border-gray-200 font-medium text-sm bg-white min-h-[120px]"
                    placeholder="Escribe el mensaje que verá el usuario en su Buzón…"
                  />
                </div>

                {msgMode !== "all" ? (
                  <div className="mt-4 bg-white border border-gray-200/70 rounded-3xl p-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      <div className="flex-1">
                        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Buscar usuario</label>
                        <input
                          value={msgUserQuery}
                          onChange={(e) => setMsgUserQuery(e.target.value)}
                          disabled={msgSending}
                          className="mt-2 w-full px-3 py-3 rounded-2xl border border-gray-200 font-medium text-sm bg-white"
                          placeholder="Nombre, email, ciudad, id…"
                        />
                      </div>

                      <div className="text-xs font-semibold text-gray-500">
                        {msgMode === "one" ? (
                          <span>
                            Elegido:{" "}
                            <span className="text-gray-900">
                              {msgSelectedOne ? ownerNames?.[msgSelectedOne] || "Usuario" : "—"}
                            </span>
                          </span>
                        ) : (
                          <span>
                            Seleccionados: <span className="text-gray-900">{Array.from(msgSelectedMany || []).length}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 max-h-[280px] overflow-auto space-y-2">
                      {(filteredUsersForMsg || []).map((u) => {
                        const id = String(u?.id || "");
                        const name = u?.name || "Usuario";
                        const city = u?.ciudad || "—";
                        const checked = msgSelectedMany?.has?.(id);

                        return (
                          <div key={id} className="flex items-center justify-between bg-gray-50 border border-gray-200/70 rounded-2xl p-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900 truncate">{name}</div>
                              <div className="text-xs text-gray-500 font-medium truncate">
                                {city} · {id.slice(0, 8)}…
                              </div>
                            </div>

                            {msgMode === "one" ? (
                              <button
                                type="button"
                                onClick={() => setMsgSelectedOne(id)}
                                disabled={msgSending}
                                className={
                                  "px-3 py-2 rounded-2xl text-xs font-semibold border " +
                                  (msgSelectedOne === id
                                    ? "bg-gray-900 text-white border-gray-900"
                                    : "bg-white text-gray-900 border-gray-200 hover:border-gray-900")
                                }
                              >
                                {msgSelectedOne === id ? "Elegido" : "Elegir"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleMany(id)}
                                disabled={msgSending}
                                className={
                                  "px-3 py-2 rounded-2xl text-xs font-semibold border " +
                                  (checked
                                    ? "bg-gray-900 text-white border-gray-900"
                                    : "bg-white text-gray-900 border-gray-200 hover:border-gray-900")
                                }
                              >
                                {checked ? "Quitar" : "Agregar"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-xs text-gray-500 font-medium">
                    {canSendMsgs ? (
                      <span>Listo para enviar.</span>
                    ) : (
                      <span className="text-red-700">No permitido hasta que actives el flag.</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={sendSystemMessage}
                    disabled={msgSending || !canSendMsgs}
                    className={
                      "px-5 py-3 rounded-2xl font-semibold text-sm transition active:scale-[0.99] " +
                      (msgSending || !canSendMsgs ? "bg-gray-200 text-gray-500" : "bg-gray-900 text-white hover:shadow-sm")
                    }
                  >
                    {msgSending ? "Enviando…" : "Enviar"}
                  </button>
                </div>
              </div>
            </div>
          ) : tab === "publicaciones" ? (
            <div className="mt-6">
              {artLoading ? (
                <div className="bg-white border border-gray-200/70 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-gray-700">Cargando publicaciones…</p>
                </div>
              ) : artError ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-red-700">Error</p>
                  <p className="text-xs text-red-700 mt-1">{artError}</p>
                </div>
              ) : articulosFiltered.length === 0 ? (
                <div className="bg-white border border-gray-200/70 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-gray-700">No hay publicaciones para mostrar.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {articulosFiltered.map((a) => {
                    const pill = articuloEstadoPill(a.estadoNorm);
                    const ownerName =
                      ownerNames?.[a.ownerId] || (a.ownerId ? `ID: ${String(a.ownerId).slice(0, 8)}…` : "—");

                    return (
                      <div
                        key={a.id}
                        className="bg-white border border-gray-200/70 rounded-3xl p-5 hover:border-gray-300 transition hover:shadow-sm"
                      >
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${pill.cls}`}>
                                {pill.txt}
                              </span>
                              <span className="text-sm font-semibold text-gray-900">{a.titulo}</span>
                              <span className="text-xs text-gray-500 font-medium">
                                {a.city ? `${a.city}${a.locality ? `, ${a.locality}` : ""}` : ""}
                              </span>
                            </div>

                            <div className="mt-2 text-xs text-gray-600 font-medium leading-relaxed">
                              Usuario:{" "}
                              <button
                                type="button"
                                className="font-semibold text-indigo-700 underline decoration-dotted hover:decoration-solid"
                                onClick={() => {
                                  if (!a.ownerId) return;
                                  setSelectedOwnerId(String(a.ownerId));
                                  setTab("publicaciones");
                                }}
                                title="Ver solo publicaciones de este usuario"
                              >
                                {ownerName}
                              </button>{" "}
                              {a.created_at ? <span className="text-gray-400">· {fmtDate(a.created_at)}</span> : null}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openPreview(a.id)}
                                className="px-4 py-2 rounded-2xl bg-white text-gray-900 font-semibold text-xs border border-gray-200 hover:border-gray-900"
                              >
                                Ver (preview)
                              </button>

                              <button
                                type="button"
                                onClick={() => setArticleStatus(a.id, "en_revision")}
                                className="px-4 py-2 rounded-2xl bg-yellow-100 text-yellow-900 font-semibold text-xs border border-yellow-200 hover:border-yellow-900"
                              >
                                En revisión
                              </button>

                              <button
                                type="button"
                                onClick={() => setArticleStatus(a.id, "disponible")}
                                className="px-4 py-2 rounded-2xl bg-gray-200 text-gray-900 font-semibold text-xs border border-gray-300 hover:border-gray-900"
                              >
                                Disponible
                              </button>

                              <button
                                type="button"
                                onClick={() => deleteArticleDeep(a.id)}
                                className="px-4 py-2 rounded-2xl bg-red-100 text-red-800 font-semibold text-xs border border-red-200 hover:border-red-800"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>

                          <div className="shrink-0 w-full md:w-56">
                            <div className="rounded-3xl overflow-hidden border border-gray-200/70 bg-gray-50">
                              {a.img ? (
                                <img
                                  src={a.img}
                                  alt="thumb"
                                  className="w-full h-40 object-cover"
                                  onError={(e) => (e.currentTarget.style.display = "none")}
                                />
                              ) : (
                                <div className="h-40 flex items-center justify-center text-xs font-semibold text-gray-400">
                                  Sin imagen
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-6">
              {usrLoading ? (
                <div className="bg-white border border-gray-200/70 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-gray-700">Cargando usuarios…</p>
                </div>
              ) : usrError ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-red-700">Error</p>
                  <p className="text-xs text-red-700 mt-1">{usrError}</p>
                </div>
              ) : usuariosFiltered.length === 0 ? (
                <div className="bg-white border border-gray-200/70 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-gray-700">No hay usuarios para mostrar.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {usuariosFiltered.map((u) => {
                    const isBanned = u?.ban_until ? new Date(u.ban_until).getTime() > Date.now() : false;
                    const activeCount = Number(activeCountByOwner?.[u.id] || 0);

                    return (
                      <div
                        key={u.id}
                        className="bg-white border border-gray-200/70 rounded-3xl p-5 hover:border-gray-300 transition hover:shadow-sm"
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {u.is_blocked ? (
                                <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 border border-red-200 text-[10px] font-semibold">
                                  BLOQUEADO
                                </span>
                              ) : (
                                <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200 text-[10px] font-semibold">
                                  ACTIVO
                                </span>
                              )}

                              {isBanned ? (
                                <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-900 border border-orange-200 text-[10px] font-semibold">
                                  SANCIONADO
                                </span>
                              ) : null}

                              <button
                                type="button"
                                className="text-sm font-semibold text-indigo-700 underline decoration-dotted hover:decoration-solid truncate"
                                onClick={() => {
                                  setSelectedOwnerId(String(u.id));
                                  setTab("publicaciones");
                                }}
                                title="Ver solo publicaciones de este usuario"
                              >
                                {u.name}
                              </button>
                            </div>

                            <div className="mt-2 text-xs text-gray-600 font-medium leading-relaxed">
                              <span className="text-gray-500 uppercase tracking-widest text-[10px] font-semibold">Correo</span>
                              <span className="mx-2 text-gray-300">·</span>{" "}
                              <span className="font-semibold text-gray-900 break-all">
                                {u.email && String(u.email).trim() ? u.email : "—"}
                              </span>
                              <span className="mx-2 text-gray-300">·</span>
                              <span className="text-gray-500 uppercase tracking-widest text-[10px] font-semibold">Ciudad</span>
                              <span className="mx-2 text-gray-300">·</span>{" "}
                              <span className="font-semibold text-gray-900">{u.ciudad || "—"}</span>
                              <span className="mx-2 text-gray-300">·</span>
                              <span className="text-gray-500 uppercase tracking-widest text-[10px] font-semibold">Localidad</span>
                              <span className="mx-2 text-gray-300">·</span>{" "}
                              <span className="font-semibold text-gray-900">{u.localidad || "—"}</span>
                            </div>

                            <div className="mt-2 text-xs text-gray-600 font-medium leading-relaxed">
                              <span className="text-gray-500">Creado:</span>{" "}
                              <span className="font-semibold text-gray-900">
                                {u.created_at ? fmtDateOnly(u.created_at) : "—"}
                              </span>
                              <span className="mx-2 text-gray-300">·</span>
                              <span className="text-gray-500">Publicaciones activas:</span>{" "}
                              <span className="font-semibold text-gray-900">{activeCount}</span>
                              <span className="mx-2 text-gray-300">·</span>
                              <span className="text-gray-500">Sanción hasta:</span>{" "}
                              <span className="font-semibold text-gray-900">
                                {u.ban_until ? fmtDate(u.ban_until) : "—"}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setMsgMode("one");
                                setMsgSelectedOne(u.id);
                                setMsgUserQuery(u.name || "");
                                setTab("mensajes");
                                loadCanSendFlag();
                              }}
                              className="px-4 py-2 rounded-2xl bg-indigo-50 text-indigo-800 font-semibold text-xs border border-indigo-200 hover:border-indigo-800"
                            >
                              ✉ Mensaje
                            </button>

                            <button
                              type="button"
                              onClick={() => setBlocked(u.id, !u.is_blocked)}
                              className={
                                "px-4 py-2 rounded-2xl font-semibold text-xs border " +
                                (u.is_blocked
                                  ? "bg-white text-gray-900 border-gray-200 hover:border-gray-300 transition hover:shadow-sm active:scale-[0.99]"
                                  : "bg-red-100 text-red-800 border-red-200 hover:border-red-800")
                              }
                            >
                              {u.is_blocked ? "Desbloquear" : "Bloquear"}
                            </button>

                            <button
                              type="button"
                              onClick={() => applyBanDays(u.id, 1)}
                              className="px-4 py-2 rounded-2xl bg-orange-50 text-orange-900 font-semibold text-xs border border-orange-200 hover:border-orange-900"
                            >
                              Sancionar 1 día
                            </button>

                            <button
                              type="button"
                              onClick={() => applyBanDays(u.id, 3)}
                              className="px-4 py-2 rounded-2xl bg-orange-50 text-orange-900 font-semibold text-xs border border-orange-200 hover:border-orange-900"
                            >
                              3 días
                            </button>

                            <button
                              type="button"
                              onClick={() => applyBanDays(u.id, 7)}
                              className="px-4 py-2 rounded-2xl bg-orange-50 text-orange-900 font-semibold text-xs border border-orange-200 hover:border-orange-900"
                            >
                              7 días
                            </button>

                            <button
                              type="button"
                              onClick={() => clearBan(u.id)}
                              className="px-4 py-2 rounded-2xl bg-white text-gray-900 font-semibold text-xs border border-gray-200 hover:border-gray-900"
                            >
                              Quitar sanción
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* PREVIEW MODAL */}
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
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Preview artículo</p>
                <h3 className="text-lg font-semibold text-gray-900 mt-1 leading-tight">
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
                className="px-4 py-2 rounded-2xl bg-gray-900 text-white font-semibold text-sm transition hover:shadow-sm active:scale-[0.99]"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4">
              {previewLoading ? (
                <div className="bg-gray-50 border border-gray-200/70 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-gray-700">Cargando…</p>
                </div>
              ) : previewError ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-red-700">Error</p>
                  <p className="text-xs text-red-700 mt-1">{previewError}</p>
                </div>
              ) : previewArticle ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 border border-gray-200/70 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Estado</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">
                      {String(previewArticle?.estado || previewArticle?.status || "—")}
                    </p>
                  </div>

                  <div className="bg-gray-50 border border-gray-200/70 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Descripción</p>
                    <p className="text-sm text-gray-700 font-medium mt-1 whitespace-pre-wrap">
                      {previewArticle?.descripcion || previewArticle?.description || "—"}
                    </p>
                  </div>

                  <div className="bg-gray-50 border border-gray-200/70 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Ubicación</p>
                    <p className="text-sm font-medium text-gray-700 mt-1">
                      {previewArticle?.localidad_es || previewArticle?.locality || ""}{" "}
                      {previewArticle?.ciudad || previewArticle?.city
                        ? `, ${previewArticle?.ciudad || previewArticle?.city}`
                        : ""}
                    </p>
                  </div>

                  <div className="bg-gray-50 border border-gray-200/70 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Imagen</p>
                    <div className="mt-2 rounded-2xl overflow-hidden bg-white border border-gray-200/70">
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
                      <div className="p-3 text-xs text-gray-500 font-medium">
                        Si no aparece imagen, puede ser ruta privada o vacía.
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200/70 rounded-2xl p-4">
                    <p className="text-xs text-gray-500 font-medium">
                      ID: <span className="font-semibold">{String(previewArticle?.id || "")}</span>
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
