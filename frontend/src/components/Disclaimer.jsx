import { AlertTriangle } from "lucide-react";

export function Disclaimer({ compact = false }) {
  return (
    <div
      data-testid="disclaimer-banner"
      className="flex items-start gap-2.5 rounded-lg border border-amber-200/80 bg-amber-50/60 p-3 text-amber-900"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p className="text-xs leading-relaxed">
        {compact
          ? "Projections are estimates only and do not constitute financial advice."
          : "Estimates & projections shown here are for informational purposes only and do not constitute financial advice. Figures are based solely on the data you enter."}
      </p>
    </div>
  );
}
