import { useEffect, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import api, { apiErr } from "@/lib/api";
import { fmtEUR, todayStr, CATEGORIES, CATEGORY_COLORS } from "@/lib/format";

export default function Expenses() {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ amount_eur: "", category: "Food", date: todayStr(), description: "" });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("All");
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/expenses");
    setItems(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.amount_eur === "") return;
    setSaving(true);
    try {
      await api.post("/expenses", { ...form, amount_eur: parseFloat(form.amount_eur) });
      setForm({ amount_eur: "", category: form.category, date: todayStr(), description: "" });
      toast.success("Expense added");
      load();
    } catch (err) { toast.error(apiErr(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/expenses/${edit.id}`, {
        amount_eur: parseFloat(edit.amount_eur), category: edit.category, date: edit.date, description: edit.description || "",
      });
      setEdit(null);
      toast.success("Expense updated");
      load();
    } catch (err) { toast.error(apiErr(err.response?.data?.detail)); }
  };

  const remove = async (id) => {
    await api.delete(`/expenses/${id}`);
    toast.success("Expense deleted");
    load();
  };

  const totals = useMemo(() => {
    const t = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    let all = 0;
    (items || []).forEach((e) => { t[e.category] += e.amount_eur; all += e.amount_eur; });
    return { byCat: t, all };
  }, [items]);

  if (!items)
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>;

  const pieData = CATEGORIES.map((c) => ({ category: c, amount_eur: totals.byCat[c] })).filter((c) => c.amount_eur > 0);
  const filtered = filter === "All" ? items : items.filter((e) => e.category === filter);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Expenses"
        subtitle="Five fixed categories · logged in EUR"
        action={<span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-500">Currency · EUR €</span>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Add form */}
        <motion.form
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          onSubmit={submit} data-testid="expense-form" className="card-soft h-fit space-y-4 p-5"
        >
          <h3 className="font-heading text-lg font-semibold text-zinc-900">Add Expense</h3>
          <div className="space-y-1.5">
            <Label>Amount (EUR)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">€</span>
              <Input type="number" step="0.01" data-testid="expense-amount-input" className="pl-7" placeholder="0.00" value={form.amount_eur} onChange={(e) => setForm({ ...form, amount_eur: e.target.value })} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger data-testid="expense-category-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} data-testid={`category-option-${c}`}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" data-testid="expense-date-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Input data-testid="expense-desc-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Groceries" />
          </div>
          <Button type="submit" disabled={saving} data-testid="expense-submit-button" className="h-11 w-full rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Add Expense
          </Button>
        </motion.form>

        {/* Breakdown */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} data-testid="expense-breakdown" className="card-soft p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-lg font-semibold text-zinc-900">Category Breakdown</h3>
            <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900">{fmtEUR(totals.all)}</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              {pieData.length === 0 ? (
                <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-400">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} dataKey="amount_eur" nameKey="category" cx="50%" cy="50%" innerRadius={46} outerRadius={72} paddingAngle={2}>
                      {pieData.map((c) => <Cell key={c.category} fill={CATEGORY_COLORS[c.category]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex flex-col justify-center gap-3">
              {CATEGORIES.map((c) => {
                const val = totals.byCat[c];
                const pct = totals.all ? (val / totals.all) * 100 : 0;
                return (
                  <div key={c}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-zinc-600">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[c] }} />{c}
                      </span>
                      <span className="font-mono tabular-nums text-zinc-900">{fmtEUR(val)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CATEGORY_COLORS[c] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Ledger */}
      <div className="mt-6 card-soft p-5" data-testid="expense-ledger">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-heading text-lg font-semibold text-zinc-900">Expense Ledger</h3>
          <div className="flex flex-wrap gap-1.5">
            {["All", ...CATEGORIES].map((c) => (
              <button key={c} data-testid={`filter-${c}`} onClick={() => setFilter(c)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === c ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="fc-scroll max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-400">
                <th className="pb-2 font-semibold">Date</th>
                <th className="pb-2 font-semibold">Category</th>
                <th className="pb-2 font-semibold">Description</th>
                <th className="pb-2 font-semibold">Amount</th>
                <th className="pb-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-zinc-400">No expenses.</td></tr>}
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
                  <td className="py-2.5 text-zinc-600">{e.date}</td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                      <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[e.category] }} />{e.category}
                    </span>
                  </td>
                  <td className="py-2.5 text-zinc-500">{e.description || "—"}</td>
                  <td className="py-2.5 font-mono tabular-nums text-zinc-900">{fmtEUR(e.amount_eur)}</td>
                  <td className="py-2.5 text-right">
                    <button data-testid={`expense-edit-${e.id}`} onClick={() => setEdit({ ...e, amount_eur: String(e.amount_eur) })} className="mr-1 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><Pencil className="h-4 w-4" /></button>
                    <button data-testid={`expense-delete-${e.id}`} onClick={() => remove(e.id)} className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent data-testid="expense-edit-dialog">
          <DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Amount (EUR)</Label><Input type="number" step="0.01" data-testid="edit-expense-amount" value={edit.amount_eur} onChange={(ev) => setEdit({ ...edit, amount_eur: ev.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={edit.category} onValueChange={(v) => setEdit({ ...edit, category: v })}>
                  <SelectTrigger data-testid="edit-expense-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={edit.date} onChange={(ev) => setEdit({ ...edit, date: ev.target.value })} /></div>
              <div className="space-y-1.5"><Label>Description</Label><Input value={edit.description || ""} onChange={(ev) => setEdit({ ...edit, description: ev.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button data-testid="save-expense-edit" onClick={saveEdit} className="bg-zinc-900 text-white hover:bg-zinc-800">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
