export const fmtEUR = (n) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

export const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

export const fmtPct = (n) => `${n >= 0 ? "+" : ""}${(Number.isFinite(n) ? n : 0).toFixed(2)}%`;

export const todayStr = () => new Date().toISOString().slice(0, 10);

export const shortDate = (s) => {
  try {
    return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return s;
  }
};

export const CATEGORIES = ["Food", "Transport", "Leisure", "Housing", "Other"];

export const CATEGORY_COLORS = {
  Food: "#10B981",
  Transport: "#6366F1",
  Leisure: "#F59E0B",
  Housing: "#0EA5E9",
  Other: "#64748B",
};
