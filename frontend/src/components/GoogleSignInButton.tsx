// Renders Google's "Sign in with Google" button using Google Identity
// Services (loaded directly from Google, no extra npm dependency needed).
// On success, sends the ID token to the Django backend for server-side
// verification (never trust the token's contents on the client).
import { useEffect, useRef } from "react";
import { api } from "@/integrations/django/client";
import { supabase } from "@/integrations/supabase/client";

const CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || "";

declare global {
  interface Window {
    google?: any;
  }
}

let scriptLoadPromise: Promise<void> | null = null;
function loadGoogleScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In"));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

interface Props {
  onSuccess: (result: { token: string; user: any; role: string }) => void;
  onError?: (message: string) => void;
}

export function GoogleSignInButton({ onSuccess, onError }: Props) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    loadGoogleScript().then(() => {
      if (cancelled || !window.google || !buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (response: { credential: string }) => {
          const { data, error } = await api.request<any>("/auth/google/", {
            method: "POST",
            body: JSON.stringify({ credential: response.credential }),
          });
          if (error || !data) {
            onError?.(error?.message || "Google sign-in failed");
            return;
          }
          await supabase.auth.setSession({ access_token: data.token });
          onSuccess({ token: data.token, user: data.user, role: data.role });
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
      });
    }).catch((e) => onError?.(e.message));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!CLIENT_ID) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex w-full items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span>or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div ref={buttonRef} />
    </div>
  );
}
