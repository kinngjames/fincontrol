import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Save, Download, LogOut, ArrowRightLeft, FileSpreadsheet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/Layout";
import { Disclaimer } from "@/components/Disclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { fmtEUR, fmtUSD } from "@/lib/format";

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [testUsd, setTestUsd] = useState("100");
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setRate(String(r.data.usd_to_eur))).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/settings", { usd_to_eur: parseFloat(rate) });
      updateUser({ usd_to_eur: data.usd_to_eur });
      toast.success("Exchange rate updated");
    } catch (err) { toast.error(apiErr(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const [bots, funds, expenses, income, savings, settings] = await Promise.all([
        api.get("/bots"), api.get("/funds"), api.get("/expenses"), api.get("/income"), api.get("/savings"), api.get("/settings"),
      ]);
      const payload = {
        exported_at: new Date().toISOString(),
        user: { name: user?.name },
        settings: settings.data,
        bots: bots.data,
        funds: funds.data,
        expenses: expenses.data,
        income: income.data,
        savings: savings.data,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fincontrol-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported");
    } catch (err) { toast.error(apiErr(err.response?.data?.detail)); }
    finally { setExporting(false); }
  };

  const exportCsv = async () => {
    setExportingCsv(true);
    try {
      const [botsRes, funds, expenses, income, savings] = await Promise.all([
        api.get("/bots"), api.get("/funds"), api.get("/expenses"), api.get("/income"), api.get("/savings"),
      ]);
      const details = await Promise.all(botsRes.data.map((b) => api.get(`/bots/${b.id}`)));
      const rows = [["Type", "Date", "Name", "Category", "Description", "Amount", "Currency", "Note"]];
      const esc = (v) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      details.forEach((d) => {
        const bot = d.data;
        bot.returns.forEach((r) => rows.push(["BotReturn", r.date, bot.name, "", "", r.amount_usd, "USD", r.note || ""]));
      });
      funds.data.forEach((f) => {
        rows.push(["Fund", "", f.name, "", "Current value", f.current_value_eur, "EUR", ""]);
        f.contributions.forEach((c) => rows.push(["FundContribution", c.date, f.name, "", "Contribution", c.amount_eur, "EUR", c.note || ""]));
      });
      savings.data.transactions.forEach((t) => rows.push(["Savings", t.date, "", "", t.type, t.amount_eur, "EUR", t.note || ""]));
      income.data.items.forEach((i) => rows.push(["Income", i.date, "", "", i.description || "", i.amount_eur, "EUR", ""]));
      expenses.data.forEach((e) => rows.push(["Expense", e.date, "", e.category, e.description || "", e.amount_eur, "EUR", ""]));

      const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fincontrol-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch (err) { toast.error(apiErr(err.response?.data?.detail)); }
    finally { setExportingCsv(false); }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const rateNum = parseFloat(rate) || 0;
  const converted = (parseFloat(testUsd) || 0) * rateNum;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Settings" subtitle="Exchange rate, profile and data" />

      <div className="space-y-4">
        {/* Exchange rate */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-soft p-5" data-testid="exchange-rate-card">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-zinc-500" />
            <h3 className="font-heading text-lg font-semibold text-zinc-900">Exchange Rate</h3>
          </div>
          <p className="mt-1 text-sm text-zinc-500">Used to convert your Trading Bot profit (USD) into consolidated EUR totals.</p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>1 USD = ? EUR</Label>
              <Input type="number" step="0.0001" data-testid="exchange-rate-input" value={rate} onChange={(e) => setRate(e.target.value)} className="w-40" />
            </div>
            <Button data-testid="save-rate-button" onClick={save} disabled={saving} className="h-10 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save
            </Button>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
            <Label className="text-xs text-zinc-400">Live conversion test</Label>
            <div className="mt-2 flex items-center gap-3">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
                <Input type="number" data-testid="convert-usd-input" className="w-36 pl-7" value={testUsd} onChange={(e) => setTestUsd(e.target.value)} />
              </div>
              <ArrowRightLeft className="h-4 w-4 text-zinc-400" />
              <div data-testid="convert-result" className="font-mono text-lg font-semibold tabular-nums text-emerald-600">{fmtEUR(converted)}</div>
            </div>
            <p className="mt-2 text-xs text-zinc-400">{fmtUSD(parseFloat(testUsd) || 0)} × {rateNum || 0} = {fmtEUR(converted)}</p>
          </div>
        </motion.div>

        {/* Profile */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card-soft p-5" data-testid="profile-card">
          <h3 className="font-heading text-lg font-semibold text-zinc-900">Profile</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-xs text-zinc-400">Name</div>
              <div className="text-sm font-medium text-zinc-900">{user?.name}</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-xs text-zinc-400">Consolidation currency</div>
              <div className="text-sm font-medium text-zinc-900">EUR (€)</div>
            </div>
          </div>
        </motion.div>

        {/* Data */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card-soft p-5" data-testid="data-card">
          <h3 className="font-heading text-lg font-semibold text-zinc-900">Your Data</h3>
          <p className="mt-1 text-sm text-zinc-500">Download a full JSON backup of your returns, funds and expenses.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" data-testid="export-data-button" onClick={exportData} disabled={exporting}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Export JSON
            </Button>
            <Button variant="outline" data-testid="export-csv-button" onClick={exportCsv} disabled={exportingCsv}>
              {exportingCsv ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />} Export CSV
            </Button>
            <Button variant="outline" data-testid="settings-logout-button" onClick={handleLogout} className="text-rose-500 hover:bg-rose-50 hover:text-rose-600">
              <LogOut className="mr-2 h-4 w-4" /> Log out
            </Button>
          </div>
        </motion.div>

        <Disclaimer />
      </div>
    </div>
  );
}
