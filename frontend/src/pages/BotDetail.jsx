import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Pencil, Trash2, Loader2, TrendingUp, CalendarDays, Sigma, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { StatCard } from "@/components/StatCard";
import { Disclaimer } from "@/components/Disclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { fmtUSD, fmtEUR, todayStr, shortDate } from "@/lib/format";

const PROJECT_MONTHS = [3, 6, 12];

export default function BotDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const rate = user?.usd_to_eur || 0.92;
  const [bot, setBot] = useState(null);
  const [form, setForm] = useState({ date: todayStr(), amount_usd: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState(null);
  const [months, setMonths] = useState(6);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/bots/${id}`);
      setBot(data);
    } catch {
      toast.error("Bot not found");
      navigate("/bots");
    }
  }, [id, navigate]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.amount_usd === "") return;
    setSaving(true);
    try {
      await api.post(`/bots/${id}/returns`, { ...form, amount_usd: parseFloat(form.amount_usd) });
      setForm({ date: todayStr(), amount_usd: "", note: "" });
      toast.success("Return logged");
      load();
    } catch (err) { toast.error(apiErr(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/bots/${id}/returns/${edit.id}`, { date: edit.date, amount_usd: parseFloat(edit.amount_usd), note: edit.note || "" });
      setEdit(null); toast.success("Entry updated"); load();
    } catch (err) { toast.error(apiErr(err.response?.data?.detail)); }
  };

  const remove = async (rid) => {
    await api.delete(`/bots/${id}/returns/${rid}`);
    toast.success("Entry deleted"); load();
  };

  if (!bot)
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>;

  const st = bot.stats;
  const rows = [...bot.returns].reverse();
  const projection = Math.round(st.daily_avg_usd * 30 * months * 100) / 100;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={bot.name}
        subtitle={`Individual analysis · USD · ${fmtEUR(st.cumulative_usd * rate)} in EUR`}
        back={
          <Link to="/bots" data-testid="back-to-fleet" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Fleet
          </Link>
        }
        action={<Badge variant="secondary" className={bot.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-500"}>{bot.status === "active" ? "Active" : "Paused"}</Badge>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard testid="bot-cumulative" label="Cumulative Profit" value={fmtUSD(st.cumulative_usd)} accent={st.cumulative_usd >= 0 ? "gain" : "spend"} icon={TrendingUp} />
        <StatCard testid="bot-daily-avg" label="Daily Average" value={fmtUSD(st.daily_avg_usd)} sub={`${st.count} entries`} accent="usd" icon={CalendarDays} />
        <StatCard testid="bot-monthly-return" label="This Month" value={fmtUSD(st.this_month_usd)} accent={st.this_month_usd >= 0 ? "gain" : "spend"} icon={Sigma} />
        <StatCard testid="bot-monthly-avg" label="Avg / Month" value={fmtUSD(st.monthly_avg_usd)} sub="≈ daily avg × 30" accent="usd" icon={CalendarDays} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.form initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} data-testid="bot-return-form" className="card-soft h-fit space-y-4 p-5">
          <h3 className="font-heading text-lg font-semibold text-zinc-900">Log Daily Return</h3>
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" data-testid="bot-date-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
          <div className="space-y-1.5">
            <Label>Profit / Loss (USD)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
              <Input type="number" step="0.01" data-testid="bot-amount-input" className="pl-7" placeholder="0.00" value={form.amount_usd} onChange={(e) => setForm({ ...form, amount_usd: e.target.value })} required />
            </div>
          </div>
          <div className="space-y-1.5"><Label>Note (optional)</Label><Input data-testid="bot-note-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. strategy tweak" /></div>
          <Button type="submit" disabled={saving} data-testid="bot-submit-button" className="h-11 w-full rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Add Return
          </Button>

          <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
            <h4 className="text-sm font-semibold text-zinc-900">Projection</h4>
            <div className="mt-2 flex gap-1.5">
              {PROJECT_MONTHS.map((m) => (
                <button key={m} type="button" data-testid={`projection-${m}m`} onClick={() => setMonths(m)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${months === m ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"}`}>{m}m</button>
              ))}
            </div>
            <div data-testid="projection-value" className="mt-3 font-mono text-xl font-semibold tabular-nums text-blue-600">{fmtUSD(projection)}</div>
            <p className="mt-1 text-[11px] text-zinc-400">Estimate from average daily return. Not financial advice.</p>
          </div>
        </motion.form>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} data-testid="bot-performance-chart" className="card-soft p-5 lg:col-span-2">
          <h3 className="mb-4 font-heading text-lg font-semibold text-zinc-900">Historical Performance</h3>
          {bot.series.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-400">Add returns to see the cumulative curve.</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={bot.series} margin={{ left: -14, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }} formatter={(v) => [fmtUSD(v), "Cumulative"]} labelFormatter={(l) => shortDate(l)} />
                <Line type="monotone" dataKey="cumulative_usd" stroke="#3B82F6" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
          {st.monthly.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Monthly Returns</h4>
              <div className="flex flex-wrap gap-2">
                {st.monthly.map((m) => (
                  <div key={m.month} className="rounded-lg border border-zinc-200 px-3 py-2">
                    <div className="text-[11px] text-zinc-400">{m.month}</div>
                    <div className={`font-mono text-sm font-semibold tabular-nums ${m.amount_usd >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{fmtUSD(m.amount_usd)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <div className="mt-6 card-soft p-5" data-testid="bot-entries-table">
        <h3 className="mb-4 font-heading text-lg font-semibold text-zinc-900">Daily Entries</h3>
        <div className="fc-scroll max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-400">
                <th className="pb-2 font-semibold">Date</th><th className="pb-2 font-semibold">Amount</th><th className="pb-2 font-semibold">Note</th><th className="pb-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-zinc-400">No entries yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
                  <td className="py-2.5 text-zinc-600">{r.date}</td>
                  <td className={`py-2.5 font-mono tabular-nums ${r.amount_usd >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{fmtUSD(r.amount_usd)}</td>
                  <td className="py-2.5 text-zinc-500">{r.note || "—"}</td>
                  <td className="py-2.5 text-right">
                    <button data-testid={`bot-edit-${r.id}`} onClick={() => setEdit({ ...r, amount_usd: String(r.amount_usd) })} className="mr-1 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><Pencil className="h-4 w-4" /></button>
                    <button data-testid={`bot-delete-${r.id}`} onClick={() => remove(r.id)} className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6"><Disclaimer /></div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent data-testid="bot-edit-dialog">
          <DialogHeader><DialogTitle>Edit Daily Return</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Amount (USD)</Label><Input type="number" step="0.01" data-testid="bot-edit-amount" value={edit.amount_usd} onChange={(e) => setEdit({ ...edit, amount_usd: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Note</Label><Input value={edit.note || ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button data-testid="bot-save-edit" onClick={saveEdit} className="bg-zinc-900 text-white hover:bg-zinc-800">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
