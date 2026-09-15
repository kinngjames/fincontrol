import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Pencil, Trash2, Loader2, Landmark, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import api, { apiErr } from "@/lib/api";
import { fmtEUR, fmtPct, todayStr, shortDate } from "@/lib/format";

export default function Funds() {
  const [funds, setFunds] = useState(null);
  const [newFund, setNewFund] = useState({ name: "", current_value_eur: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [edit, setEdit] = useState(null);
  const [contribFor, setContribFor] = useState(null);
  const [contrib, setContrib] = useState({ amount_eur: "", date: todayStr(), note: "" });

  const load = useCallback(async () => {
    const { data } = await api.get("/funds");
    setFunds(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createFund = async () => {
    if (!newFund.name.trim()) return;
    try {
      await api.post("/funds", { name: newFund.name, current_value_eur: parseFloat(newFund.current_value_eur || 0) });
      setNewFund({ name: "", current_value_eur: "" });
      setCreateOpen(false);
      toast.success("Fund created");
      load();
    } catch (err) { toast.error(apiErr(err.response?.data?.detail)); }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/funds/${edit.id}`, { name: edit.name, current_value_eur: parseFloat(edit.current_value_eur) });
      setEdit(null);
      toast.success("Fund updated");
      load();
    } catch (err) { toast.error(apiErr(err.response?.data?.detail)); }
  };

  const removeFund = async (id) => {
    await api.delete(`/funds/${id}`);
    toast.success("Fund deleted");
    load();
  };

  const addContribution = async () => {
    if (contrib.amount_eur === "") return;
    try {
      await api.post(`/funds/${contribFor.id}/contributions`, {
        amount_eur: parseFloat(contrib.amount_eur), date: contrib.date, note: contrib.note,
      });
      setContrib({ amount_eur: "", date: todayStr(), note: "" });
      setContribFor(null);
      toast.success("Contribution added");
      load();
    } catch (err) { toast.error(apiErr(err.response?.data?.detail)); }
  };

  const removeContribution = async (fundId, cid) => {
    await api.delete(`/funds/${fundId}/contributions/${cid}`);
    toast.success("Contribution removed");
    load();
  };

  if (!funds)
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Funds"
        subtitle="Save contributions, current value and cumulative return in EUR"
        action={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-fund-button" className="rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]">
                <Plus className="mr-2 h-4 w-4" /> New Fund
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="create-fund-dialog">
              <DialogHeader><DialogTitle>Create Fund</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Fund name</Label>
                  <Input data-testid="fund-name-input" value={newFund.name} onChange={(e) => setNewFund({ ...newFund, name: e.target.value })} placeholder="e.g. S&P 500 ETF" />
                </div>
                <div className="space-y-1.5">
                  <Label>Current value (EUR)</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">€</span>
                    <Input type="number" step="0.01" data-testid="fund-value-input" className="pl-7" value={newFund.current_value_eur} onChange={(e) => setNewFund({ ...newFund, current_value_eur: e.target.value })} placeholder="0.00" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button data-testid="save-fund-button" onClick={createFund} className="bg-zinc-900 text-white hover:bg-zinc-800">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {funds.length === 0 && (
        <div className="card-soft flex flex-col items-center justify-center py-20 text-center">
          <Landmark className="h-8 w-8 text-zinc-300" />
          <p className="mt-3 text-sm text-zinc-500">No funds yet. Create your first fund to start tracking.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {funds.map((f, i) => {
          let running = 0;
          const history = f.contributions.map((c) => {
            running += c.amount_eur;
            return { date: c.date, invested: Math.round(running * 100) / 100 };
          });
          const isOpen = expanded === f.id;
          return (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              data-testid={`fund-card-${f.id}`}
              className="card-soft p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading text-lg font-semibold text-zinc-900">{f.name}</h3>
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-600">EUR</Badge>
                  </div>
                  <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-zinc-900">{fmtEUR(f.current_value_eur)}</div>
                </div>
                <div className="flex gap-1">
                  <button data-testid={`fund-edit-${f.id}`} onClick={() => setEdit({ ...f, current_value_eur: String(f.current_value_eur) })} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><Pencil className="h-4 w-4" /></button>
                  <button data-testid={`fund-delete-${f.id}`} onClick={() => removeFund(f.id)} className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg bg-zinc-50 p-2.5">
                  <div className="text-[11px] text-zinc-400">Invested</div>
                  <div className="font-mono tabular-nums text-zinc-900">{fmtEUR(f.invested_eur)}</div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-2.5">
                  <div className="text-[11px] text-zinc-400">Return</div>
                  <div className={`font-mono tabular-nums ${f.cumulative_return_eur >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{fmtEUR(f.cumulative_return_eur)}</div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-2.5">
                  <div className="text-[11px] text-zinc-400">Return %</div>
                  <div className={`font-mono tabular-nums ${f.cumulative_return_pct >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{fmtPct(f.cumulative_return_pct)}</div>
                </div>
              </div>

              {history.length > 0 && (
                <ResponsiveContainer width="100%" height={120} className="mt-4">
                  <BarChart data={history} margin={{ left: -20, right: 4, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "#a1a1aa" }} tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `€${v}`} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }} formatter={(v) => [fmtEUR(v), "Invested"]} labelFormatter={(l) => shortDate(l)} />
                    <Bar dataKey="invested" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              <div className="mt-4 flex items-center justify-between">
                <Button variant="outline" size="sm" data-testid={`add-contribution-${f.id}`} onClick={() => { setContribFor(f); setContrib({ amount_eur: "", date: todayStr(), note: "" }); }}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Contribution
                </Button>
                <button data-testid={`toggle-contribs-${f.id}`} onClick={() => setExpanded(isOpen ? null : f.id)} className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900">
                  {f.contributions.length} contribution{f.contributions.length === 1 ? "" : "s"}
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              {isOpen && (
                <div className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3">
                  {f.contributions.length === 0 && <p className="text-xs text-zinc-400">No contributions logged.</p>}
                  {f.contributions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50">
                      <span className="text-zinc-500">{c.date}{c.note ? ` · ${c.note}` : ""}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-zinc-900">{fmtEUR(c.amount_eur)}</span>
                        <button data-testid={`contrib-delete-${c.id}`} onClick={() => removeContribution(f.id, c.id)} className="rounded p-1 text-zinc-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Edit fund dialog */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent data-testid="edit-fund-dialog">
          <DialogHeader><DialogTitle>Edit Fund</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Fund name</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Current value (EUR)</Label><Input type="number" step="0.01" data-testid="edit-fund-value" value={edit.current_value_eur} onChange={(e) => setEdit({ ...edit, current_value_eur: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button data-testid="save-fund-edit" onClick={saveEdit} className="bg-zinc-900 text-white hover:bg-zinc-800">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contribution dialog */}
      <Dialog open={!!contribFor} onOpenChange={(o) => !o && setContribFor(null)}>
        <DialogContent data-testid="contribution-dialog">
          <DialogHeader><DialogTitle>Add Contribution{contribFor ? ` · ${contribFor.name}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Amount (EUR)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">€</span>
                <Input type="number" step="0.01" data-testid="contribution-amount-input" className="pl-7" value={contrib.amount_eur} onChange={(e) => setContrib({ ...contrib, amount_eur: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" data-testid="contribution-date-input" value={contrib.date} onChange={(e) => setContrib({ ...contrib, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Note (optional)</Label><Input value={contrib.note} onChange={(e) => setContrib({ ...contrib, note: e.target.value })} placeholder="e.g. Monthly buy" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContribFor(null)}>Cancel</Button>
            <Button data-testid="save-contribution-button" onClick={addContribution} className="bg-zinc-900 text-white hover:bg-zinc-800">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
