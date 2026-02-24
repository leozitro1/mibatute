// supabase/functions/delete-account/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // para pruebas. Luego lo puedes limitar a tu dominio.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // ✅ 1) CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ✅ 2) Secrets
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ✅ 3) Cliente “user” para leer el JWT del request
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: req.headers.get("Authorization") || "" },
      },
    });

    // ✅ 4) Cliente “admin” (service_role) para borrar en Auth + saltarse RLS
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // ✅ 5) Usuario autenticado
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();

    if (userErr || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "No autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ✅ 6) Body: emailConfirm
    const body = await req.json().catch(() => ({}));
    const emailConfirm = String(body?.emailConfirm || "").trim().toLowerCase();

    const realEmail = String(user.email || "").trim().toLowerCase();
    if (!realEmail) {
      return new Response(
        JSON.stringify({ ok: false, error: "Usuario sin email (Auth)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!emailConfirm || emailConfirm !== realEmail) {
      return new Response(
        JSON.stringify({ ok: false, error: "Email de confirmación no coincide" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const uid = user.id;

    // ✅ 7) 1ero borrar datos (DB RPC)
    const { error: rpcErr } = await supabaseAdmin.rpc("delete_my_account_hard", {
      p_uid: uid,
    });

    if (rpcErr) {
      console.error("RPC error:", rpcErr);
      return new Response(
        JSON.stringify({ ok: false, error: rpcErr.message || "RPC error" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ✅ 8) 2do borrar usuario de Auth
    const { error: delAuthErr } = await supabaseAdmin.auth.admin.deleteUser(uid);

    if (delAuthErr) {
      console.error("Auth delete error:", delAuthErr);
      return new Response(
        JSON.stringify({ ok: false, error: delAuthErr.message || "Auth delete error" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ✅ OK
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Server error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});