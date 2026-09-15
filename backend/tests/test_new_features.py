"""Backend tests for iteration 2: savings goals, recurring expenses, best-bot, route ordering."""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
THIS_MONTH = datetime.now(timezone.utc).strftime("%Y-%m")


@pytest.fixture(scope="module")
def headers():
    # Use ephemeral profile for isolation
    name = f"TEST_iter2_{datetime.now(timezone.utc).timestamp()}"
    pid = requests.post(f"{API}/profiles", json={"name": name}).json()["id"]
    tok = requests.post(f"{API}/auth/select", json={"user_id": pid}).json()["token"]
    yield {"Authorization": f"Bearer {tok}"}
    requests.delete(f"{API}/profiles/{pid}")


# --- Savings Goals ---
class TestSavingsGoals:
    def test_goal_crud_and_isolation(self, headers):
        # Baseline general savings
        base = requests.get(f"{API}/savings", headers=headers).json()
        assert base["balance_eur"] == 0

        # Create goal
        r = requests.post(f"{API}/savings/goals", json={"name": "TEST_Vacation", "target_eur": 1000},
                          headers=headers)
        assert r.status_code == 200
        goals = r.json()
        assert isinstance(goals, list) and len(goals) == 1
        g = goals[0]
        assert g["name"] == "TEST_Vacation"
        assert g["target_eur"] == 1000
        assert g["saved_eur"] == 0
        assert g["progress_pct"] == 0.0
        gid = g["id"]

        # List
        gl = requests.get(f"{API}/savings/goals", headers=headers).json()
        assert len(gl) == 1 and gl[0]["id"] == gid

        # Add money to goal
        r = requests.post(f"{API}/savings", json={
            "type": "deposit", "amount_eur": 250, "date": TODAY, "goal_id": gid,
        }, headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert "goals" in data
        assert data["goals"][0]["saved_eur"] == 250
        assert data["goals"][0]["progress_pct"] == 25.0

        # General balance must be unchanged
        gen = requests.get(f"{API}/savings", headers=headers).json()
        assert gen["balance_eur"] == 0, f"General balance leaked: {gen}"
        assert gen["transactions"] == []

        # Withdrawal from goal
        r = requests.post(f"{API}/savings", json={
            "type": "withdrawal", "amount_eur": 50, "date": TODAY, "goal_id": gid,
        }, headers=headers)
        assert r.json()["goals"][0]["saved_eur"] == 200

        # Update goal
        r = requests.put(f"{API}/savings/goals/{gid}",
                         json={"name": "TEST_VacationX", "target_eur": 500}, headers=headers)
        assert r.status_code == 200
        assert r.json()[0]["name"] == "TEST_VacationX"
        assert r.json()[0]["target_eur"] == 500
        assert r.json()[0]["progress_pct"] == 40.0  # 200/500

        # Add general (non-goal) savings; should NOT affect goal
        requests.post(f"{API}/savings", json={"type": "deposit", "amount_eur": 100, "date": TODAY},
                      headers=headers)
        gen = requests.get(f"{API}/savings", headers=headers).json()
        assert gen["balance_eur"] == 100
        gl = requests.get(f"{API}/savings/goals", headers=headers).json()
        assert gl[0]["saved_eur"] == 200  # unaffected

        # Delete goal (and its transactions)
        r = requests.delete(f"{API}/savings/goals/{gid}", headers=headers)
        assert r.status_code == 200
        assert r.json() == []
        # General savings tx still there
        gen = requests.get(f"{API}/savings", headers=headers).json()
        assert gen["balance_eur"] == 100

        # cleanup general
        for t in gen["transactions"]:
            requests.delete(f"{API}/savings/{t['id']}", headers=headers)

    def test_goals_route_not_shadowed(self, headers):
        # /savings/goals must resolve, not be caught by /savings/{tx_id}
        r = requests.get(f"{API}/savings/goals", headers=headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# --- Recurring Expenses ---
class TestRecurringExpenses:
    def test_lifecycle_and_materialization(self, headers):
        # Create recurring expense
        r = requests.post(f"{API}/expenses/recurring", json={
            "amount_eur": 800, "category": "Housing", "day": 1, "description": "TEST_Rent",
        }, headers=headers)
        assert r.status_code == 200
        recs = r.json()
        assert len(recs) >= 1
        rec = next(x for x in recs if x["description"] == "TEST_Rent")
        rid = rec["id"]
        assert rec["active"] is True
        assert rec["amount_eur"] == 800
        assert rec["category"] == "Housing"

        # Materialized this month
        exps = requests.get(f"{API}/expenses", headers=headers).json()
        materialized = [e for e in exps if e.get("recurring_id") == rid and e.get("month") == THIS_MONTH]
        assert len(materialized) == 1
        assert materialized[0]["amount_eur"] == 800
        assert materialized[0]["category"] == "Housing"

        # Invalid category rejected
        bad = requests.post(f"{API}/expenses/recurring",
                            json={"amount_eur": 10, "category": "Bogus", "day": 1},
                            headers=headers)
        assert bad.status_code == 400

        # Update amount+category → syncs generated
        u = requests.put(f"{API}/expenses/recurring/{rid}",
                         json={"amount_eur": 900, "category": "Other"}, headers=headers)
        assert u.status_code == 200
        exps = requests.get(f"{API}/expenses", headers=headers).json()
        gen = next(e for e in exps if e.get("recurring_id") == rid)
        assert gen["amount_eur"] == 900
        assert gen["category"] == "Other"

        # Toggle active=false → still-materialized entry stays, no re-creation
        u = requests.put(f"{API}/expenses/recurring/{rid}",
                         json={"active": False}, headers=headers)
        assert u.status_code == 200
        # Delete generated expense; then list_expenses should NOT regenerate (template inactive)
        requests.delete(f"{API}/expenses/{gen['id']}", headers=headers)
        exps = requests.get(f"{API}/expenses", headers=headers).json()
        assert not any(e.get("recurring_id") == rid for e in exps)

        # Delete template (should also purge any remaining generated)
        d = requests.delete(f"{API}/expenses/recurring/{rid}", headers=headers)
        assert d.status_code == 200
        assert not any(x["id"] == rid for x in d.json())

    def test_recurring_route_not_shadowed(self, headers):
        r = requests.get(f"{API}/expenses/recurring", headers=headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# --- Bots overview compare + this_month_usd ---
class TestBotsOverview:
    def test_compare_and_monthly(self, headers):
        # Create two bots with returns
        b1 = requests.post(f"{API}/bots", json={"name": "TEST_B1"}, headers=headers).json()["id"]
        b2 = requests.post(f"{API}/bots", json={"name": "TEST_B2"}, headers=headers).json()["id"]
        requests.post(f"{API}/bots/{b1}/returns", json={"date": f"{THIS_MONTH}-05", "amount_usd": 50},
                      headers=headers)
        requests.post(f"{API}/bots/{b2}/returns", json={"date": f"{THIS_MONTH}-06", "amount_usd": 200},
                      headers=headers)
        ov = requests.get(f"{API}/bots/overview", headers=headers).json()
        assert "compare" in ov and isinstance(ov["compare"], list)
        assert len(ov["compare"]) >= 1
        assert all("date" in row and b1 in row and b2 in row for row in ov["compare"])
        bots_map = {b["id"]: b for b in ov["bots"]}
        assert bots_map[b1]["this_month_usd"] == 50
        assert bots_map[b2]["this_month_usd"] == 200
        # Best-bot = b2
        winners = [b for b in ov["bots"] if b["this_month_usd"] > 0]
        best = max(winners, key=lambda b: b["this_month_usd"])
        assert best["id"] == b2
        # cleanup
        requests.delete(f"{API}/bots/{b1}", headers=headers)
        requests.delete(f"{API}/bots/{b2}", headers=headers)
