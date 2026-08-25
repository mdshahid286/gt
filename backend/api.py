"""
Thin API layer over pipeline.py -- exists purely so the frontend (a static
HTML/CSS/JS app, no build step) has an HTTP endpoint to call. Does NOT
reimplement any pipeline logic; evaluate_candidate() is untouched.

Run with:
    pip install fastapi uvicorn[standard]
    uvicorn backend.api:app --reload --port 8000

Then open frontend/index.html (or app.html) directly in a browser -- it calls
this API at http://localhost:8000.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict

from pipeline import evaluate_candidate
from data.sample_data import JOB_DESCRIPTION, RESUMES

app = FastAPI(title="Fair AI Recruitment System API")

# Wide open for local dev -- the frontend is static files opened directly
# (file:// or a simple static server), so the origin varies. Tighten this
# if you ever deploy this somewhere real.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class EvaluateRequest(BaseModel):
    resume_text: str
    job_description: str
    weights: Optional[Dict[str, float]] = None
    disagreement_points: Optional[Dict[str, float]] = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/samples")
def samples():
    """Lets the frontend populate its sample-resume dropdown without duplicating data."""
    return {"job_description": JOB_DESCRIPTION, "resumes": RESUMES}


@app.post("/evaluate")
def evaluate(req: EvaluateRequest):
    if not req.resume_text.strip() or not req.job_description.strip():
        raise HTTPException(status_code=400, detail="resume_text and job_description are both required")
    try:
        result = evaluate_candidate(
            req.resume_text,
            req.job_description,
            weights=req.weights,
            disagreement_points=req.disagreement_points,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))