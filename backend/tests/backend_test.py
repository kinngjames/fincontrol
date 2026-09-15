"""FinControl backend API tests."""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # fall back to reading frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

DEMO_EMAIL = "demo@fincontrol.app"
DEMO_PASSWORD = "demo1234"
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ------------------ Fixtures ------------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def new_user(session):
    email = f"test_{uuid.uuid4().hex[:10]}@example.com"
    r = session.post(f"{BASE_URL}/api/auth/register",
                     json={"name": "Test User", "email": email, "password": "pass1234"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["token"], "headers": {"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"}}


# ------------------ Auth ------------------
class TestAuth:
    def test_login_demo(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and d["user"]["email"] == DEMO_EMAIL

    def test_login_invalid(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, session, demo_headers):
        r = session.get(f"{BASE_URL}/api/auth/me", headers=demo_headers)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL

    def test_me_unauthed(self, session):
        r = session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_register_duplicate(self, session):
        r = session.post(f"{BASE_URL}/api/auth/register",
                         json={"name": "x", "email": DEMO_EMAIL, "password": "any"})
        assert r.status_code == 400

    def test_register_new(self, new_user):
        assert new_user["token"]


# ------------------ Dashboard ------------------
class TestDashboard:
    def test_demo_dashboard(self, session, demo_headers):
        r = session.get(f"{BASE_URL}/api/dashboard/summary", headers=demo_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["net_worth_eur", "bot_profit_usd", "bot_profit_eur", "funds_value_eur",
                  "month_expenses_eur", "category_breakdown", "performance", "usd_to_eur"]:
            assert k in d
        assert d["funds_value_eur"] > 0  # seeded
        assert len(d["category_breakdown"]) == 5
        assert len(d["performance"]) > 0

    def test_new_user_dashboard_empty(self, session, new_user):
        r = session.get(f"{BASE_URL}/api/dashboard/summary", headers=new_user["headers"])
        assert r.status_code == 200
        d = r.json()
        assert d["net_worth_eur"] == 0
        assert d["funds_value_eur"] == 0
        assert d["bot_profit_usd"] == 0


# ------------------ Settings ------------------
class TestSettings:
    def test_get_settings(self, session, new_user):
        r = session.get(f"{BASE_URL}/api/settings", headers=new_user["headers"])
        assert r.status_code == 200
        assert r.json()["usd_to_eur"] == 0.92

    def test_update_settings(self, session, new_user):
        r = session.put(f"{BASE_URL}/api/settings", headers=new_user["headers"], json={"usd_to_eur": 0.95})
        assert r.status_code == 200
        assert r.json()["usd_to_eur"] == 0.95
        # verify persistence
        r2 = session.get(f"{BASE_URL}/api/settings", headers=new_user["headers"])
        assert r2.json()["usd_to_eur"] == 0.95

    def test_invalid_rate(self, session, new_user):
        r = session.put(f"{BASE_URL}/api/settings", headers=new_user["headers"], json={"usd_to_eur": -1})
        assert r.status_code == 400


# ------------------ Bot Returns ------------------
class TestBotReturns:
    def test_stats_seeded(self, session, demo_headers):
        r = session.get(f"{BASE_URL}/api/bot-returns/stats", headers=demo_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["count"] > 0
        assert "cumulative_usd" in d and "daily_avg_usd" in d

    def test_crud(self, session, new_user):
        # create
        r = session.post(f"{BASE_URL}/api/bot-returns", headers=new_user["headers"],
                         json={"date": TODAY, "amount_usd": 25.50, "note": "test"})
        assert r.status_code == 200
        item = r.json()
        assert item["amount_usd"] == 25.50
        item_id = item["id"]
        # list
        r = session.get(f"{BASE_URL}/api/bot-returns", headers=new_user["headers"])
        assert any(x["id"] == item_id for x in r.json())
        # update
        r = session.put(f"{BASE_URL}/api/bot-returns/{item_id}", headers=new_user["headers"],
                        json={"date": TODAY, "amount_usd": 30.0, "note": "u"})
        assert r.status_code == 200 and r.json()["amount_usd"] == 30.0
        # delete
        r = session.delete(f"{BASE_URL}/api/bot-returns/{item_id}", headers=new_user["headers"])
        assert r.status_code == 200
        # verify gone
        r = session.get(f"{BASE_URL}/api/bot-returns", headers=new_user["headers"])
        assert not any(x["id"] == item_id for x in r.json())


# ------------------ Funds ------------------
class TestFunds:
    def test_fund_lifecycle(self, session, new_user):
        h = new_user["headers"]
        # create
        r = session.post(f"{BASE_URL}/api/funds", headers=h, json={"name": "TEST Fund", "current_value_eur": 1000.0})
        assert r.status_code == 200
        fund = r.json()
        fid = fund["id"]
        assert fund["cumulative_return_pct"] == 0
        # contribution
        r = session.post(f"{BASE_URL}/api/funds/{fid}/contributions", headers=h,
                         json={"amount_eur": 500.0, "date": TODAY, "note": "c1"})
        assert r.status_code == 200
        f2 = r.json()
        assert f2["invested_eur"] == 500.0
        assert f2["cumulative_return_eur"] == 500.0  # 1000 - 500
        assert len(f2["contributions"]) == 1
        contrib_id = f2["contributions"][0]["id"]
        # delete contribution
        r = session.delete(f"{BASE_URL}/api/funds/{fid}/contributions/{contrib_id}", headers=h)
        assert r.status_code == 200
        assert len(r.json()["contributions"]) == 0
        # update fund value
        r = session.put(f"{BASE_URL}/api/funds/{fid}", headers=h,
                        json={"name": "TEST Fund Renamed", "current_value_eur": 1500.0})
        assert r.status_code == 200 and r.json()["current_value_eur"] == 1500.0
        # delete
        r = session.delete(f"{BASE_URL}/api/funds/{fid}", headers=h)
        assert r.status_code == 200
        r = session.get(f"{BASE_URL}/api/funds", headers=h)
        assert not any(x["id"] == fid for x in r.json())


# ------------------ Expenses ------------------
class TestExpenses:
    def test_expense_crud(self, session, new_user):
        h = new_user["headers"]
        # invalid category
        r = session.post(f"{BASE_URL}/api/expenses", headers=h,
                         json={"amount_eur": 10, "category": "Bogus", "date": TODAY})
        assert r.status_code == 400
        # valid create
        r = session.post(f"{BASE_URL}/api/expenses", headers=h,
                         json={"amount_eur": 42.5, "category": "Food", "date": TODAY, "description": "test"})
        assert r.status_code == 200
        exp = r.json()
        eid = exp["id"]
        assert exp["category"] == "Food"
        # list
        r = session.get(f"{BASE_URL}/api/expenses", headers=h)
        assert any(x["id"] == eid for x in r.json())
        # update valid
        r = session.put(f"{BASE_URL}/api/expenses/{eid}", headers=h,
                        json={"amount_eur": 50.0, "category": "Transport", "date": TODAY})
        assert r.status_code == 200 and r.json()["category"] == "Transport"
        # update invalid category
        r = session.put(f"{BASE_URL}/api/expenses/{eid}", headers=h,
                        json={"amount_eur": 50.0, "category": "Bad", "date": TODAY})
        assert r.status_code == 400
        # delete
        r = session.delete(f"{BASE_URL}/api/expenses/{eid}", headers=h)
        assert r.status_code == 200


# ------------------ Isolation ------------------
class TestIsolation:
    def test_user_data_isolation(self, session):
        # create two users
        users = []
        for _ in range(2):
            email = f"iso_{uuid.uuid4().hex[:8]}@example.com"
            r = session.post(f"{BASE_URL}/api/auth/register",
                             json={"name": "iso", "email": email, "password": "pass1234"})
            users.append({"h": {"Authorization": f"Bearer {r.json()['token']}"}})
        # user A creates data
        session.post(f"{BASE_URL}/api/expenses", headers=users[0]["h"],
                     json={"amount_eur": 99, "category": "Food", "date": TODAY})
        # user B sees none
        r = session.get(f"{BASE_URL}/api/expenses", headers=users[1]["h"])
        assert r.status_code == 200 and len(r.json()) == 0
