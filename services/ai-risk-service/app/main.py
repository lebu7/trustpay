from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List, Optional

app = FastAPI(title="ai-risk-service", version="1.0.0")

class RiskRequest(BaseModel):
    amount: float = Field(..., gt=0)
    currency: str = "KES"
    customer_id: Optional[int] = None
    payer_wallet: str
    attempts_last_10min: int = 0
    payments_last_24h: int = 0
    is_new_customer: bool = True
    hour_of_day: int = 12  # 0-23

class RiskResponse(BaseModel):
    risk_score: int
    risk_level: str
    reasons: List[str]

@app.get("/health")
def health():
    return {"status": "OK", "service": "ai-risk-service"}

@app.post("/risk", response_model=RiskResponse)
def risk_score(payload: RiskRequest):
    score = 0
    reasons = []

    # Simple scoring rules (explainable in SAD)
    if payload.amount >= 20000:
        score += 35
        reasons.append("High amount payment")
    elif payload.amount >= 5000:
        score += 15
        reasons.append("Medium amount payment")

    if payload.attempts_last_10min >= 3:
        score += 25
        reasons.append("Many attempts in last 10 minutes")

    if payload.payments_last_24h >= 5:
        score += 20
        reasons.append("High payment frequency (24h)")

    if payload.is_new_customer:
        score += 10
        reasons.append("New customer")

    # odd hours risk (late night)
    if payload.hour_of_day <= 5 or payload.hour_of_day >= 23:
        score += 10
        reasons.append("Unusual transaction hour")

    # clamp score
    score = max(0, min(100, score))

    if score >= 70:
        level = "HIGH"
    elif score >= 40:
        level = "MEDIUM"
    else:
        level = "LOW"

    if not reasons:
        reasons.append("Normal behavior")

    return RiskResponse(risk_score=score, risk_level=level, reasons=reasons)
