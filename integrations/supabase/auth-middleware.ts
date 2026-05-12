// This helper is kept for parity with the reference app, but adapted for Next.js.
import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

export async function requireSupabaseAuth(request: Request) {
    const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY =
        process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        const missing = [
            ...(!SUPABASE_URL ? ["PUBLIC_SUPABASE_URL or SUPABASE_URL"] : []),
            ...(!SUPABASE_PUBLISHABLE_KEY ? ["PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY"] : []),
        ];
        const message = `Missing Supabase environment variable(s): ${missing.join(", ")}.`;
        console.error(`[Supabase] ${message}`);
        throw new Response(message, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
        throw new Response("Unauthorized: No authorization header provided", { status: 401 });
    }

    if (!authHeader.startsWith("Bearer ")) {
        throw new Response("Unauthorized: Only Bearer tokens are supported", { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
        throw new Response("Unauthorized: No token provided", { status: 401 });
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        },
        auth: {
            storage: undefined,
            persistSession: false,
            autoRefreshToken: false,
        },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) {
        throw new Response("Unauthorized: Invalid token", { status: 401 });
    }

    return {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
    };
}
