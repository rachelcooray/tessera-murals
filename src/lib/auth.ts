"use client";
/**
 * Admin sign-in through Supabase Auth (email and password).
 * Off until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set; see docs/admin-signin.md.
 * The email list here only decides what the page shows. The payments server checks its own
 * ADMIN_EMAILS list, and Phase 2's database rules will too.
 */
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export const authConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!authConfigured) return null;
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email) && (ADMIN_EMAILS.length === 0 || ADMIN_EMAILS.includes(email!.toLowerCase()));
}

export function useSession(): { session: Session | null; ready: boolean; recovery: boolean; endRecovery: () => void } {
  const [session, setSession] = useState<Session | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [ready, setReady] = useState(!authConfigured);
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = sb.auth.onAuthStateChange((event, s) => { setSession(s); if (event === "PASSWORD_RECOVERY") setRecovery(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready, recovery, endRecovery: () => setRecovery(false) };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase()!.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === "Invalid login credentials" ? "That email and password don’t match." : error.message);
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase()!.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
  if (error) throw new Error(error.message);
}

export async function updatePassword(password: string) {
  const { error } = await supabase()!.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  await supabase()?.auth.signOut();
}

export async function accessToken(): Promise<string> {
  const sb = supabase();
  if (!sb) return "";
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? "";
}
