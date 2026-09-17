import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const disabledError = {
  message: "Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.",
};

function disabledResponse(data = null) {
  return Promise.resolve({ data, error: disabledError });
}

function createDisabledQuery() {
  const query = {
    select: () => query,
    insert: () => query,
    update: () => query,
    upsert: () => query,
    delete: () => query,
    eq: () => query,
    neq: () => query,
    gt: () => query,
    gte: () => query,
    lt: () => query,
    lte: () => query,
    in: () => query,
    or: () => query,
    order: () => query,
    limit: () => query,
    single: () => disabledResponse(null),
    maybeSingle: () => disabledResponse(null),
    then: (resolve, reject) => disabledResponse([]).then(resolve, reject),
    catch: (reject) => disabledResponse([]).catch(reject),
    finally: (callback) => disabledResponse([]).finally(callback),
  };
  return query;
}

function createDisabledSupabase() {
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signUp: () => disabledResponse(null),
      signInWithPassword: () => disabledResponse(null),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: () => createDisabledQuery(),
    storage: {
      from: () => ({
        upload: () => disabledResponse(null),
        remove: () => disabledResponse(null),
        createSignedUrl: () => disabledResponse(null),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    channel: () => ({
      on: function () {
        return this;
      },
      subscribe: function () {
        return this;
      },
    }),
    removeChannel: () => {},
  };
}

if (!supabaseUrl || !supabaseKey) {
  console.warn("Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env");
}

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : createDisabledSupabase();
