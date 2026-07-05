// ============================================================================
// Supabase client — REPLACED with Django REST backend.
// This file now simply re-exports the Django-backed shim so every existing
// `import { supabase } from "@/integrations/supabase/client"` keeps working
// without touching the 20+ route components.
// ============================================================================
export { supabase, djangoClient as default, api, getToken, setToken } from "@/integrations/django/client";
