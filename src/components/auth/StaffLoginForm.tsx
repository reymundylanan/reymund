"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function StaffLoginForm({
  onSuccess,
}: {
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data: email, error: lookupError } = await supabase.rpc(
      "get_email_for_username",
      { p_username: username }
    );

    if (lookupError || !email) {
      setError("Invalid username or password.");
      setLoading(false);
      return;
    }

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      setError("Invalid username or password.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      setError("No staff account found for this login.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    onSuccess?.();

    if (profile.role === "admin") {
      router.push("/admin");
    } else if (profile.role === "front_desk") {
      router.push("/frontdesk");
    } else {
      router.push("/");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-ink">Username</label>
        <input
          type="text"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-ink/15 px-4 py-2.5 text-sm outline-none focus:border-coral"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-ink">Password</label>
        <div className="relative mt-1.5">
          <input
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-ink/15 px-4 py-2.5 pr-10 text-sm outline-none focus:border-coral"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-coral py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-coral-dark disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Login"}
      </button>
    </form>
  );
}
