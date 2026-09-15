from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict, BeforeValidator
from typing import List, Optional, Annotated
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import logging
import bcrypt
import jwt

# ---------------------------------------------------------------------------
# DB
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

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PyObjectId = Annotated[str, BeforeValidator(str)]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
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
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginInput(BaseModel):
    email: EmailStr
    password: str


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


class SettingsInput(BaseModel):
    usd_to_eur: float


CATEGORIES = ["Food", "Transport", "Leisure", "Housing", "Other"]


def serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc.pop("user_id", None)
    return doc


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(payload: RegisterInput):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "name": payload.name,
        "email": email,
        "password_hash": hash_password(payload.password),
        "usd_to_eur": 0.92,
        "created_at": now_iso(),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    token = create_access_token(uid, email)
    return {"token": token, "user": {"id": uid, "name": payload.name, "email": email, "usd_to_eur": 0.92}}


@api_router.post("/auth/login")
async def login(payload: LoginInput):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = str(user["_id"])
    token = create_access_token(uid, email)
    return {
        "token": token,
        "user": {"id": uid, "name": user.get("name"), "email": email, "usd_to_eur": user.get("usd_to_eur", 0.92)},
    }


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "name": user.get("name"), "email": user.get("email"), "usd_to_eur": user.get("usd_to_eur", 0.92)}


@api_router.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}


# ---------------------------------------------------------------------------
# Settings (exchange rate)
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
# Trading Bot returns (USD)
# ---------------------------------------------------------------------------
@api_router.get("/bot-returns")
async def list_bot_returns(user: dict = Depends(get_current_user)):
    docs = await db.bot_returns.find({"user_id": user["id"]}).sort("date", 1).to_list(2000)
    return [serialize(d) for d in docs]


@api_router.post("/bot-returns")
async def create_bot_return(payload: BotReturnInput, user: dict = Depends(get_current_user)):
    doc = {"user_id": user["id"], "date": payload.date, "amount_usd": payload.amount_usd,
           "note": payload.note or "", "created_at": now_iso()}
    res = await db.bot_returns.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.put("/bot-returns/{item_id}")
async def update_bot_return(item_id: str, payload: BotReturnInput, user: dict = Depends(get_current_user)):
    r = await db.bot_returns.update_one(
        {"_id": ObjectId(item_id), "user_id": user["id"]},
        {"$set": {"date": payload.date, "amount_usd": payload.amount_usd, "note": payload.note or ""}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    doc = await db.bot_returns.find_one({"_id": ObjectId(item_id)})
    return serialize(doc)


@api_router.delete("/bot-returns/{item_id}")
async def delete_bot_return(item_id: str, user: dict = Depends(get_current_user)):
    r = await db.bot_returns.delete_one({"_id": ObjectId(item_id), "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api_router.get("/bot-returns/stats")
async def bot_stats(user: dict = Depends(get_current_user)):
    docs = await db.bot_returns.find({"user_id": user["id"]}).sort("date", 1).to_list(2000)
    total = sum(d["amount_usd"] for d in docs)
    count = len(docs)
    daily_avg = total / count if count else 0.0
    monthly = {}
    for d in docs:
        key = d["date"][:7]
        monthly[key] = monthly.get(key, 0.0) + d["amount_usd"]
    monthly_list = [{"month": k, "amount_usd": round(v, 2)} for k, v in sorted(monthly.items())]
    this_month = datetime.now(timezone.utc).strftime("%Y-%m")
    monthly_return = round(monthly.get(this_month, 0.0), 2)
    return {
        "cumulative_usd": round(total, 2),
        "daily_avg_usd": round(daily_avg, 2),
        "monthly_return_usd": monthly_return,
        "monthly_avg_usd": round(daily_avg * 30, 2),
        "count": count,
        "monthly": monthly_list,
    }


# ---------------------------------------------------------------------------
# Funds (EUR)
# ---------------------------------------------------------------------------
async def _fund_payload(fund: dict) -> dict:
    contribs = await db.contributions.find({"fund_id": str(fund["_id"])}).sort("date", 1).to_list(1000)
    invested = sum(c["amount_eur"] for c in contribs)
    current = fund.get("current_value_eur", 0.0)
    cum_return = current - invested
    cum_return_pct = (cum_return / invested * 100) if invested else 0.0
    return {
        "id": str(fund["_id"]),
        "name": fund["name"],
        "current_value_eur": current,
        "invested_eur": round(invested, 2),
        "cumulative_return_eur": round(cum_return, 2),
        "cumulative_return_pct": round(cum_return_pct, 2),
        "contributions": [serialize(c) for c in contribs],
    }


@api_router.get("/funds")
async def list_funds(user: dict = Depends(get_current_user)):
    funds = await db.funds.find({"user_id": user["id"]}).sort("created_at", 1).to_list(500)
    return [await _fund_payload(f) for f in funds]


@api_router.post("/funds")
async def create_fund(payload: FundInput, user: dict = Depends(get_current_user)):
    doc = {"user_id": user["id"], "name": payload.name,
           "current_value_eur": payload.current_value_eur, "created_at": now_iso()}
    res = await db.funds.insert_one(doc)
    doc["_id"] = res.inserted_id
    return await _fund_payload(doc)


@api_router.put("/funds/{fund_id}")
async def update_fund(fund_id: str, payload: FundInput, user: dict = Depends(get_current_user)):
    r = await db.funds.update_one(
        {"_id": ObjectId(fund_id), "user_id": user["id"]},
        {"$set": {"name": payload.name, "current_value_eur": payload.current_value_eur}},
    )
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
    doc = {"user_id": user["id"], "fund_id": fund_id, "amount_eur": payload.amount_eur,
           "date": payload.date, "note": payload.note or "", "created_at": now_iso()}
    await db.contributions.insert_one(doc)
    doc2 = await db.funds.find_one({"_id": ObjectId(fund_id)})
    return await _fund_payload(doc2)


@api_router.delete("/funds/{fund_id}/contributions/{contrib_id}")
async def delete_contribution(fund_id: str, contrib_id: str, user: dict = Depends(get_current_user)):
    r = await db.contributions.delete_one({"_id": ObjectId(contrib_id), "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    doc2 = await db.funds.find_one({"_id": ObjectId(fund_id)})
    return await _fund_payload(doc2)


# ---------------------------------------------------------------------------
# Expenses (EUR)
# ---------------------------------------------------------------------------
@api_router.get("/expenses")
async def list_expenses(user: dict = Depends(get_current_user)):
    docs = await db.expenses.find({"user_id": user["id"]}).sort("date", -1).to_list(2000)
    return [serialize(d) for d in docs]


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
    r = await db.expenses.update_one(
        {"_id": ObjectId(item_id), "user_id": user["id"]},
        {"$set": {"amount_eur": payload.amount_eur, "category": payload.category,
                  "date": payload.date, "description": payload.description or ""}},
    )
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
# Dashboard summary
# ---------------------------------------------------------------------------
@api_router.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_current_user)):
    rate = user.get("usd_to_eur", 0.92)
    bot_docs = await db.bot_returns.find({"user_id": user["id"]}).sort("date", 1).to_list(2000)
    bot_total_usd = sum(d["amount_usd"] for d in bot_docs)
    bot_total_eur = bot_total_usd * rate

    funds = await db.funds.find({"user_id": user["id"]}).to_list(500)
    funds_value_eur = sum(f.get("current_value_eur", 0.0) for f in funds)

    expenses = await db.expenses.find({"user_id": user["id"]}).to_list(2000)
    this_month = datetime.now(timezone.utc).strftime("%Y-%m")
    month_expenses = sum(e["amount_eur"] for e in expenses if e["date"][:7] == this_month)
    total_expenses = sum(e["amount_eur"] for e in expenses)

    cat = {c: 0.0 for c in CATEGORIES}
    for e in expenses:
        if e["category"] in cat:
            cat[e["category"]] += e["amount_eur"]
    cat_breakdown = [{"category": k, "amount_eur": round(v, 2)} for k, v in cat.items()]

    perf = []
    cum = 0.0
    for d in bot_docs:
        cum += d["amount_usd"]
        perf.append({"date": d["date"], "value_eur": round(cum * rate, 2), "value_usd": round(cum, 2)})

    net_worth = funds_value_eur + bot_total_eur

    return {
        "usd_to_eur": rate,
        "net_worth_eur": round(net_worth, 2),
        "bot_profit_usd": round(bot_total_usd, 2),
        "bot_profit_eur": round(bot_total_eur, 2),
        "funds_value_eur": round(funds_value_eur, 2),
        "funds_count": len(funds),
        "month_expenses_eur": round(month_expenses, 2),
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
# Seeding
# ---------------------------------------------------------------------------
async def seed_demo():
    email = os.environ.get("ADMIN_EMAIL", "demo@fincontrol.app")
    password = os.environ.get("ADMIN_PASSWORD", "demo1234")
    existing = await db.users.find_one({"email": email})
    if existing:
        if not verify_password(password, existing.get("password_hash", "")):
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})
        return
    res = await db.users.insert_one({
        "name": "Alex Demo", "email": email, "password_hash": hash_password(password),
        "usd_to_eur": 0.92, "created_at": now_iso(),
    })
    uid = str(res.inserted_id)
    today = datetime.now(timezone.utc)

    import random
    random.seed(7)
    bot = []
    for i in range(45, 0, -1):
        d = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        amt = round(random.uniform(-18, 55), 2)
        bot.append({"user_id": uid, "date": d, "amount_usd": amt, "note": "", "created_at": now_iso()})
    await db.bot_returns.insert_many(bot)

    f1 = await db.funds.insert_one({"user_id": uid, "name": "S&P 500 ETF", "current_value_eur": 8420.0, "created_at": now_iso()})
    f2 = await db.funds.insert_one({"user_id": uid, "name": "Global Bonds", "current_value_eur": 3150.0, "created_at": now_iso()})
    contribs = []
    for m, amt in enumerate([500, 500, 750, 500, 600, 500]):
        d = (today - timedelta(days=(6 - m) * 30)).strftime("%Y-%m-%d")
        contribs.append({"user_id": uid, "fund_id": str(f1.inserted_id), "amount_eur": amt, "date": d, "note": "Monthly buy", "created_at": now_iso()})
    for m, amt in enumerate([500, 400, 500, 500, 300, 500]):
        d = (today - timedelta(days=(6 - m) * 30)).strftime("%Y-%m-%d")
        contribs.append({"user_id": uid, "fund_id": str(f2.inserted_id), "amount_eur": amt, "date": d, "note": "Monthly buy", "created_at": now_iso()})
    await db.contributions.insert_many(contribs)

    exp = []
    samples = [("Food", 32.5, "Groceries"), ("Transport", 18.0, "Metro pass"), ("Leisure", 45.0, "Cinema"),
               ("Housing", 780.0, "Rent"), ("Other", 25.0, "Subscription"), ("Food", 12.9, "Lunch"),
               ("Transport", 40.0, "Fuel"), ("Leisure", 60.0, "Dinner out"), ("Food", 55.2, "Groceries"),
               ("Other", 15.0, "Pharmacy")]
    for i, (c, a, desc) in enumerate(samples):
        d = (today - timedelta(days=i * 2)).strftime("%Y-%m-%d")
        exp.append({"user_id": uid, "amount_eur": a, "category": c, "date": d, "description": desc, "created_at": now_iso()})
    await db.expenses.insert_many(exp)
    logger.info("Seeded demo account")


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await seed_demo()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
