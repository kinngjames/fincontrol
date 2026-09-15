import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { TrendingUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const { authenticate } = useAuth();
  const navigate = useNavigate();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email: form.email, password: form.password } : form;
      const { data } = await api.post(path, body);
      authenticate(data.token, data.user);
      toast.success(mode === "login" ? "Welcome back" : "Account created");
      navigate("/dashboard");
    } catch (err) {
      toast.error(apiErr(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => setForm({ name: "", email: "demo@fincontrol.app", password: "demo1234" });

  return (
    <div className="grid min-h-screen bg-background grain-veil lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden flex-col justify-between bg-zinc-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-zinc-900">
            <TrendingUp className="h-5 w-5" />
          </div>
          <span className="font-heading text-xl font-extrabold">FinControl</span>
        </div>
        <div>
          <h2 className="font-heading text-4xl font-extrabold leading-tight">
            Your investments,<br />in perfect control.
          </h2>
          <p className="mt-4 max-w-md text-zinc-400">
            Track your trading bot in USD, manage funds and expenses in EUR, and see everything consolidated in one
            clean dashboard.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              ["Trading Bot", "USD daily returns"],
              ["Funds", "EUR contributions"],
              ["Expenses", "5 categories"],
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

      {/* Right form */}
      <div className="flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="font-heading text-xl font-extrabold text-zinc-900">FinControl</span>
          </div>

          <h1 className="font-heading text-2xl font-bold text-zinc-900">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {mode === "login" ? "Welcome back. Enter your details." : "Start tracking in under a minute."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" data-testid="name-input" value={form.name} onChange={set("name")} placeholder="Alex Doe" required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" data-testid="email-input" value={form.email} onChange={set("email")} placeholder="you@example.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" data-testid="password-input" value={form.password} onChange={set("password")} placeholder="••••••••" required />
            </div>

            <Button
              type="submit"
              data-testid="submit-auth-button"
              disabled={loading}
              className="h-11 w-full rounded-lg bg-zinc-900 text-white transition-all hover:bg-zinc-800 active:scale-[0.98]"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            data-testid="demo-credentials-button"
            onClick={fillDemo}
            className="mt-3 w-full rounded-lg border border-dashed border-zinc-300 py-2.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-50"
          >
            Use demo account (demo@fincontrol.app / demo1234)
          </button>

          <p className="mt-6 text-center text-sm text-zinc-500">
            {mode === "login" ? "No account yet?" : "Already have an account?"}{" "}
            <button
              data-testid="toggle-auth-mode"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="font-semibold text-zinc-900 underline-offset-4 hover:underline"
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
