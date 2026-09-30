import { useEffect, useState } from "react";
import { supabase } from "../supabase/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // 1) Cuando entras desde el link del email, Supabase pone tokens en la URL.
  // 2) supabase.auth.getSession() + onAuthStateChange nos permite saber si ya hay sesión de recovery.
  useEffect(() => {
    let unsub = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session || null;
      setHasSession(!!session);
      setReady(true);

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session2) => {
        setHasSession(!!session2);
        setReady(true);
      });
      unsub = sub?.subscription;
    })();

    return () => unsub?.unsubscribe?.();
  }, []);

  const onSave = async (e) => {
    e.preventDefault();
    setMsg("");

    if (!pass1 || pass1.length < 6) {
      setMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (pass1 !== pass2) {
      setMsg("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;

      setMsg("✅ Contraseña actualizada. Ya puedes iniciar sesión.");
      // opcional: cerrar sesión de recovery y mandar al home/login
      await supabase.auth.signOut();
      setTimeout(() => nav("/"), 900);
    } catch (err) {
      setMsg(err?.message || "No se pudo actualizar la contraseña.");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm px-6 py-4">
          <p className="font-black text-gray-800">Cargando…</p>
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <h1 className="text-xl font-black text-gray-900">Enlace inválido o vencido</h1>
          <p className="mt-2 text-sm text-gray-600 font-bold">
            Vuelve a solicitar “Olvidé mi contraseña” para recibir un nuevo enlace.
          </p>
          <button
            className="mt-6 w-full px-4 py-3 rounded-2xl bg-gray-900 text-white font-black text-sm"
            onClick={() => nav("/")}
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
        <h1 className="text-xl font-black text-gray-900">Restablecer contraseña</h1>
        <p className="mt-2 text-sm text-gray-600 font-bold">
          Escribe tu nueva contraseña.
        </p>

        <form onSubmit={onSave} className="mt-6 space-y-3">
          <input
            type="password"
            placeholder="Nueva contraseña"
            value={pass1}
            onChange={(e) => setPass1(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 font-bold text-sm"
          />
          <input
            type="password"
            placeholder="Confirmar nueva contraseña"
            value={pass2}
            onChange={(e) => setPass2(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 font-bold text-sm"
          />

          {msg ? (
            <div className="text-sm font-black text-gray-800 bg-gray-50 border border-gray-100 rounded-2xl p-3">
              {msg}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-3 rounded-2xl bg-gray-900 text-white font-black text-sm disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}