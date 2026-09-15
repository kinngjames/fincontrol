"""FinControl backend tests: profiles auth, bots fleet, savings, income, expenses, settings, dashboard, isolation."""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fincontrol-167.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
THIS_MONTH = datetime.now(timezone.utc).strftime("%Y-%m")


@pytest.fixture(scope="session")
def demo_token():
    r = requests.get(f"{API}/profiles")
    assert r.status_code == 200
    profiles = r.json()
    demo = next((p for p in profiles if p["name"] == "Alex Demo"), None)
    assert demo, "Alex Demo profile missing"
    r = requests.post(f"{API}/auth/select", json={"user_id": demo["id"]})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="session")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


# ---- Profiles / Auth ----
class TestAuth:
    def test_list_profiles(self):
        r = requests.get(f"{API}/profiles")
        assert r.status_code == 200
        assert any(p["name"] == "Alex Demo" for p in r.json())

    def test_create_and_select_profile(self):
        name = f"TEST_Profile_{datetime.now(timezone.utc).timestamp()}"
        r = requests.post(f"{API}/profiles", json={"name": name})
        assert r.status_code == 200
        pid = r.json()["id"]
        r2 = requests.post(f"{API}/auth/select", json={"user_id": pid})
        assert r2.status_code == 200
        tok = r2.json()["token"]
        assert isinstance(tok, str) and len(tok) > 20
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 200
        assert me.json()["id"] == pid
        requests.delete(f"{API}/profiles/{pid}")

    def test_me_requires_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


class TestBots:
    def test_list_and_overview_not_shadowed(self, demo_headers):
        r = requests.get(f"{API}/bots", headers=demo_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

        ov = requests.get(f"{API}/bots/overview", headers=demo_headers)
        assert ov.status_code == 200, f"overview shadowed? {ov.text}"
        data = ov.json()
        for k in ("total_cumulative_usd", "total_cumulative_eur", "active_count", "paused_count", "bot_count", "series", "bots"):
            assert k in data

    def test_bot_lifecycle_and_returns(self, demo_headers):
        r = requests.post(f"{API}/bots", json={"name": "TEST_Bot"}, headers=demo_headers)
        assert r.status_code == 200
        bot = r.json()
        bid = bot["id"]
        assert bot["status"] == "active"

        d = requests.get(f"{API}/bots/{bid}", headers=demo_headers)
        assert d.status_code == 200
        assert d.json()["stats"]["cumulative_usd"] == 0.0

        r1 = requests.post(f"{API}/bots/{bid}/returns",
                           json={"date": f"{THIS_MONTH}-05", "amount_usd": 100.0, "note": "n1"},
                           headers=demo_headers)
        assert r1.status_code == 200
        ret_id = r1.json()["id"]
        requests.post(f"{API}/bots/{bid}/returns",
                      json={"date": f"{THIS_MONTH}-06", "amount_usd": 50.0},
                      headers=demo_headers)

        d = requests.get(f"{API}/bots/{bid}", headers=demo_headers).json()
        assert d["stats"]["cumulative_usd"] == 150.0
        assert d["stats"]["this_month_usd"] == 150.0
        assert d["stats"]["count"] == 2

        upd = requests.put(f"{API}/bots/{bid}/returns/{ret_id}",
                           json={"date": f"{THIS_MONTH}-05", "amount_usd": 200.0, "note": "upd"},
                           headers=demo_headers)
        assert upd.status_code == 200
        d = requests.get(f"{API}/bots/{bid}", headers=demo_headers).json()
        assert d["stats"]["cumulative_usd"] == 250.0

        dr = requests.delete(f"{API}/bots/{bid}/returns/{ret_id}", headers=demo_headers)
        assert dr.status_code == 200
        d = requests.get(f"{API}/bots/{bid}", headers=demo_headers).json()
        assert d["stats"]["cumulative_usd"] == 50.0

        ov1 = requests.get(f"{API}/bots/overview", headers=demo_headers).json()
        active_before = ov1["active_count"]
        u = requests.put(f"{API}/bots/{bid}", json={"status": "paused"}, headers=demo_headers)
        assert u.status_code == 200 and u.json()["status"] == "paused"
        ov2 = requests.get(f"{API}/bots/overview", headers=demo_headers).json()
        assert ov2["active_count"] == active_before - 1

        requests.put(f"{API}/bots/{bid}", json={"status": "active"}, headers=demo_headers)
        ov3 = requests.get(f"{API}/bots/overview", headers=demo_headers).json()
        assert ov3["active_count"] == active_before

        dl = requests.delete(f"{API}/bots/{bid}", headers=demo_headers)
        assert dl.status_code == 200
        assert requests.get(f"{API}/bots/{bid}", headers=demo_headers).status_code == 404


class TestSavings:
    def test_savings_flow(self, demo_headers):
        before = requests.get(f"{API}/savings", headers=demo_headers).json()
        base = before["balance_eur"]

        d = requests.post(f"{API}/savings",
                          json={"type": "deposit", "amount_eur": 300.0, "date": TODAY, "note": "TEST_dep"},
                          headers=demo_headers)
        assert d.status_code == 200
        after_dep = d.json()
        assert round(after_dep["balance_eur"] - base, 2) == 300.0

        w = requests.post(f"{API}/savings",
                          json={"type": "withdrawal", "amount_eur": 100.0, "date": TODAY, "note": "TEST_wd"},
                          headers=demo_headers)
        assert w.status_code == 200
        after_w = w.json()
        assert round(after_w["balance_eur"] - base, 2) == 200.0

        for t in after_w["transactions"]:
            if t.get("note", "").startswith("TEST_"):
                requests.delete(f"{API}/savings/{t['id']}", headers=demo_headers)
        final = requests.get(f"{API}/savings", headers=demo_headers).json()
        assert final["balance_eur"] == base


class TestIncome:
    def test_income_crud(self, demo_headers):
        before = requests.get(f"{API}/income", headers=demo_headers).json()
        base_month = before["month_total_eur"]

        c = requests.post(f"{API}/income",
                          json={"amount_eur": 500.0, "date": TODAY, "description": "TEST_income"},
                          headers=demo_headers)
        assert c.status_code == 200
        after = c.json()
        assert round(after["month_total_eur"] - base_month, 2) == 500.0
        item = next(i for i in after["items"] if i.get("description") == "TEST_income")
        iid = item["id"]

        u = requests.put(f"{API}/income/{iid}",
                         json={"amount_eur": 600.0, "date": TODAY, "description": "TEST_income_upd"},
                         headers=demo_headers)
        assert u.status_code == 200
        assert round(u.json()["month_total_eur"] - base_month, 2) == 600.0

        d = requests.delete(f"{API}/income/{iid}", headers=demo_headers)
        assert d.status_code == 200
        assert d.json()["month_total_eur"] == base_month


class TestExpenses:
    def test_expenses_crud_and_category_validation(self, demo_headers):
        c = requests.post(f"{API}/expenses",
                          json={"amount_eur": 12.5, "category": "Food", "date": TODAY, "description": "TEST_exp"},
                          headers=demo_headers)
        assert c.status_code == 200
        eid = c.json()["id"]

        bad = requests.post(f"{API}/expenses",
                            json={"amount_eur": 1.0, "category": "Groceries", "date": TODAY},
                            headers=demo_headers)
        assert bad.status_code == 400

        u = requests.put(f"{API}/expenses/{eid}",
                         json={"amount_eur": 15.0, "category": "Transport", "date": TODAY, "description": "TEST_exp2"},
                         headers=demo_headers)
        assert u.status_code == 200
        assert u.json()["category"] == "Transport"

        d = requests.delete(f"{API}/expenses/{eid}", headers=demo_headers)
        assert d.status_code == 200


class TestSettingsDashboard:
    def test_settings_affects_dashboard(self, demo_headers):
        orig = requests.get(f"{API}/settings", headers=demo_headers).json()["usd_to_eur"]
        try:
            new_rate = 1.10
            r = requests.put(f"{API}/settings", json={"usd_to_eur": new_rate}, headers=demo_headers)
            assert r.status_code == 200
            ds = requests.get(f"{API}/dashboard/summary", headers=demo_headers).json()
            assert ds["usd_to_eur"] == new_rate
            expected_bot_eur = round(ds["bot_profit_usd"] * new_rate, 2)
            assert abs(ds["bot_profit_eur"] - expected_bot_eur) < 0.05
            expected_nw = round(ds["funds_value_eur"] + ds["savings_balance_eur"] + ds["bot_profit_eur"], 2)
            assert abs(ds["net_worth_eur"] - expected_nw) < 0.05
            assert ds["month_net_eur"] == round(ds["month_income_eur"] - ds["month_expenses_eur"], 2)
        finally:
            requests.put(f"{API}/settings", json={"usd_to_eur": orig}, headers=demo_headers)

    def test_invalid_rate(self, demo_headers):
        r = requests.put(f"{API}/settings", json={"usd_to_eur": -1}, headers=demo_headers)
        assert r.status_code == 400


class TestIsolation:
    def test_new_profile_has_no_data(self):
        name = f"TEST_Isolate_{datetime.now(timezone.utc).timestamp()}"
        pid = requests.post(f"{API}/profiles", json={"name": name}).json()["id"]
        tok = requests.post(f"{API}/auth/select", json={"user_id": pid}).json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        try:
            assert requests.get(f"{API}/bots", headers=h).json() == []
            assert requests.get(f"{API}/funds", headers=h).json() == []
            sav = requests.get(f"{API}/savings", headers=h).json()
            assert sav["balance_eur"] == 0 and sav["transactions"] == []
            inc = requests.get(f"{API}/income", headers=h).json()
            assert inc["total_eur"] == 0 and inc["items"] == []
            assert requests.get(f"{API}/expenses", headers=h).json() == []
            ov = requests.get(f"{API}/bots/overview", headers=h).json()
            assert ov["bot_count"] == 0 and ov["total_cumulative_usd"] == 0
            ds = requests.get(f"{API}/dashboard/summary", headers=h).json()
            assert ds["net_worth_eur"] == 0
        finally:
            requests.delete(f"{API}/profiles/{pid}")
