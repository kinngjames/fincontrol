import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Bot as BotIcon, TrendingUp, Activity, CalendarDays, Pencil, Trash2, ChevronRight, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { StatCard } from "@/components/StatCard";
import { Disclaimer } from "@/components/Disclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { fmtUSD, fmtEUR, shortDate } from "@/lib/format";

export default function Bots() {
  const { user } = useAuth();
  const rate = user?.usd_to_eur || 0.92;
  const [ov, setOv] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/bots/overview");
    setOv(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const createBot = async () => {
    if (!name.trim()) return;
    try {
      await api.post("/bots", { name });
      setName(""); setCreateOpen(false);
      toast.success("Bot added to fleet");
      load();
    } catch (err) { toast.error(apiErr(err.response?.data?.detail)); }
  };

  const toggleStatus = async (b) => {
    const status = b.status === "active" ? "paused" : "active";
    await api.put(`/bots/${b.id}`, { status });
    toast.success(status === "active" ? "Bot activated" : "Bot paused");
    load();
  };

  const saveEdit = async () => {
    await api.put(`/bots/${edit.id}`, { name: edit.name });
    setEdit(null);
    toast.success("Bot renamed");
    load();
  };

  const remove = async (id) => {
    await api.delete(`/bots/${id}`);
    toast.success("Bot deleted");
    load();
  };

  if (!ov)
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Bot Fleet"
        subtitle="Consolidated view of all your trading bots (USD)"
        action={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-bot-button" className="rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]">
                <Plus className="mr-2 h-4 w-4" /> New Bot
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="create-bot-dialog">
              <DialogHeader><DialogTitle>Add Bot to Fleet</DialogTitle></DialogHeader>
              <div className="space-y-1.5">
                <Label>Bot name</Label>
                <Input data-testid="bot-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grid EUR/USD" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button data-testid="save-bot-button" onClick={createBot} className="bg-zinc-900 text-white hover:bg-zinc-800">Add Bot</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard testid="fleet-profit-usd" label="Fleet Profit" value={fmtUSD(ov.total_cumulative_usd)} sub={`${fmtEUR(ov.total_cumulative_eur)} in EUR`} accent={ov.total_cumulative_usd >= 0 ? "gain" : "spend"} icon={TrendingUp} />
        <StatCard testid="fleet-daily-avg" label="Avg Daily (fleet)" value={fmtUSD(ov.total_daily_avg_usd)} accent="usd" icon={CalendarDays} />
        <StatCard testid="fleet-this-month" label="This Month" value={fmtUSD(ov.this_month_usd)} accent={ov.this_month_usd >= 0 ? "gain" : "spend"} icon={Activity} />
        <StatCard testid="fleet-count" label="Active Bots" value={`${ov.active_count} / ${ov.bot_count}`} sub={`${ov.paused_count} paused`} accent="ink" icon={BotIcon} />
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} data-testid="fleet-chart" className="card-soft mb-6 p-5">
        <h3 className="mb-4 font-heading text-lg font-semibold text-zinc-900">Combined Performance</h3>
        {ov.series.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-400">
            Add returns to your bots to see the fleet curve.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={ov.series} margin={{ left: -14, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} minTickGap={30} />
              <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => `$${v}`} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }} formatter={(v) => [fmtUSD(v), "Cumulative"]} labelFormatter={(l) => shortDate(l)} />
              <Line type="monotone" dataKey="cumulative_usd" stroke="#3B82F6" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ov.bots.length === 0 && (
          <div className="card-soft col-span-full flex flex-col items-center justify-center py-16 text-center">
            <BotIcon className="h-8 w-8 text-zinc-300" />
            <p className="mt-3 text-sm text-zinc-500">No bots yet. Add your first bot to the fleet.</p>
          </div>
        )}
        {ov.bots.map((b, i) => (
          <motion.div key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} data-testid={`bot-card-${b.id}`} className="card-soft p-5">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${b.status === "active" ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  <h3 className="truncate font-heading text-lg font-semibold text-zinc-900">{b.name}</h3>
                </div>
                <div className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${b.cumulative_usd >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                  {fmtUSD(b.cumulative_usd)}
                </div>
              </div>
              <div className="flex gap-1">
                <button data-testid={`bot-rename-${b.id}`} onClick={() => setEdit({ id: b.id, name: b.name })} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><Pencil className="h-4 w-4" /></button>
                <button data-testid={`bot-delete-${b.id}`} onClick={() => remove(b.id)} className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg bg-zinc-50 p-2"><div className="text-[11px] text-zinc-400">Daily avg</div><div className="font-mono tabular-nums text-zinc-900">{fmtUSD(b.daily_avg_usd)}</div></div>
              <div className="rounded-lg bg-zinc-50 p-2"><div className="text-[11px] text-zinc-400">Month</div><div className={`font-mono tabular-nums ${b.this_month_usd >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{fmtUSD(b.this_month_usd)}</div></div>
              <div className="rounded-lg bg-zinc-50 p-2"><div className="text-[11px] text-zinc-400">Entries</div><div className="font-mono tabular-nums text-zinc-900">{b.count}</div></div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                <Switch data-testid={`bot-status-${b.id}`} checked={b.status === "active"} onCheckedChange={() => toggleStatus(b)} />
                {b.status === "active" ? "Active" : "Paused"}
              </label>
              <Link to={`/bots/${b.id}`} data-testid={`bot-open-${b.id}`} className="flex items-center gap-1 text-sm font-medium text-zinc-900 hover:underline">
                Analyze <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-6"><Disclaimer /></div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent data-testid="rename-bot-dialog">
          <DialogHeader><DialogTitle>Rename Bot</DialogTitle></DialogHeader>
          {edit && <Input data-testid="rename-bot-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button data-testid="save-rename-bot" onClick={saveEdit} className="bg-zinc-900 text-white hover:bg-zinc-800">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
