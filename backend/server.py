from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import logging
import jwt
import random
import calendar

# ---------------------------------------------------------------------------
# DB / config
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

app = FastAPI(title="FinControl API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("fincontrol")

CATEGORIES = ["Food", "Transport", "Leisure", "Housing", "Other"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=30), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc.pop("user_id", None)
    return doc


def public_user(u: dict) -> dict:
    return {"id": u["id"], "name": u.get("name"), "usd_to_eur": u.get("usd_to_eur", 0.92)}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class ProfileInput(BaseModel):
    name: str


class SelectInput(BaseModel):
    user_id: str


class BotInput(BaseModel):
    name: str
    status: Optional[str] = "active"


class BotUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None


class BotReturnInput(BaseModel):
    date: str
    amount_usd: float
    note: Optional[str] = ""


class FundInput(BaseModel):
    name: str
    current_value_eur: float = 0.0


class ContributionInput(BaseModel):
    amount_eur: float
    date: str
    note: Optional[str] = ""


class ExpenseInput(BaseModel):
    amount_eur: float
    category: str
    date: str
    description: Optional[str] = ""


class IncomeInput(BaseModel):
    amount_eur: float
    date: str
    description: Optional[str] = ""


class RecurringIncomeInput(BaseModel):
    amount_eur: float
    day: int = 1
    description: Optional[str] = "Salary"


class RecurringIncomeUpdate(BaseModel):
    amount_eur: Optional[float] = None
    day: Optional[int] = None
    description: Optional[str] = None
    active: Optional[bool] = None


class RecurringExpenseInput(BaseModel):
    amount_eur: float
    category: str
    day: int = 1
    description: Optional[str] = ""


class RecurringExpenseUpdate(BaseModel):
    amount_eur: Optional[float] = None
    category: Optional[str] = None
    day: Optional[int] = None
    description: Optional[str] = None
    active: Optional[bool] = None


class SavingsInput(BaseModel):
    type: str  # deposit | withdrawal
    amount_eur: float
    date: str
    note: Optional[str] = ""
    goal_id: Optional[str] = None


class GoalInput(BaseModel):
    name: str
    target_eur: float


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_eur: Optional[float] = None


class SettingsInput(BaseModel):
    usd_to_eur: float


# ---------------------------------------------------------------------------
# Profiles / auth
# ---------------------------------------------------------------------------
@api_router.get("/profiles")
async def list_profiles():
    users = await db.users.find({}).sort("created_at", 1).to_list(200)
    return [{"id": str(u["_id"]), "name": u.get("name")} for u in users]


@api_router.post("/profiles")
async def create_profile(payload: ProfileInput):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    res = await db.users.insert_one({"name": name, "usd_to_eur": 0.92, "created_at": now_iso()})
    return {"id": str(res.inserted_id), "name": name}


@api_router.post("/auth/select")
async def select_profile(payload: SelectInput):
    user = await db.users.find_one({"_id": ObjectId(payload.user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Profile not found")
    uid = str(user["_id"])
    token = create_access_token(uid)
    return {"token": token, "user": {"id": uid, "name": user.get("name"), "usd_to_eur": user.get("usd_to_eur", 0.92)}}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@api_router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str):
    if await db.users.count_documents({}) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last profile")
    await db.users.delete_one({"_id": ObjectId(profile_id)})
    for coll in ["bots", "bot_returns", "funds", "contributions", "expenses", "income", "savings"]:
        await db[coll].delete_many({"user_id": profile_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    return {"usd_to_eur": user.get("usd_to_eur", 0.92)}


@api_router.put("/settings")
async def update_settings(payload: SettingsInput, user: dict = Depends(get_current_user)):
    if payload.usd_to_eur <= 0:
        raise HTTPException(status_code=400, detail="Rate must be positive")
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"usd_to_eur": payload.usd_to_eur}})
    return {"usd_to_eur": payload.usd_to_eur}


# ---------------------------------------------------------------------------
# Bots (fleet, USD)
# ---------------------------------------------------------------------------
def _bot_stats(returns: List[dict]) -> dict:
    total = sum(r["amount_usd"] for r in returns)
    count = len(returns)
    daily_avg = total / count if count else 0.0
    monthly = {}
    for r in returns:
        k = r["date"][:7]
        monthly[k] = monthly.get(k, 0.0) + r["amount_usd"]
    this_month = datetime.now(timezone.utc).strftime("%Y-%m")
    return {
        "cumulative_usd": round(total, 2),
        "daily_avg_usd": round(daily_avg, 2),
        "monthly_avg_usd": round(daily_avg * 30, 2),
        "this_month_usd": round(monthly.get(this_month, 0.0), 2),
        "count": count,
        "monthly": [{"month": k, "amount_usd": round(v, 2)} for k, v in sorted(monthly.items())],
    }


async def _get_bot(bot_id: str, uid: str) -> dict:
    bot = await db.bots.find_one({"_id": ObjectId(bot_id), "user_id": uid})
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot


@api_router.get("/bots")
async def list_bots(user: dict = Depends(get_current_user)):
    bots = await db.bots.find({"user_id": user["id"]}).sort("created_at", 1).to_list(200)
    out = []
    for b in bots:
        rets = await db.bot_returns.find({"bot_id": str(b["_id"])}).to_list(3000)
        out.append({"id": str(b["_id"]), "name": b["name"], "status": b.get("status", "active"), **_bot_stats(rets)})
    return out


@api_router.post("/bots")
async def create_bot(payload: BotInput, user: dict = Depends(get_current_user)):
    doc = {"user_id": user["id"], "name": payload.name.strip() or "New Bot",
           "status": payload.status or "active", "created_at": now_iso()}
    res = await db.bots.insert_one(doc)
    return {"id": str(res.inserted_id), "name": doc["name"], "status": doc["status"], **_bot_stats([])}


@api_router.put("/bots/{bot_id}")
async def update_bot(bot_id: str, payload: BotUpdate, user: dict = Depends(get_current_user)):
    await _get_bot(bot_id, user["id"])
    upd = {}
    if payload.name is not None:
        upd["name"] = payload.name.strip()
    if payload.status is not None:
        upd["status"] = payload.status
    if upd:
        await db.bots.update_one({"_id": ObjectId(bot_id)}, {"$set": upd})
    b = await _get_bot(bot_id, user["id"])
    rets = await db.bot_returns.find({"bot_id": bot_id}).to_list(3000)
    return {"id": bot_id, "name": b["name"], "status": b.get("status", "active"), **_bot_stats(rets)}


@api_router.delete("/bots/{bot_id}")
async def delete_bot(bot_id: str, user: dict = Depends(get_current_user)):
    await _get_bot(bot_id, user["id"])
    await db.bots.delete_one({"_id": ObjectId(bot_id)})
    await db.bot_returns.delete_many({"bot_id": bot_id})
    return {"ok": True}


@api_router.get("/bots/overview")
async def bots_overview(user: dict = Depends(get_current_user)):
    rate = user.get("usd_to_eur", 0.92)
    bots = await db.bots.find({"user_id": user["id"]}).sort("created_at", 1).to_list(200)
    all_returns = await db.bot_returns.find({"user_id": user["id"]}).sort("date", 1).to_list(5000)
    stats = _bot_stats(all_returns)
    # combined cumulative series by date
    by_date = {}
    for r in all_returns:
        by_date[r["date"]] = by_date.get(r["date"], 0.0) + r["amount_usd"]
    series = []
    cum = 0.0
    for d in sorted(by_date.keys()):
        cum += by_date[d]
        series.append({"date": d, "cumulative_usd": round(cum, 2), "cumulative_eur": round(cum * rate, 2)})
    bot_summaries = []
    active = 0
    for b in bots:
        rets = await db.bot_returns.find({"bot_id": str(b["_id"])}).to_list(3000)
        st = _bot_stats(rets)
        if b.get("status", "active") == "active":
            active += 1
        bot_summaries.append({"id": str(b["_id"]), "name": b["name"], "status": b.get("status", "active"),
                              "cumulative_usd": st["cumulative_usd"], "daily_avg_usd": st["daily_avg_usd"],
                              "this_month_usd": st["this_month_usd"], "count": st["count"]})

    # compare: per-bot cumulative (carry-forward) across the union of all dates
    all_dates = sorted({r["date"] for r in all_returns})
    bot_daily = {}
    for b in bots:
        bid = str(b["_id"])
        d_map = {}
        for r in all_returns:
            if r["bot_id"] == bid:
                d_map[r["date"]] = d_map.get(r["date"], 0.0) + r["amount_usd"]
        bot_daily[bid] = d_map
    compare = []
    running = {str(b["_id"]): 0.0 for b in bots}
    for d in all_dates:
        row = {"date": d}
        for b in bots:
            bid = str(b["_id"])
            running[bid] += bot_daily[bid].get(d, 0.0)
            row[bid] = round(running[bid], 2)
        compare.append(row)

    return {
        "usd_to_eur": rate,
        "total_cumulative_usd": stats["cumulative_usd"],
        "total_cumulative_eur": round(stats["cumulative_usd"] * rate, 2),
        "total_daily_avg_usd": stats["daily_avg_usd"],
        "this_month_usd": stats["this_month_usd"],
        "bot_count": len(bots),
        "active_count": active,
        "paused_count": len(bots) - active,
        "series": series,
        "compare": compare,
        "bots": bot_summaries,
    }


@api_router.get("/bots/{bot_id}")
async def bot_detail(bot_id: str, user: dict = Depends(get_current_user)):
    b = await _get_bot(bot_id, user["id"])
    rets = await db.bot_returns.find({"bot_id": bot_id}).sort("date", 1).to_list(3000)
    series = []
    cum = 0.0
    for r in rets:
        cum += r["amount_usd"]
        series.append({"date": r["date"], "cumulative_usd": round(cum, 2)})
    return {
        "id": bot_id, "name": b["name"], "status": b.get("status", "active"),
        "stats": _bot_stats(rets),
        "series": series,
        "returns": [serialize(r) for r in rets],
    }


@api_router.post("/bots/{bot_id}/returns")
async def add_bot_return(bot_id: str, payload: BotReturnInput, user: dict = Depends(get_current_user)):
    await _get_bot(bot_id, user["id"])
    doc = {"user_id": user["id"], "bot_id": bot_id, "date": payload.date,
           "amount_usd": payload.amount_usd, "note": payload.note or "", "created_at": now_iso()}
    res = await db.bot_returns.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.put("/bots/{bot_id}/returns/{ret_id}")
async def update_bot_return(bot_id: str, ret_id: str, payload: BotReturnInput, user: dict = Depends(get_current_user)):
    r = await db.bot_returns.update_one(
        {"_id": ObjectId(ret_id), "user_id": user["id"], "bot_id": bot_id},
        {"$set": {"date": payload.date, "amount_usd": payload.amount_usd, "note": payload.note or ""}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    doc = await db.bot_returns.find_one({"_id": ObjectId(ret_id)})
    return serialize(doc)


@api_router.delete("/bots/{bot_id}/returns/{ret_id}")
async def delete_bot_return(bot_id: str, ret_id: str, user: dict = Depends(get_current_user)):
    r = await db.bot_returns.delete_one({"_id": ObjectId(ret_id), "user_id": user["id"], "bot_id": bot_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Funds (EUR)
# ---------------------------------------------------------------------------
async def _fund_payload(fund: dict) -> dict:
    contribs = await db.contributions.find({"fund_id": str(fund["_id"])}).sort("date", 1).to_list(1000)
    invested = sum(c["amount_eur"] for c in contribs)
    current = fund.get("current_value_eur", 0.0)
    cum_return = current - invested
    return {
        "id": str(fund["_id"]), "name": fund["name"], "current_value_eur": current,
        "invested_eur": round(invested, 2), "cumulative_return_eur": round(cum_return, 2),
        "cumulative_return_pct": round((cum_return / invested * 100) if invested else 0.0, 2),
        "contributions": [serialize(c) for c in contribs],
    }


@api_router.get("/funds")
async def list_funds(user: dict = Depends(get_current_user)):
    funds = await db.funds.find({"user_id": user["id"]}).sort("created_at", 1).to_list(500)
    return [await _fund_payload(f) for f in funds]


@api_router.post("/funds")
async def create_fund(payload: FundInput, user: dict = Depends(get_current_user)):
    doc = {"user_id": user["id"], "name": payload.name, "current_value_eur": payload.current_value_eur, "created_at": now_iso()}
    res = await db.funds.insert_one(doc)
    doc["_id"] = res.inserted_id
    return await _fund_payload(doc)


@api_router.put("/funds/{fund_id}")
async def update_fund(fund_id: str, payload: FundInput, user: dict = Depends(get_current_user)):
    r = await db.funds.update_one({"_id": ObjectId(fund_id), "user_id": user["id"]},
                                  {"$set": {"name": payload.name, "current_value_eur": payload.current_value_eur}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    doc = await db.funds.find_one({"_id": ObjectId(fund_id)})
    return await _fund_payload(doc)


@api_router.delete("/funds/{fund_id}")
async def delete_fund(fund_id: str, user: dict = Depends(get_current_user)):
    r = await db.funds.delete_one({"_id": ObjectId(fund_id), "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await db.contributions.delete_many({"fund_id": fund_id})
    return {"ok": True}


@api_router.post("/funds/{fund_id}/contributions")
async def add_contribution(fund_id: str, payload: ContributionInput, user: dict = Depends(get_current_user)):
    fund = await db.funds.find_one({"_id": ObjectId(fund_id), "user_id": user["id"]})
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")
    await db.contributions.insert_one({"user_id": user["id"], "fund_id": fund_id, "amount_eur": payload.amount_eur,
                                       "date": payload.date, "note": payload.note or "", "created_at": now_iso()})
    return await _fund_payload(await db.funds.find_one({"_id": ObjectId(fund_id)}))


@api_router.delete("/funds/{fund_id}/contributions/{contrib_id}")
async def delete_contribution(fund_id: str, contrib_id: str, user: dict = Depends(get_current_user)):
    r = await db.contributions.delete_one({"_id": ObjectId(contrib_id), "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return await _fund_payload(await db.funds.find_one({"_id": ObjectId(fund_id)}))


# ---------------------------------------------------------------------------
# Savings (EUR)
# ---------------------------------------------------------------------------
@api_router.get("/savings")
async def get_savings(user: dict = Depends(get_current_user)):
    txs = await db.savings.find({"user_id": user["id"], "goal_id": None}).sort("date", 1).to_list(3000)
    deposits = sum(t["amount_eur"] for t in txs if t["type"] == "deposit")
    withdrawals = sum(t["amount_eur"] for t in txs if t["type"] == "withdrawal")
    history = []
    bal = 0.0
    for t in txs:
        bal += t["amount_eur"] if t["type"] == "deposit" else -t["amount_eur"]
        history.append({"date": t["date"], "balance": round(bal, 2)})
    txs_sorted = sorted(txs, key=lambda t: t["date"], reverse=True)
    return {
        "balance_eur": round(deposits - withdrawals, 2),
        "total_deposits_eur": round(deposits, 2),
        "total_withdrawals_eur": round(withdrawals, 2),
        "history": history,
        "transactions": [serialize(t) for t in txs_sorted],
    }


async def _goals_payload(uid: str):
    goals = await db.savings_goals.find({"user_id": uid}).sort("created_at", 1).to_list(100)
    out = []
    for g in goals:
        gid = str(g["_id"])
        txs = await db.savings.find({"user_id": uid, "goal_id": gid}).to_list(3000)
        saved = sum(t["amount_eur"] if t["type"] == "deposit" else -t["amount_eur"] for t in txs)
        target = g.get("target_eur", 0.0)
        out.append({
            "id": gid, "name": g["name"], "target_eur": target,
            "saved_eur": round(saved, 2),
            "progress_pct": round((saved / target * 100) if target else 0.0, 1),
        })
    return out


@api_router.get("/savings/goals")
async def list_goals(user: dict = Depends(get_current_user)):
    return await _goals_payload(user["id"])


@api_router.post("/savings/goals")
async def create_goal(payload: GoalInput, user: dict = Depends(get_current_user)):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    await db.savings_goals.insert_one({"user_id": user["id"], "name": payload.name.strip(),
                                       "target_eur": max(0.0, payload.target_eur), "created_at": now_iso()})
    return await _goals_payload(user["id"])


@api_router.put("/savings/goals/{goal_id}")
async def update_goal(goal_id: str, payload: GoalUpdate, user: dict = Depends(get_current_user)):
    upd = {}
    if payload.name is not None:
        upd["name"] = payload.name.strip()
    if payload.target_eur is not None:
        upd["target_eur"] = max(0.0, payload.target_eur)
    r = await db.savings_goals.update_one({"_id": ObjectId(goal_id), "user_id": user["id"]}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return await _goals_payload(user["id"])


@api_router.delete("/savings/goals/{goal_id}")
async def delete_goal(goal_id: str, user: dict = Depends(get_current_user)):
    r = await db.savings_goals.delete_one({"_id": ObjectId(goal_id), "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await db.savings.delete_many({"user_id": user["id"], "goal_id": goal_id})
    return await _goals_payload(user["id"])


@api_router.post("/savings")
async def add_savings(payload: SavingsInput, user: dict = Depends(get_current_user)):
    if payload.type not in ("deposit", "withdrawal"):
        raise HTTPException(status_code=400, detail="Invalid type")
    await db.savings.insert_one({"user_id": user["id"], "type": payload.type, "amount_eur": abs(payload.amount_eur),
                                 "date": payload.date, "note": payload.note or "",
                                 "goal_id": payload.goal_id, "created_at": now_iso()})
    if payload.goal_id:
        return {"goals": await _goals_payload(user["id"])}
    return await get_savings(user)


@api_router.delete("/savings/{tx_id}")
async def delete_savings(tx_id: str, user: dict = Depends(get_current_user)):
    r = await db.savings.delete_one({"_id": ObjectId(tx_id), "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return await get_savings(user)


# ---------------------------------------------------------------------------
# Income (EUR)
# ---------------------------------------------------------------------------
@api_router.get("/income")
async def list_income(user: dict = Depends(get_current_user)):
    await _materialize_recurring(user["id"])
    docs = await db.income.find({"user_id": user["id"]}).sort("date", -1).to_list(3000)
    this_month = datetime.now(timezone.utc).strftime("%Y-%m")
    month_total = sum(d["amount_eur"] for d in docs if d["date"][:7] == this_month)
    total = sum(d["amount_eur"] for d in docs)
    return {"month_total_eur": round(month_total, 2), "total_eur": round(total, 2), "items": [serialize(d) for d in docs]}


def _month_iter(start_ym: str, end_ym: str):
    y, m = int(start_ym[:4]), int(start_ym[5:7])
    ey, em = int(end_ym[:4]), int(end_ym[5:7])
    while (y, m) <= (ey, em):
        yield f"{y:04d}-{m:02d}"
        m += 1
        if m > 12:
            m = 1
            y += 1


async def _materialize_recurring(uid: str):
    templates = await db.recurring_income.find({"user_id": uid, "active": True}).to_list(100)
    if not templates:
        return
    current_ym = datetime.now(timezone.utc).strftime("%Y-%m")
    for t in templates:
        start_ym = t.get("start_month", current_ym)
        day = max(1, min(int(t.get("day", 1)), 28))
        for ym in _month_iter(start_ym, current_ym):
            exists = await db.income.find_one({"user_id": uid, "recurring_id": str(t["_id"]), "month": ym})
            if exists:
                continue
            last_day = calendar.monthrange(int(ym[:4]), int(ym[5:7]))[1]
            d = f"{ym}-{min(day, last_day):02d}"
            await db.income.insert_one({
                "user_id": uid, "amount_eur": t["amount_eur"], "date": d,
                "description": t.get("description", "Salary"), "recurring_id": str(t["_id"]),
                "month": ym, "created_at": now_iso(),
            })


@api_router.get("/income/recurring")
async def list_recurring(user: dict = Depends(get_current_user)):
    docs = await db.recurring_income.find({"user_id": user["id"]}).sort("created_at", 1).to_list(100)
    return [{"id": str(d["_id"]), "amount_eur": d["amount_eur"], "day": d.get("day", 1),
             "description": d.get("description", "Salary"), "active": d.get("active", True),
             "start_month": d.get("start_month")} for d in docs]


@api_router.post("/income/recurring")
async def create_recurring(payload: RecurringIncomeInput, user: dict = Depends(get_current_user)):
    doc = {"user_id": user["id"], "amount_eur": payload.amount_eur,
           "day": max(1, min(payload.day, 28)), "description": payload.description or "Salary",
           "active": True, "start_month": datetime.now(timezone.utc).strftime("%Y-%m"), "created_at": now_iso()}
    await db.recurring_income.insert_one(doc)
    await _materialize_recurring(user["id"])
    return await list_recurring(user)


@api_router.put("/income/recurring/{rec_id}")
async def update_recurring(rec_id: str, payload: RecurringIncomeUpdate, user: dict = Depends(get_current_user)):
    upd = {}
    if payload.amount_eur is not None:
        upd["amount_eur"] = payload.amount_eur
    if payload.day is not None:
        upd["day"] = max(1, min(payload.day, 28))
    if payload.description is not None:
        upd["description"] = payload.description
    if payload.active is not None:
        upd["active"] = payload.active
    r = await db.recurring_income.update_one({"_id": ObjectId(rec_id), "user_id": user["id"]}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    # keep already-generated entries in sync with the new amount/description
    if "amount_eur" in upd or "description" in upd:
        sync = {k: upd[k] for k in ("amount_eur", "description") if k in upd}
        await db.income.update_many({"user_id": user["id"], "recurring_id": rec_id}, {"$set": sync})
    await _materialize_recurring(user["id"])
    return await list_recurring(user)


@api_router.delete("/income/recurring/{rec_id}")
async def delete_recurring(rec_id: str, user: dict = Depends(get_current_user)):
    r = await db.recurring_income.delete_one({"_id": ObjectId(rec_id), "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    # remove auto-generated entries for this template
    await db.income.delete_many({"user_id": user["id"], "recurring_id": rec_id})
    return await list_recurring(user)


@api_router.post("/income")
async def create_income(payload: IncomeInput, user: dict = Depends(get_current_user)):
    await db.income.insert_one({"user_id": user["id"], "amount_eur": payload.amount_eur, "date": payload.date,
                                "description": payload.description or "", "created_at": now_iso()})
    return await list_income(user)


@api_router.put("/income/{item_id}")
async def update_income(item_id: str, payload: IncomeInput, user: dict = Depends(get_current_user)):
    r = await db.income.update_one({"_id": ObjectId(item_id), "user_id": user["id"]},
                                   {"$set": {"amount_eur": payload.amount_eur, "date": payload.date,
                                             "description": payload.description or ""}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return await list_income(user)


@api_router.delete("/income/{item_id}")
async def delete_income(item_id: str, user: dict = Depends(get_current_user)):
    r = await db.income.delete_one({"_id": ObjectId(item_id), "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return await list_income(user)


# ---------------------------------------------------------------------------
# Expenses (EUR)
# ---------------------------------------------------------------------------
@api_router.get("/expenses")
async def list_expenses(user: dict = Depends(get_current_user)):
    await _materialize_recurring_expenses(user["id"])
    docs = await db.expenses.find({"user_id": user["id"]}).sort("date", -1).to_list(3000)
    return [serialize(d) for d in docs]


async def _materialize_recurring_expenses(uid: str):
    templates = await db.recurring_expense.find({"user_id": uid, "active": True}).to_list(100)
    if not templates:
        return
    current_ym = datetime.now(timezone.utc).strftime("%Y-%m")
    for t in templates:
        start_ym = t.get("start_month", current_ym)
        day = max(1, min(int(t.get("day", 1)), 28))
        for ym in _month_iter(start_ym, current_ym):
            exists = await db.expenses.find_one({"user_id": uid, "recurring_id": str(t["_id"]), "month": ym})
            if exists:
                continue
            last_day = calendar.monthrange(int(ym[:4]), int(ym[5:7]))[1]
            d = f"{ym}-{min(day, last_day):02d}"
            await db.expenses.insert_one({
                "user_id": uid, "amount_eur": t["amount_eur"], "category": t.get("category", "Other"),
                "date": d, "description": t.get("description", ""), "recurring_id": str(t["_id"]),
                "month": ym, "created_at": now_iso(),
            })


@api_router.get("/expenses/recurring")
async def list_recurring_expenses(user: dict = Depends(get_current_user)):
    docs = await db.recurring_expense.find({"user_id": user["id"]}).sort("created_at", 1).to_list(100)
    return [{"id": str(d["_id"]), "amount_eur": d["amount_eur"], "category": d.get("category", "Other"),
             "day": d.get("day", 1), "description": d.get("description", ""), "active": d.get("active", True)} for d in docs]


@api_router.post("/expenses/recurring")
async def create_recurring_expense(payload: RecurringExpenseInput, user: dict = Depends(get_current_user)):
    if payload.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    await db.recurring_expense.insert_one({"user_id": user["id"], "amount_eur": payload.amount_eur,
                                           "category": payload.category, "day": max(1, min(payload.day, 28)),
                                           "description": payload.description or "", "active": True,
                                           "start_month": datetime.now(timezone.utc).strftime("%Y-%m"), "created_at": now_iso()})
    await _materialize_recurring_expenses(user["id"])
    return await list_recurring_expenses(user)


@api_router.put("/expenses/recurring/{rec_id}")
async def update_recurring_expense(rec_id: str, payload: RecurringExpenseUpdate, user: dict = Depends(get_current_user)):
    upd = {}
    if payload.amount_eur is not None:
        upd["amount_eur"] = payload.amount_eur
    if payload.category is not None:
        if payload.category not in CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")
        upd["category"] = payload.category
    if payload.day is not None:
        upd["day"] = max(1, min(payload.day, 28))
    if payload.description is not None:
        upd["description"] = payload.description
    if payload.active is not None:
        upd["active"] = payload.active
    r = await db.recurring_expense.update_one({"_id": ObjectId(rec_id), "user_id": user["id"]}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    sync = {k: upd[k] for k in ("amount_eur", "category", "description") if k in upd}
    if sync:
        await db.expenses.update_many({"user_id": user["id"], "recurring_id": rec_id}, {"$set": sync})
    await _materialize_recurring_expenses(user["id"])
    return await list_recurring_expenses(user)


@api_router.delete("/expenses/recurring/{rec_id}")
async def delete_recurring_expense(rec_id: str, user: dict = Depends(get_current_user)):
    r = await db.recurring_expense.delete_one({"_id": ObjectId(rec_id), "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await db.expenses.delete_many({"user_id": user["id"], "recurring_id": rec_id})
    return await list_recurring_expenses(user)


@api_router.post("/expenses")
async def create_expense(payload: ExpenseInput, user: dict = Depends(get_current_user)):
    if payload.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    doc = {"user_id": user["id"], "amount_eur": payload.amount_eur, "category": payload.category,
           "date": payload.date, "description": payload.description or "", "created_at": now_iso()}
    res = await db.expenses.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.put("/expenses/{item_id}")
async def update_expense(item_id: str, payload: ExpenseInput, user: dict = Depends(get_current_user)):
    if payload.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    r = await db.expenses.update_one({"_id": ObjectId(item_id), "user_id": user["id"]},
                                     {"$set": {"amount_eur": payload.amount_eur, "category": payload.category,
                                               "date": payload.date, "description": payload.description or ""}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    doc = await db.expenses.find_one({"_id": ObjectId(item_id)})
    return serialize(doc)


@api_router.delete("/expenses/{item_id}")
async def delete_expense(item_id: str, user: dict = Depends(get_current_user)):
    r = await db.expenses.delete_one({"_id": ObjectId(item_id), "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@api_router.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_current_user)):
    rate = user.get("usd_to_eur", 0.92)
    uid = user["id"]
    this_month = datetime.now(timezone.utc).strftime("%Y-%m")

    bot_docs = await db.bot_returns.find({"user_id": uid}).sort("date", 1).to_list(5000)
    bot_total_usd = sum(d["amount_usd"] for d in bot_docs)
    bot_total_eur = bot_total_usd * rate
    bot_count = await db.bots.count_documents({"user_id": uid})

    funds = await db.funds.find({"user_id": uid}).to_list(500)
    funds_value_eur = sum(f.get("current_value_eur", 0.0) for f in funds)

    sav = await db.savings.find({"user_id": uid}).to_list(3000)
    savings_balance = sum(t["amount_eur"] if t["type"] == "deposit" else -t["amount_eur"] for t in sav)

    expenses = await db.expenses.find({"user_id": uid}).to_list(3000)
    month_expenses = sum(e["amount_eur"] for e in expenses if e["date"][:7] == this_month)
    total_expenses = sum(e["amount_eur"] for e in expenses)

    income = await db.income.find({"user_id": uid}).to_list(3000)
    month_income = sum(i["amount_eur"] for i in income if i["date"][:7] == this_month)

    cat = {c: 0.0 for c in CATEGORIES}
    for e in expenses:
        if e["category"] in cat:
            cat[e["category"]] += e["amount_eur"]
    cat_breakdown = [{"category": k, "amount_eur": round(v, 2)} for k, v in cat.items()]

    # combined bot equity by date (EUR)
    by_date = {}
    for r in bot_docs:
        by_date[r["date"]] = by_date.get(r["date"], 0.0) + r["amount_usd"]
    perf = []
    cum = 0.0
    for d in sorted(by_date.keys()):
        cum += by_date[d]
        perf.append({"date": d, "value_eur": round(cum * rate, 2)})

    net_worth = funds_value_eur + savings_balance + bot_total_eur

    return {
        "usd_to_eur": rate,
        "net_worth_eur": round(net_worth, 2),
        "bot_profit_usd": round(bot_total_usd, 2),
        "bot_profit_eur": round(bot_total_eur, 2),
        "bot_count": bot_count,
        "funds_value_eur": round(funds_value_eur, 2),
        "funds_count": len(funds),
        "savings_balance_eur": round(savings_balance, 2),
        "month_income_eur": round(month_income, 2),
        "month_expenses_eur": round(month_expenses, 2),
        "month_net_eur": round(month_income - month_expenses, 2),
        "total_expenses_eur": round(total_expenses, 2),
        "category_breakdown": cat_breakdown,
        "performance": perf,
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Bootstrap: migrate + seed demo
# ---------------------------------------------------------------------------
def _gen_returns(uid, bot_id, days, lo, hi, seed):
    random.seed(seed)
    today = datetime.now(timezone.utc)
    out = []
    for i in range(days, 0, -1):
        d = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        out.append({"user_id": uid, "bot_id": bot_id, "date": d,
                    "amount_usd": round(random.uniform(lo, hi), 2), "note": "", "created_at": now_iso()})
    return out


async def _migrate_orphan_returns():
    users = await db.users.find({}).to_list(500)
    for u in users:
        uid = str(u["_id"])
        orphan = await db.bot_returns.count_documents({"user_id": uid, "bot_id": {"$exists": False}})
        if orphan:
            res = await db.bots.insert_one({"user_id": uid, "name": "Main Bot", "status": "active", "created_at": now_iso()})
            await db.bot_returns.update_many({"user_id": uid, "bot_id": {"$exists": False}},
                                             {"$set": {"bot_id": str(res.inserted_id)}})


async def bootstrap():
    await db.users.create_index("created_at")
    email_name = "Alex Demo"
    demo = await db.users.find_one({"name": email_name})
    today = datetime.now(timezone.utc)

    if not demo:
        res = await db.users.insert_one({"name": email_name, "usd_to_eur": 0.92, "created_at": now_iso()})
        uid = str(res.inserted_id)
        # funds
        f1 = await db.funds.insert_one({"user_id": uid, "name": "S&P 500 ETF", "current_value_eur": 8420.0, "created_at": now_iso()})
        f2 = await db.funds.insert_one({"user_id": uid, "name": "Global Bonds", "current_value_eur": 3150.0, "created_at": now_iso()})
        contribs = []
        for m, amt in enumerate([500, 500, 750, 500, 600, 500]):
            contribs.append({"user_id": uid, "fund_id": str(f1.inserted_id), "amount_eur": amt,
                             "date": (today - timedelta(days=(6 - m) * 30)).strftime("%Y-%m-%d"), "note": "Monthly buy", "created_at": now_iso()})
        for m, amt in enumerate([500, 400, 500, 500, 300, 500]):
            contribs.append({"user_id": uid, "fund_id": str(f2.inserted_id), "amount_eur": amt,
                             "date": (today - timedelta(days=(6 - m) * 30)).strftime("%Y-%m-%d"), "note": "Monthly buy", "created_at": now_iso()})
        await db.contributions.insert_many(contribs)
        # expenses
        exp = []
        samples = [("Food", 32.5, "Groceries"), ("Transport", 18.0, "Metro pass"), ("Leisure", 45.0, "Cinema"),
                   ("Housing", 780.0, "Rent"), ("Other", 25.0, "Subscription"), ("Food", 12.9, "Lunch"),
                   ("Transport", 40.0, "Fuel"), ("Leisure", 60.0, "Dinner out"), ("Food", 55.2, "Groceries"), ("Other", 15.0, "Pharmacy")]
        for i, (c, a, desc) in enumerate(samples):
            exp.append({"user_id": uid, "amount_eur": a, "category": c, "date": (today - timedelta(days=i * 2)).strftime("%Y-%m-%d"),
                        "description": desc, "created_at": now_iso()})
        await db.expenses.insert_many(exp)
    else:
        uid = str(demo["_id"])

    # ensure fleet of bots for demo
    if await db.bots.count_documents({"user_id": uid}) == 0:
        b1 = await db.bots.insert_one({"user_id": uid, "name": "Alpha Momentum", "status": "active", "created_at": now_iso()})
        await db.bot_returns.insert_many(_gen_returns(uid, str(b1.inserted_id), 45, -18, 55, 7))
    if await db.bots.count_documents({"user_id": uid}) < 3:
        b2 = await db.bots.insert_one({"user_id": uid, "name": "Grid EUR/USD", "status": "active", "created_at": now_iso()})
        await db.bot_returns.insert_many(_gen_returns(uid, str(b2.inserted_id), 40, -10, 35, 21))
        b3 = await db.bots.insert_one({"user_id": uid, "name": "Scalper v2", "status": "paused", "created_at": now_iso()})
        await db.bot_returns.insert_many(_gen_returns(uid, str(b3.inserted_id), 22, -25, 40, 42))

    # income
    if await db.income.count_documents({"user_id": uid}) == 0:
        inc = []
        for m in range(3):
            inc.append({"user_id": uid, "amount_eur": 2500.0, "date": (today - timedelta(days=m * 30)).strftime("%Y-%m-%d"),
                        "description": "Salary", "created_at": now_iso()})
        inc.append({"user_id": uid, "amount_eur": 400.0, "date": (today - timedelta(days=10)).strftime("%Y-%m-%d"),
                    "description": "Freelance project", "created_at": now_iso()})
        await db.income.insert_many(inc)

    # savings
    if await db.savings.count_documents({"user_id": uid}) == 0:
        sv = []
        for m, amt in enumerate([600, 600, 800, 500, 700, 600]):
            sv.append({"user_id": uid, "type": "deposit", "amount_eur": amt,
                       "date": (today - timedelta(days=(6 - m) * 30)).strftime("%Y-%m-%d"), "note": "Monthly saving", "created_at": now_iso()})
        sv.append({"user_id": uid, "type": "withdrawal", "amount_eur": 400.0,
                   "date": (today - timedelta(days=20)).strftime("%Y-%m-%d"), "note": "Emergency repair", "created_at": now_iso()})
        await db.savings.insert_many(sv)


@app.on_event("startup")
async def startup():
    await _migrate_orphan_returns()
    await bootstrap()
    logger.info("FinControl bootstrap complete")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
