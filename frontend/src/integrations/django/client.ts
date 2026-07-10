// ============================================================================
// Django API Client — Supabase-compatible shim
// ============================================================================
// This replaces the Supabase client. It exposes the same surface the CoopX
// code already uses ( .from(table).select().eq()... and .auth.* ) but every
// call is routed to the Django REST API instead of Supabase.
//
// Only the data-access layer (db.ts) and auth (auth.tsx) call these, so the
// 23 route components keep working unchanged.
// ============================================================================

const API_BASE =
  (import.meta as any).env?.VITE_API_URL ||
  (typeof process !== "undefined" ? (process as any).env?.API_URL : "") ||
  "http://localhost:8000/api";

const TOKEN_KEY = "coopx_token";

// ─── Token storage ──────────────────────────────────────────────────────────
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// ─── Low-level request helper ───────────────────────────────────────────────
async function request<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<{ data: T | null; error: { message: string } | null }> {
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };
    if (token) headers["Authorization"] = `Token ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 204) return { data: null, error: null };

    const text = await res.text();
    const json = text ? JSON.parse(text) : null;

    if (!res.ok) {
      return {
        data: null,
        error: { message: json?.error || json?.detail || `HTTP ${res.status}` },
      };
    }
    return { data: json as T, error: null };
  } catch (e: any) {
    return { data: null, error: { message: e?.message || "Network error" } };
  }
}

export const api = { request, getToken, setToken, API_BASE };

// ============================================================================
// Table → endpoint mapping
// ============================================================================
const TABLE_ENDPOINTS: Record<string, string> = {
  profiles: "/profiles/",
  loans: "/loans/",
  savings_transactions: "/savings/",
  loan_repayments: "/loans/repayments/",
  notifications: "/notifications/",
  announcements: "/announcements/",
  audit_logs: "/audit/",
  user_roles: "/auth/me/",
  system_settings: "/settings/",
};

// ============================================================================
// Query builder — mimics supabase.from(table).select().eq()...
// ============================================================================
class QueryBuilder {
  private table: string;
  private filters: { col: string; val: any }[] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private _single = false;
  private _maybeSingle = false;

  constructor(table: string) {
    this.table = table;
  }

  select(_cols?: string) { return this; }
  eq(col: string, val: any) { this.filters.push({ col, val }); return this; }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  singleRow() { this._single = true; return this; }
  maybeSingleRow() { this._maybeSingle = true; return this; }
  single() { this._single = true; return this._run(); }
  maybeSingle() { this._maybeSingle = true; return this._run(); }

  private async _run() {
    const endpoint = TABLE_ENDPOINTS[this.table] || `/${this.table}/`;
    const { data, error } = await request<any>(endpoint);
    if (error) return { data: null, error };

    let rows: any[] = Array.isArray(data) ? data : (data ? [data] : []);

    // Apply client-side filters (server already scopes by user)
    for (const f of this.filters) {
      rows = rows.filter((r) => String(r[f.col]) === String(f.val));
    }
    // Apply ordering
    if (this.orderCol) {
      const col = this.orderCol;
      rows.sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);

    if (this._single || this._maybeSingle) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  // ----- writes -----
  async insert(payload: any) {
    const endpoint = writeEndpoint(this.table, "insert");
    const body = Array.isArray(payload) ? payload[0] : payload;
    const { data, error } = await request<any>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      data,
      error,
      select: () => ({ single: async () => ({ data, error }) }),
    };
  }

  async update(payload: any) {
    // The filters tell us which record to update (typically .eq("id", ...))
    const idFilter = this.filters.find((f) => f.col === "id");
    const id = idFilter?.val;
    const endpoint = writeEndpoint(this.table, "update", id, payload);
    const { data, error } = await request<any>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return { data, error };
  }

  // Make the builder awaitable so `await supabase.from(x).select()` works
  then(resolve: any, reject?: any) {
    return this._run().then(resolve, reject);
  }
}

// Decide which write endpoint to hit for a given table
function writeEndpoint(table: string, op: "insert" | "update", id?: string, payload?: any): string {
  if (table === "loans") {
    if (op === "insert") return "/loans/apply/";
    if (op === "update") return `/loans/${id}/decide/`;
  }
  if (table === "savings_transactions") return "/savings/add/";
  if (table === "loan_repayments") return `/loans/${payload?.loan_id}/repayments/`;
  if (table === "notifications") return "/notifications/read/";
  if (table === "announcements") return "/announcements/";
  if (table === "profiles" && op === "update") return `/profiles/${id}/status/`;
  if (table === "system_settings") return "/settings/";
  return TABLE_ENDPOINTS[table] || `/${table}/`;
}

// ============================================================================
// Auth — mimics supabase.auth.*
// ============================================================================
type AuthChangeCb = (event: string, session: any) => void;
const authListeners: AuthChangeCb[] = [];

function notifyAuth(event: string, session: any) {
  authListeners.forEach((cb) => cb(event, session));
}

const auth = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const { data, error } = await request<any>("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (error || !data) return { data: { session: null, user: null }, error };
    setToken(data.token);
    const session = { access_token: data.token, user: data.user };
    notifyAuth("SIGNED_IN", session);
    return { data: { session, user: data.user }, error: null };
  },

  async signUp({ email, password, options }: { email: string; password: string; options?: any }) {
    const meta = options?.data || {};
    const { data, error } = await request<any>("/auth/signup/", {
      method: "POST",
      body: JSON.stringify({ email, password, ...meta }),
    });
    if (error || !data) return { data: { session: null, user: null }, error };
    setToken(data.token);
    const session = { access_token: data.token, user: data.user };
    notifyAuth("SIGNED_IN", session);
    return { data: { session, user: data.user }, error: null };
  },

  async signOut() {
    await request("/auth/logout/", { method: "POST" });
    setToken(null);
    notifyAuth("SIGNED_OUT", null);
    return { error: null };
  },

  async getSession() {
    const token = getToken();
    if (!token) return { data: { session: null }, error: null };
    const { data, error } = await request<any>("/auth/me/");
    if (error || !data?.user) return { data: { session: null }, error: null };
    return {
      data: { session: { access_token: token, user: data.user } },
      error: null,
    };
  },

  async getUser() {
    const { data, error } = await request<any>("/auth/me/");
    if (error || !data?.user) return { data: { user: null }, error };
    return { data: { user: data.user }, error: null };
  },

  async getClaims() {
    const { data } = await request<any>("/auth/me/");
    return { data: { claims: data?.user ? { sub: data.user.id, role: data.role } : null }, error: null };
  },

  async setSession(tokens: any) {
    const token = tokens?.access_token || tokens?.token;
    if (token) {
      setToken(token);
      notifyAuth("SIGNED_IN", { access_token: token });
    }
    return { data: { session: tokens }, error: null };
  },

  async updateUser(attrs: { password?: string; currentPassword?: string; email?: string }) {
    if (attrs.password) {
      const { data, error } = await request<any>("/auth/update-password/", {
        method: "POST",
        body: JSON.stringify({ password: attrs.password, current_password: attrs.currentPassword }),
      });
      if (data?.token) setToken(data.token);
      return { data: { user: null }, error };
    }
    return { data: { user: null }, error: null };
  },

  async resetPasswordForEmail(email: string) {
    const { error } = await request("/auth/password-reset/", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return { data: {}, error };
  },

  onAuthStateChange(cb: AuthChangeCb) {
    authListeners.push(cb);
    // Fire initial state asynchronously
    this.getSession().then(({ data }) => cb(data.session ? "SIGNED_IN" : "INITIAL", data.session));
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            const idx = authListeners.indexOf(cb);
            if (idx >= 0) authListeners.splice(idx, 1);
          },
        },
      },
    };
  },
};

// ============================================================================
// The exported "supabase-compatible" client
// ============================================================================
export const djangoClient = {
  from: (table: string) => new QueryBuilder(table),
  auth,
  rpc: async (_fn: string, _params?: any) => ({ data: null, error: { message: "RPC not supported" } }),
};

// Named export used across the app in place of the real supabase client
export const supabase = djangoClient;
export default djangoClient;
