// src/components/AuthModal.jsx
import { useEffect, useState } from "react";
import { X, Mail, Lock, User, Phone } from "lucide-react";

// ✅ Registro con Supabase (tu servicio)
import { registerUser } from "../supabase/authService";

// ✅ Login con Supabase
import { supabase } from "../supabase/supabaseClient";

// ✅ Ciudades / Localidades
import { LOCATIONS } from "../data/locations";

export default function AuthModal({ isOpen, onClose, onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados de inputs
  const [nombre, setNombre] = useState("");
  const [movil, setMovil] = useState("");
  const [ciudad, setCiudad] = useState(""); // obligar selección
  const [localidad, setLocalidad] = useState(""); // obligar selección
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const resetForm = () => {
    setNombre("");
    setMovil("");
    setCiudad("");
    setLocalidad("");
    setEmail("");
    setPassword("");
    setIsSubmitting(false);
  };

  // ✅ Si el modal se cierra desde afuera (isOpen pasa a false), limpiamos estado
  useEffect(() => {
    if (!isOpen) {
      resetForm();
      setIsRegister(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = () => {
    resetForm();
    setIsRegister(false);
    onClose?.();
  };

  const handleToggleMode = () => {
    resetForm();
    setIsRegister((prev) => !prev);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const nombreClean = nombre.trim();
      const movilClean = movil.trim();
      const emailClean = email.trim();

      // ✅ En migración: manda español + inglés para compatibilidad
      const extraData = {
        // Español (nuevo)
        nombre: nombreClean,
        movil: movilClean,
        ciudad,
        localidad_es: localidad,

        // Inglés (legacy / compat)
        city: ciudad,
        locality: localidad,
        location: localidad,
      };

      const result = await registerUser(emailClean, password.trim(), extraData);

      if (!result) {
        alert("Error inesperado: no hubo respuesta del servidor.");
        return;
      }

      if (result.success) {
        alert("¡Bienvenido a MiBatute! Registro exitoso.");
        onLogin?.();
        handleClose();
      } else {
        alert("Error al registrar: " + (result.error || "No se pudo registrar"));
      }
    } catch (err) {
      console.error("REGISTER ERROR:", err);
      alert("No se pudo registrar. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) throw error;

      alert("¡Bienvenido!");
      onLogin?.();
      handleClose();
    } catch (err) {
      console.error("LOGIN ERROR:", err);

      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("invalid") || msg.includes("credentials")) {
        alert("Correo o contraseña incorrectos.");
      } else if (msg.includes("email not confirmed")) {
        alert("Debes confirmar tu correo antes de iniciar sesión.");
      } else if (msg.includes("too many requests")) {
        alert("Demasiados intentos. Intenta más tarde.");
      } else {
        alert("No se pudo iniciar sesión. Intenta de nuevo.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">
              {isRegister ? "Crea tu cuenta" : "¡Hola de nuevo!"}
            </h2>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-100 rounded-full"
              aria-label="Cerrar"
              type="button"
              disabled={isSubmitting}
            >
              <X size={20} />
            </button>
          </div>

          <form className="space-y-4" onSubmit={isRegister ? handleRegister : handleLogin}>
            {isRegister && (
              <>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Nombre completo"
                    className="w-full border rounded-xl p-3 pl-10 outline-none focus:ring-2 focus:ring-forest-green"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                    disabled={isSubmitting}
                    autoComplete="name"
                  />
                </div>

                <div className="relative">
                  <Phone className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input
                    type="tel"
                    placeholder="Número móvil"
                    className="w-full border rounded-xl p-3 pl-10 outline-none focus:ring-2 focus:ring-forest-green"
                    value={movil}
                    onChange={(e) => setMovil(e.target.value)}
                    required
                    disabled={isSubmitting}
                    autoComplete="tel"
                  />
                </div>

                {/* SELECTS CIUDAD / LOCALIDAD */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={ciudad}
                    onChange={(e) => {
                      setCiudad(e.target.value);
                      setLocalidad("");
                    }}
                    className="border rounded-xl p-3 outline-none focus:ring-2 focus:ring-forest-green bg-white"
                    required
                    disabled={isSubmitting}
                    autoComplete="address-level2"
                  >
                    <option value="" disabled>
                      Selecciona tu ciudad
                    </option>
                    {Object.keys(LOCATIONS).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    value={localidad}
                    onChange={(e) => setLocalidad(e.target.value)}
                    disabled={!ciudad || isSubmitting}
                    className="border rounded-xl p-3 outline-none focus:ring-2 focus:ring-forest-green bg-white disabled:bg-gray-100 disabled:text-gray-400"
                    required
                    autoComplete="address-level3"
                  >
                    <option value="" disabled>
                      Selecciona tu localidad
                    </option>
                    {(LOCATIONS[ciudad] || []).map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="relative">
              <Mail className="absolute left-3 top-3 text-gray-400" size={18} />
              <input
                type="email"
                placeholder="Correo electrónico"
                className="w-full border rounded-xl p-3 pl-10 outline-none focus:ring-2 focus:ring-forest-green"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="email"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
              <input
                type="password"
                placeholder="Contraseña (mín. 6 caracteres)"
                className="w-full border rounded-xl p-3 pl-10 outline-none focus:ring-2 focus:ring-forest-green"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={isSubmitting}
                autoComplete={isRegister ? "new-password" : "current-password"}
              />
            </div>

            <button
              className={`w-full py-3 rounded-xl font-bold transition ${
                isSubmitting
                  ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                  : "bg-forest-green text-white hover:bg-opacity-90"
              }`}
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Procesando..." : isRegister ? "Registrarme" : "Entrar"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            {isRegister ? "¿Ya tienes cuenta?" : "¿Eres nuevo en MiBatute?"}
            <button
              onClick={handleToggleMode}
              className="ml-1 text-forest-green font-bold hover:underline"
              type="button"
              disabled={isSubmitting}
            >
              {isRegister ? "Inicia sesión" : "Regístrate aquí"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
