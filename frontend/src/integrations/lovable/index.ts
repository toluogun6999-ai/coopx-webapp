// ============================================================================
// Lovable OAuth — DISABLED.
// This project now uses Django email/password authentication instead of
// Lovable Google OAuth. This stub remains only so any lingering import does
// not crash the build. It is not used anywhere in the app.
// ============================================================================
export const lovable = {
  auth: {
    signInWithOAuth: async () => ({
      error: new Error("OAuth is disabled — this app uses email/password login."),
    }),
  },
};
