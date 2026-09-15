import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Bot, Landmark, PiggyBank, ArrowLeftRight, Settings, LogOut, TrendingUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { to: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/bots", label: "Bots", short: "Bots", icon: Bot, testid: "nav-bots" },
  { to: "/funds", label: "Funds", short: "Funds", icon: Landmark, testid: "nav-funds" },
  { to: "/savings", label: "Savings", short: "Savings", icon: PiggyBank, testid: "nav-savings" },
  { to: "/cashflow", label: "Cash Flow", short: "Cash", icon: ArrowLeftRight, testid: "nav-cashflow" },
  { to: "/settings", label: "Settings", short: "More", icon: Settings, testid: "nav-settings" },
];

export function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = (user?.name || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background grain-veil">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[260px] flex-col border-r border-zinc-200 bg-white px-4 py-6 lg:flex">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white">
            <TrendingUp className="h-5 w-5" />
          </div>
          <span className="font-heading text-xl font-extrabold text-zinc-900">FinControl</span>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={item.testid}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`
              }
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-900">{user?.name}</div>
              <div className="truncate text-xs text-zinc-400">Personal profile</div>
            </div>
          </div>
          <button
            data-testid="logout-button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <LogOut className="h-4 w-4" /> Switch profile
          </button>
        </div>
      </aside>

      <main className="min-h-screen pb-24 lg:ml-[260px] lg:pb-0">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-zinc-200 bg-white/95 backdrop-blur-md safe-bottom lg:hidden">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            data-testid={`${item.testid}-mobile`}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium"
          >
            {({ isActive }) => (
              <>
                <item.icon className={`h-5 w-5 ${isActive ? "text-zinc-900" : "text-zinc-400"}`} />
                <span className={isActive ? "text-zinc-900" : "text-zinc-400"}>{item.short}</span>
                <span className={`h-0.5 w-5 rounded-full ${isActive ? "bg-zinc-900" : "bg-transparent"}`} />
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, action, back }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back}
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
