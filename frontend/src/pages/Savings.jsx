import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Trash2, Loader2, PiggyBank, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import api, { apiErr } from "@/lib/api";
import { fmtEUR, todayStr, shortDate } from "@/lib/format";

export default function Savings() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ type: "deposit", amount_eur: "", date: todayStr(), note: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get("/savings");
    setData(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.amount_eur === "") return;
    setSaving(true);
    try {
      const { data } = await api.post("/savings", { ...form, amount_eur: parseFloat(form.amount_eur) });
      setData(data);
      setForm({ type: form.type, amount_eur: "", date: todayStr(), note: "" });
      toast.success(form.type === "deposit" ? "Deposit added" : "Withdrawal added");
    } catch (err) { toast.error(apiErr(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    const { data } = await api.delete(`/savings/${id}`);
    setData(data);
    toast.success("Transaction removed");
  };

  if (!data)
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Savings" subtitle="Track your capital and watch it grow (EUR)" />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard testid="savings-balance" label="Current Balance" value={fmtEUR(data.balance_eur)} accent="ink" icon={PiggyBank} />
        <StatCard testid="savings-deposits" label="Total Deposits" value={fmtEUR(data.total_deposits_eur)} accent="gain" icon={ArrowDownToLine} />
        <StatCard testid="savings-withdrawals" label="Total Withdrawals" value={fmtEUR(data.total_withdrawals_eur)} accent="spend" icon={ArrowUpFromLine} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.form initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} data-testid="savings-form" className="card-soft h-fit space-y-4 p-5">
          <h3 className="font-heading text-lg font-semibold text-zinc-900">New Movement</h3>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" data-testid="type-deposit" onClick={() => setForm({ ...form, type: "deposit" })}
              className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${form.type === "deposit" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}>
              Deposit
            </button>
            <button type="button" data-testid="type-withdrawal" onClick={() => setForm({ ...form, type: "withdrawal" })}
              className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${form.type === "withdrawal" ? "border-rose-500 bg-rose-50 text-rose-600" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}>
              Withdrawal
            </button>
          </div>
          <div className="space-y-1.5">
            <Label>Amount (EUR)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">€</span>
              <Input type="number" step="0.01" data-testid="savings-amount-input" className="pl-7" placeholder="0.00" value={form.amount_eur} onChange={(e) => setForm({ ...form, amount_eur: e.target.value })} required />
            </div>
          </div>
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" data-testid="savings-date-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
          <div className="space-y-1.5"><Label>Note (optional)</Label><Input data-testid="savings-note-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Monthly saving" /></div>
          <Button type="submit" disabled={saving} data-testid="savings-submit-button" className="h-11 w-full rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Add Movement
          </Button>
        </motion.form>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} data-testid="savings-chart" className="card-soft p-5 lg:col-span-2">
          <h3 className="mb-4 font-heading text-lg font-semibold text-zinc-900">Capital Evolution</h3>
          {data.history.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-400">Add a deposit to start tracking your capital.</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.history} margin={{ left: -14, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="sav" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} width={58} tickFormatter={(v) => `€${v}`} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }} formatter={(v) => [fmtEUR(v), "Balance"]} labelFormatter={(l) => shortDate(l)} />
                <Area type="monotone" dataKey="balance" stroke="#6366F1" strokeWidth={2} fill="url(#sav)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>

      <div className="mt-6 card-soft p-5" data-testid="savings-table">
        <h3 className="mb-4 font-heading text-lg font-semibold text-zinc-900">Movements</h3>
        <div className="fc-scroll max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-400">
                <th className="pb-2 font-semibold">Date</th><th className="pb-2 font-semibold">Type</th><th className="pb-2 font-semibold">Note</th><th className="pb-2 font-semibold">Amount</th><th className="pb-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-zinc-400">No movements yet.</td></tr>}
              {data.transactions.map((t) => (
                <tr key={t.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
                  <td className="py-2.5 text-zinc-600">{t.date}</td>
                  <td className="py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${t.type === "deposit" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
                      {t.type === "deposit" ? "Deposit" : "Withdrawal"}
                    </span>
                  </td>
                  <td className="py-2.5 text-zinc-500">{t.note || "—"}</td>
                  <td className={`py-2.5 font-mono tabular-nums ${t.type === "deposit" ? "text-emerald-600" : "text-rose-500"}`}>{t.type === "deposit" ? "+" : "−"}{fmtEUR(t.amount_eur)}</td>
                  <td className="py-2.5 text-right">
                    <button data-testid={`savings-delete-${t.id}`} onClick={() => remove(t.id)} className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
