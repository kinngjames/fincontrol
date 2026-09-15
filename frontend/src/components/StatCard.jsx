import { motion } from "framer-motion";

export function StatCard({ label, value, sub, accent = "ink", icon: Icon, testid, delay = 0 }) {
  const accentMap = {
    ink: "text-zinc-900",
    gain: "text-emerald-600",
    spend: "text-rose-500",
    usd: "text-blue-600",
  };
  const iconBg = {
    ink: "bg-zinc-100 text-zinc-700",
    gain: "bg-emerald-50 text-emerald-600",
    spend: "bg-rose-50 text-rose-500",
    usd: "bg-blue-50 text-blue-600",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      data-testid={testid}
      className="card-soft p-5 transition-colors hover:border-zinc-300"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</span>
        {Icon && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg[accent]}`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className={`mt-3 font-mono text-2xl font-semibold tabular-nums ${accentMap[accent]}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </motion.div>
  );
}
