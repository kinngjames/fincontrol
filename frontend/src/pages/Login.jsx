import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { TrendingUp, Loader2, Plus, ChevronRight, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const [profiles, setProfiles] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { selectProfile } = useAuth();
  const navigate = useNavigate();

  const load = () => api.get("/profiles").then((r) => setProfiles(r.data)).catch(() => setProfiles([]));
  useEffect(() => { load(); }, []);

  const pick = async (id) => {
    setBusy(true);
    try {
      await selectProfile(id);
      navigate("/dashboard");
    } catch (err) {
      toast.error(apiErr(err.response?.data?.detail));
      setBusy(false);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/profiles", { name: name.trim() });
      toast.success("Profile created");
      await selectProfile(data.id);
      navigate("/dashboard");
    } catch (err) {
      toast.error(apiErr(err.response?.data?.detail));
      setBusy(false);
    }
  };

  const initials = (n) => n.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const palette = ["bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-rose-500", "bg-indigo-500", "bg-teal-500"];

  return (
    <div className="grid min-h-screen bg-background grain-veil lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-zinc-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-zinc-900">
            <TrendingUp className="h-5 w-5" />
          </div>
          <span className="font-heading text-xl font-extrabold">FinControl</span>
        </div>
        <div>
          <h2 className="font-heading text-4xl font-extrabold leading-tight">
            Your capital,<br />in perfect control.
          </h2>
          <p className="mt-4 max-w-md text-zinc-400">
            A fleet of trading bots, funds, savings, income and expenses — all consolidated in EUR, in one calm
            dashboard.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              ["Bot Fleet", "USD returns"],
              ["Funds", "EUR contributions"],
              ["Savings", "capital growth"],
              ["Cash Flow", "income & spend"],
            ].map(([t, s]) => (
              <div key={t} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm font-semibold">{t}</div>
                <div className="text-xs text-zinc-400">{s}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-zinc-500">Estimates are informational only — not financial advice.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="font-heading text-xl font-extrabold text-zinc-900">FinControl</span>
          </div>

          <h1 className="font-heading text-2xl font-bold text-zinc-900">Choose your profile</h1>
          <p className="mt-1 text-sm text-zinc-500">Select a profile to continue. No password needed.</p>

          {profiles === null ? (
            <div className="mt-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
          ) : (
            <div className="mt-6 space-y-2" data-testid="profile-list">
              {profiles.map((p, i) => (
                <button
                  key={p.id}
                  data-testid={`profile-${p.id}`}
                  disabled={busy}
                  onClick={() => pick(p.id)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left transition-all hover:border-zinc-300 hover:shadow-sm active:scale-[0.99] disabled:opacity-60"
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white ${palette[i % palette.length]}`}>
                    {initials(p.name)}
                  </span>
                  <span className="flex-1 font-medium text-zinc-900">{p.name}</span>
                  <ChevronRight className="h-4 w-4 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-500" />
                </button>
              ))}

              {creating ? (
                <form onSubmit={create} className="rounded-xl border border-dashed border-zinc-300 p-3">
                  <Input autoFocus data-testid="new-profile-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Profile name" className="mb-2" />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={busy} data-testid="create-profile-button" className="h-9 flex-1 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & enter"}
                    </Button>
                    <Button type="button" variant="outline" className="h-9" onClick={() => { setCreating(false); setName(""); }}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <button
                  data-testid="add-profile-button"
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center gap-3 rounded-xl border border-dashed border-zinc-300 p-3 text-left text-zinc-500 transition-colors hover:bg-zinc-50"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100">
                    <Plus className="h-4 w-4" />
                  </span>
                  <span className="font-medium">New profile</span>
                </button>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center gap-2 text-xs text-zinc-400">
            <UserRound className="h-3.5 w-3.5" /> Profiles let you keep separate data for testing.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
