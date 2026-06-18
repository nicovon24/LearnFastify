/**
 * Cliente de Supabase compartido para toda la aplicación.
 *
 * Por qué inicialización lazy (función en vez de instancia directa):
 *   Si instanciamos createClient() al cargar el módulo, Next.js intentará
 *   ejecutar esa línea durante el build — momento en que las env vars no están
 *   disponibles (solo existen en runtime). Esto rompería el build con
 *   "supabaseUrl is required".
 *
 *   Con una función getSupabase(), el cliente se crea la PRIMERA VEZ que se
 *   llama (lazy init), que siempre es en runtime (dentro de una API route o
 *   un Server Component), cuando las env vars ya están disponibles.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Faltan variables de entorno: SUPABASE_URL y SUPABASE_KEY son requeridas. " +
        "Copiá .env.example a .env.local y completá los valores."
      );
    }

    _client = createClient(supabaseUrl, supabaseKey);
  }
  return _client;
}

// Alias para compatibilidad — la mayoría del código usa getSupabase()
// pero se puede usar como `const supabase = getSupabase()` al inicio de una función
export const supabase = {
  from: (...args: Parameters<SupabaseClient["from"]>) => getSupabase().from(...args),
  rpc: (...args: Parameters<SupabaseClient["rpc"]>) => getSupabase().rpc(...args),
};
