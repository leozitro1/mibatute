import StyledSelect from "./StyledSelect.jsx";
// src/components/AuthModal.jsx
import { useEffect, useRef, useState } from "react";
import {LEGAL_READY,registrationAcceptance} from '../legal/config.js';
import { X, Mail, Lock, User, Phone } from "lucide-react";

// ✅ Registro/Login (tu servicio)
import { registerUser, loginUser } from "../supabase/authService";

// ✅ para reenviar confirmación + leer usuario actual + upsert
import { supabase } from "../supabase/supabaseClient";

// ✅ Ciudades / Localidades
import useLocations from "../data/useLocations.js";

// ✅ Limpia payload y SOLO permite estas columnas en usuarios
const sanitizeUsuariosPayload = (obj) => {
  const allowed = ["email", "nombre", "movil", "ciudad", "localidad", "direccion", "foto_url"];
  const payload = {};
  for (const k of allowed) {
    const v = obj?.[k];
    if (v !== null && v !== undefined) payload[k] = v;
  }
  return payload;
};

// ✅ arma perfil desde metadata + fallback a campos del form
const buildProfileFromAuthMeta = (authUser, fallbackForm = {}) => {
  const m = authUser?.user_metadata || {};
  return {
    email: String(authUser?.email || fallbackForm?.email || "").trim().toLowerCase(),
    nombre: String(m?.nombre || fallbackForm?.nombre || "").trim(),
    movil: String(m?.movil || fallbackForm?.movil || "").trim(),
    ciudad: String(m?.ciudad || m?.city || fallbackForm?.ciudad || "").trim(),
    localidad: String(
      m?.localidad_es || m?.localidad || m?.locality || m?.location || fallbackForm?.localidad || ""
    ).trim(),
    direccion: String(m?.direccion || m?.address || fallbackForm?.direccion || "").trim(),
    foto_url: String(m?.foto_url || m?.avatar_url || "").trim(),
  };
};

// ✅ sincroniza datos Auth -> tabla usuarios (requiere estar logueado)
async function syncUsuariosFromAuthUser(authUser, fallbackForm = {}) {
  try {
    const userId = authUser?.id;
    if (!userId) return { ok: false, reason: "no-user-id" };

    const profile = buildProfileFromAuthMeta(authUser, fallbackForm);
    const payload = sanitizeUsuariosPayload(profile);

    const hasAny =
      payload.nombre || payload.movil || payload.ciudad || payload.localidad || payload.direccion || payload.foto_url;
    if (!hasAny) return { ok: true, skipped: true };

    const { error } = await supabase.from("usuarios").upsert([{ id: userId, ...payload }], { onConflict: "id" });

    if (error) {
      console.log("syncUsuariosFromAuthUser error:", error);
      return { ok: false, error };
    }

    return { ok: true };
  } catch (e) {
    console.log("syncUsuariosFromAuthUser catch:", e);
    return { ok: false, error: e };
  }
}

export default function AuthModal({ isOpen, onClose, onLogin }) {
  const { LOCATIONS } = useLocations();
  const [isRegister, setIsRegister] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ NUEVO: modo recuperación
  const [mode, setMode] = useState("auth"); // auth | forgot
  const [forgotSent, setForgotSent] = useState(false);

  // ✅ Cooldown para resend (evita spam + 429)
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef(null);

  // Estados de inputs
  const [nombre, setNombre] = useState("");
  const [movil, setMovil] = useState("");
  const [ciudad, setCiudad] = useState(""); // obligar selección
  const [localidad, setLocalidad] = useState(""); // obligar selección
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy,setAcceptPrivacy]=useState(false);
  const [confirmAdult,setConfirmAdult]=useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const resetForm = () => {
    setNombre("");
    setMovil("");
    setCiudad("");
    setLocalidad("");
    setAcceptTerms(false);setAcceptPrivacy(false);setConfirmAdult(false);
    setEmail("");
    setPassword("");
    setIsSubmitting(false);
    setResendCooldown(0);
    setMode("auth");
    setForgotSent(false);

    if (resendTimerRef.current) {
      clearInterval(resendTimerRef.current);
      resendTimerRef.current = null;
    }
  };

  // ✅ Si el modal se cierra desde afuera (isOpen pasa a false), limpiamos estado
  useEffect(() => {
    if (!isOpen) {
      resetForm();
      setIsRegister(false);
    }
  }, [isOpen]);

  // ✅ Manejo del contador de cooldown
  useEffect(() => {
    if (!isOpen) return;

    if (resendTimerRef.current) {
      clearInterval(resendTimerRef.current);
      resendTimerRef.current = null;
    }

    if (resendCooldown > 0) {
      resendTimerRef.current = setInterval(() => {
        setResendCooldown((s) => {
          if (s <= 1) {
            if (resendTimerRef.current) {
              clearInterval(resendTimerRef.current);
              resendTimerRef.current = null;
            }
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }

    return () => {
      if (resendTimerRef.current) {
        clearInterval(resendTimerRef.current);
        resendTimerRef.current = null;
      }
    };
  }, [resendCooldown, isOpen]);

  const handleClose = () => {
    resetForm();
    setIsRegister(false);
    onClose?.();
  };

  const handleToggleMode = () => {
    setNombre("");
    setMovil("");
    setCiudad("");
    setLocalidad("");
    setAcceptTerms(false);setAcceptPrivacy(false);setConfirmAdult(false);
    setPassword("");
    setIsSubmitting(false);
    setResendCooldown(0);
    setMode("auth");
    setForgotSent(false);

    if (resendTimerRef.current) {
      clearInterval(resendTimerRef.current);
      resendTimerRef.current = null;
    }
    setIsRegister((prev) => !prev);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!registrationAcceptance(acceptTerms,acceptPrivacy,confirmAdult)) {
      alert("Revisa las condiciones y confirma las tres opciones para crear tu cuenta.");
      return;
    }

    setIsSubmitting(true);

    try {
      const nombreClean = nombre.trim();
      const movilClean = movil.trim();
      const emailClean = email.trim();

      const extraData = {
        legal_acceptance:registrationAcceptance(acceptTerms,acceptPrivacy,confirmAdult),
        nombre: nombreClean,
        movil: movilClean,
        ciudad,
        localidad_es: localidad,
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
        if (!result.needsEmailConfirmation) {
          try {
            const { data } = await supabase.auth.getUser();
            if (data?.user) {
              await syncUsuariosFromAuthUser(data.user, {
                nombre: nombreClean,
                movil: movilClean,
                email: emailClean,
                ciudad,
                localidad,
              });
            }
          } catch (e2) {
            console.log("sync inmediato (register) warn:", e2);
          }

          alert("¡Bienvenido a MiBatute! Registro exitoso.");
          onLogin?.();
          handleClose();
          return;
        }

        alert(
          "Listo ✅ Te enviamos un correo para ACTIVAR tu cuenta.\n\n" +
            "1) Revisa tu bandeja y SPAM\n" +
            "2) Abre el correo y toca Confirmar\n" +
            "3) Luego vuelves e inicias sesión"
        );

        setIsRegister(false);
        setPassword("");
        return;
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
      const result = await loginUser(email.trim(), password.trim());
      if (!result?.success) throw new Error(result?.error || "No se pudo iniciar sesión");

      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          const sync = await syncUsuariosFromAuthUser(data.user, {
            nombre: nombre.trim(),
            movil: movil.trim(),
            email: email.trim(),
            ciudad,
            localidad,
          });

          if (!sync?.ok && sync?.error) {
            console.log("SYNC USUARIOS FALLÓ (RLS?):", sync.error);
          }
        }
      } catch (e2) {
        console.log("sync (login) warn:", e2);
      }

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

  // ✅ NUEVO: enviar recovery email (olvide contraseña)
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const emailClean = String(email || "").trim();
    if (!emailClean) return alert("Escribe tu correo.");

    setIsSubmitting(true);
    setForgotSent(false);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailClean, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setForgotSent(true);
    } catch (err) {
      console.error("resetPasswordForEmail error:", err);
      alert(err?.message || "No se pudo enviar el correo. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ✅ Reenviar correo de activación (Signup confirmation)
  const handleResendConfirmation = async () => {
    const emailClean = email.trim();
    if (!emailClean) {
      alert("Escribe tu correo primero para reenviar la activación.");
      return;
    }

    if (isSubmitting || resendCooldown > 0) return;

    setIsSubmitting(true);

    try {
      const emailRedirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.resend({
        type: "signup",
        email: emailClean,
        options: { emailRedirectTo },
      });

      if (error) throw error;

      alert("Listo ✅ Te reenviamos el correo. Revisa bandeja y SPAM.");
      setResendCooldown(60);
    } catch (e) {
      console.error("RESEND ERROR:", e);

      const msg = String(e?.message || "").toLowerCase();
      const status = e?.status || e?.code;

      if (status === 429 || msg.includes("too many requests")) {
        alert("Demasiados intentos seguidos. Espera 1-5 minutos y vuelve a intentar.");
        setResendCooldown(60);
        return;
      }

      alert("No se pudo reenviar el correo.\nVerifica el correo o intenta registrarte de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="marketplace-overlay auth-overlay fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label={mode === "forgot" ? "Recuperar contraseña" : isRegister ? "Crear cuenta" : "Ingresar"} className="marketplace-surface marketplace-modal auth-dialog bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-6">
          <div className="relative mb-6 flex flex-col items-center gap-3 text-center">
            <img src="/logo.png" alt="MiBatute" width="88" height="88" className="h-22 w-22 object-contain" />
            <h2 className="px-8 text-2xl font-bold text-gray-800">
              {mode === "forgot" ? "Recuperar contraseña" : isRegister ? "Crea tu cuenta" : "¡Hola de nuevo!"}
            </h2>
            <button
              onClick={handleClose}
              className="site-icon-close absolute right-0 top-0 inline-flex items-center justify-center p-1 hover:bg-gray-100 rounded-full"
              aria-label="Cerrar"
              type="button"
              disabled={isSubmitting}
            >
              <X size={20} />
            </button>
          </div>

          {/* ===================== FORGOT PASSWORD ===================== */}
          {mode === "forgot" ? (
            <form className="space-y-4" onSubmit={handleForgotPassword}>
              <p className="text-sm text-gray-600 font-bold">
                Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña.
              </p>

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

              {forgotSent ? (
                <div className="bg-green-50 border border-green-100 rounded-2xl p-3">
                  <p className="text-sm font-black text-green-800">✅ Enlace enviado</p>
                  <p className="text-xs text-green-800 font-bold mt-1">
                    Revisa tu correo (y spam). Abre el enlace para cambiar tu contraseña.
                  </p>
                </div>
              ) : null}

              <button
                className={`w-full py-3 rounded-xl font-bold transition ${
                  isSubmitting
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-forest-green text-white hover:bg-opacity-90"
                }`}
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Enviando..." : "Enviar enlace"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode("auth");
                  setForgotSent(false);
                }}
                className="w-full py-3 rounded-xl font-bold bg-gray-100 text-gray-900 border border-gray-200"
                disabled={isSubmitting}
              >
                Volver a iniciar sesión
              </button>
            </form>
          ) : (
            /* ===================== AUTH (LOGIN/REGISTER) ===================== */
            <>
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
                        placeholder="Celular de 10 dígitos"
                        inputMode="numeric"
                        maxLength={10}
                        minLength={10}
                        pattern="[0-9]{10}"
                        title="Escribe los 10 dígitos de tu celular, sin indicativo de país."
                        className="w-full border rounded-xl p-3 pl-10 outline-none focus:ring-2 focus:ring-forest-green"
                        value={movil}
                        onChange={(e) => setMovil(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        required
                        disabled={isSubmitting}
                        autoComplete="tel"
                      />
                    </div>

                    {/* SELECTS CIUDAD / LOCALIDAD */}
                    <div className="grid grid-cols-2 gap-2">
                      <StyledSelect
                        value={ciudad}
                        onChange={(e) => {
                          setCiudad(e.target.value);
                          setLocalidad("");
    setAcceptTerms(false);setAcceptPrivacy(false);setConfirmAdult(false);
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
                      </StyledSelect>

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


                {isRegister && (
                  <><label className="flex items-start gap-3 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      disabled={isSubmitting}
                      className="mt-1 h-4 w-4 accent-forest-green"
                    />
                    <span className="leading-snug">
                      Acepto los{" "}
                      <a
                        href="/terminos"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-black text-forest-green hover:underline"
                      >
                        Términos y Condiciones
                      </a>
                      .
                    </span>
                  </label>
                  <label className="flex items-start gap-3 text-sm text-gray-600"><input type="checkbox" checked={acceptPrivacy} onChange={event=>setAcceptPrivacy(event.target.checked)} disabled={isSubmitting} className="mt-1 h-4 w-4 accent-forest-green"/><span>Autorizo el tratamiento de mis datos para gestionar la cuenta y las funciones solicitadas, conforme a la <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="font-semibold text-forest-green underline">Política de privacidad</a>. Esta autorización no incluye publicidad comercial.</span></label>
                  <label className="flex items-start gap-3 text-sm text-gray-600"><input type="checkbox" checked={confirmAdult} onChange={event=>setConfirmAdult(event.target.checked)} disabled={isSubmitting} className="mt-1 h-4 w-4 accent-forest-green"/><span>Confirmo que tengo 18 años o más.</span></label>
                  {!LEGAL_READY&&<p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">El sitio está en pruebas. Puedes registrarte tras revisar y aceptar estos documentos, que siguen en revisión. Consulta el <a href="/privacidad" className="underline" target="_blank" rel="noopener noreferrer">borrador de privacidad</a>.</p>}
                  </>
                )}

                <button
                  className={`w-full py-3 rounded-xl font-bold transition ${
                    isSubmitting || (isRegister && !registrationAcceptance(acceptTerms,acceptPrivacy,confirmAdult))
                      ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                      : "bg-forest-green text-white hover:bg-opacity-90"
                  }`}
                  title={isRegister && !registrationAcceptance(acceptTerms,acceptPrivacy,confirmAdult) ? "Revisa las políticas y las autorizaciones requeridas" : undefined}
                  disabled={isSubmitting || (isRegister && !registrationAcceptance(acceptTerms,acceptPrivacy,confirmAdult))}
                  type="submit"
                >
                  {isSubmitting ? "Procesando..." : isRegister ? "Registrarme" : "Entrar"}
                </button>

                {/* ✅ NUEVO: Olvidé mi contraseña (solo en login) */}
                {!isRegister && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setForgotSent(false);
                    }}
                    className="w-full text-sm font-bold text-gray-600 hover:underline disabled:text-gray-400"
                    disabled={isSubmitting}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}

                {/* ✅ Reenviar correo (solo en login) */}
                {!isRegister && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={isSubmitting || resendCooldown > 0}
                    className="w-full text-sm font-bold text-forest-green hover:underline disabled:text-gray-400"
                  >
                    {resendCooldown > 0
                      ? `Reenviar activación (${resendCooldown}s)`
                      : "¿No te llegó el correo? Reenviar activación"}
                  </button>
                )}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
