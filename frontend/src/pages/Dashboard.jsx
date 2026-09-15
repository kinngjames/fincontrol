import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { Wallet, Bot, Landmark, Receipt, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { StatCard } from "@/components/StatCard";
import { Disclaimer } from "@/components/Disclaimer";
import api from "@/lib/api";
import { fmtEUR, fmtUSD, shortDate, CATEGORY_COLORS } from "@/lib/format";

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard/summary").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data)
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );

  const catData = data.category_breakdown.filter((c) => c.amount_eur > 0);
  const perf = data.performance;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Dashboard"
        subtitle={`Consolidated in EUR · rate 1 USD = ${data.usd_to_eur} EUR`}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          testid="stat-net-worth"
          label="Net Worth"
          value={fmtEUR(data.net_worth_eur)}
          sub="Funds + Bot profit (EUR)"
          accent="ink"
          icon={Wallet}
          delay={0}
        />
        <StatCard
          testid="stat-bot-profit"
          label="Bot Profit"
          value={fmtEUR(data.bot_profit_eur)}
          sub={`${fmtUSD(data.bot_profit_usd)} converted`}
          accent={data.bot_profit_eur >= 0 ? "gain" : "spend"}
          icon={Bot}
          delay={0.05}
        />
        <StatCard
          testid="stat-funds-value"
          label="Funds Value"
          value={fmtEUR(data.funds_value_eur)}
          sub={`${data.funds_count} fund${data.funds_count === 1 ? "" : "s"}`}
          accent="gain"
          icon={Landmark}
          delay={0.1}
        />
        <StatCard
          testid="stat-month-expenses"
          label="This Month Spend"
          value={fmtEUR(data.month_expenses_eur)}
          sub={`${fmtEUR(data.total_expenses_eur)} all time`}
          accent="spend"
          icon={Receipt}
          delay={0.15}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Performance chart */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          data-testid="performance-chart"
          className="card-soft p-5 lg:col-span-2"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-lg font-semibold text-zinc-900">Portfolio Performance</h3>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">Bot equity · EUR</span>
          </div>
          {perf.length === 0 ? (
            <EmptyChart text="Log trading bot returns to see your equity curve." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={perf} margin={{ left: -18, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} width={58} tickFormatter={(v) => `€${v}`} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }}
                  formatter={(v) => [fmtEUR(v), "Equity"]}
                  labelFormatter={(l) => shortDate(l)}
                />
                <Area type="monotone" dataKey="value_eur" stroke="#10B981" strokeWidth={2} fill="url(#eq)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* Expense breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          data-testid="expense-breakdown-chart"
          className="card-soft p-5"
        >
          <h3 className="mb-4 font-heading text-lg font-semibold text-zinc-900">Spending Mix</h3>
          {catData.length === 0 ? (
            <EmptyChart text="No expenses logged yet." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={catData} dataKey="amount_eur" nameKey="category" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2}>
                    {catData.map((c) => (
                      <Cell key={c.category} fill={CATEGORY_COLORS[c.category]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {catData.map((c) => (
                  <div key={c.category} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-zinc-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[c.category] }} />
                      {c.category}
                    </span>
                    <span className="font-mono tabular-nums text-zinc-900">{fmtEUR(c.amount_eur)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      <div className="mt-6">
        <Disclaimer />
      </div>
    </div>
  );
}

function EmptyChart({ text }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-400">
      {text}
    </div>
  );
}
