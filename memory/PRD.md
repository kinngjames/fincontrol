# FinControl — PRD

## Original problem statement
Personal finance web app focused on investments. Minimal expenses (5 fixed categories), Trading Bot(s) in USD, Funds in EUR, consolidated totals in EUR with editable exchange rate, secure accounts, persistent storage, editable records, PWA, clear "not financial advice" disclaimers.

## User choices
- Auth: passwordless PROFILE SELECTOR (no public registration); multiple profiles for testing.
- Income: manual entries in EUR.
- Savings: single balance with deposits/withdrawals + capital evolution chart.
- Bots: fleet of bots with active/paused status, individual + global analysis.
- Net worth = Funds + Savings + Bot profit (EUR). Income/Expenses are cash flow.
- Style: clean light minimal. Manual editable USD→EUR rate. PWA enabled.

## Architecture
- Backend: FastAPI + MongoDB (motor). JWT token (30d) issued on profile select; Bearer auth.
- Frontend: React 19 + Tailwind + shadcn/ui + Recharts + framer-motion. PWA (manifest + service worker).
- Collections: users, bots, bot_returns, funds, contributions, savings, income, expenses.

## Implemented (2026-06)
- Profile selector login (list/create/select), passwordless. Data isolated per profile.
- Bot Fleet: create/rename/delete bots, active/paused toggle, per-bot daily USD returns CRUD, individual detail page (cumulative/daily avg/monthly/projection/chart/table), global overview (combined equity + fleet KPIs).
- Funds (EUR): create/edit/delete, contributions log, cumulative return %, value history chart.
- Savings (EUR): deposits/withdrawals, balance, capital evolution area chart, movements table.
- Cash Flow: Income (EUR CRUD) + Expenses (5 fixed categories, CRUD, breakdown donut + progress).
- Dashboard: net worth + savings + funds + bot profit KPIs, month income/expenses/net cashflow, fleet performance chart, spending mix, disclaimer.
- Settings: editable USD→EUR rate, live conversion test, profile info, JSON data export, switch profile.
- Seeded "Alex Demo" profile with 3 bots, 2 funds, savings, income, expenses.
- Verified end-to-end by testing agent: backend 11/11, all frontend flows pass.

## Backlog (P1/P2)
- P1: recurring monthly income (salary auto-entry).
- P1: savings goals/pots with targets.
- P2: per-bot comparison overlay chart on the fleet page.
- P2: auth/ownership check on delete_profile endpoint.
- P2: CSV export in addition to JSON.
