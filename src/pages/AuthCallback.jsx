import { useEffect, useState } from "react";
import { supabase } from "../supabase/supabaseClient";

export default function AuthCallback() {
  const [status, setStatus] = useState("Procesando confirmación...");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!alive) return;

        if (data?.session?.user) {
          setStatus("¡Cuenta confirmada! Redirigiendo al inicio...");
          setTimeout(() => {
            window.location.href = "/";
          }, 900);
        } else {
          // Puede estar confirmada pero aún sin sesión (según flujo)
          setStatus("Cuenta confirmada. Ahora inicia sesión en MiBatute.");
        }
      } catch (e) {
        console.error("AuthCallback error:", e);
        if (!alive) return;
        setStatus("No se pudo procesar el enlace. Intenta iniciar sesión o solicita otro correo.");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center">
        <h1 className="text-2xl font-black text-gray-800">MiBatute</h1>
        <p className="mt-4 text-gray-600">{status}</p>

        <button
          className="mt-6 w-full py-3 rounded-xl font-black uppercase bg-forest-green text-white hover:bg-opacity-90"
          onClick={() => (window.location.href = "/")}
          type="button"
        >
          Ir al inicio
        </button>
      </div>
    </div>
  );
}