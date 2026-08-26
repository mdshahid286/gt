"""
API layer over pipeline.py, plus resume text extraction and static frontend
hosting. This is now the single entry point for the whole app -- it serves
both the API and the frontend from one origin, which avoids the file://
CORS/module-loading issues that made the earlier version render blank.

Run with:
    pip install -r requirements.txt
    uvicorn backend.api:app --reload --port 8000

Then open http://localhost:8000 in a browser (NOT by double-clicking the
HTML file directly -- that's what caused the blank page before).
"""

import io
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Dict

from pipeline import evaluate_candidate
from data.sample_data import JOB_DESCRIPTION, RESUMES

app = FastAPI(title="Fair AI Recruitment System API")

# Kept even though the frontend is now same-origin -- harmless, and covers
# anyone who serves the frontend separately during development.
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


@app.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    """
    Accepts an uploaded .pdf, .docx, or .txt resume and returns extracted
    plain text. Modular by design: this does NOT touch evaluate_candidate()
    or the agent pipeline at all -- it just gets text onto the page, the
    same way pasting text does. If extraction produces nothing usable
    (e.g. a scanned image PDF with no text layer), it fails loudly rather
    than silently sending an empty resume through the pipeline.
    """
    filename = (file.filename or "").lower()
    content = await file.read()

    try:
        if filename.endswith(".pdf"):
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        elif filename.endswith(".docx"):
            from docx import Document
            doc = Document(io.BytesIO(content))
            text = "\n".join(p.text for p in doc.paragraphs)
        elif filename.endswith(".txt"):
            text = content.decode("utf-8", errors="ignore")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type -- upload .pdf, .docx, or .txt")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read this file: {e}")

    text = text.strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail="No extractable text found -- if this is a scanned/image-only PDF, "
                   "paste the resume text manually instead.",
        )
    return {"text": text, "filename": file.filename}


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


# Static frontend hosting -- MUST be mounted last. FastAPI/Starlette checks
# routes in registration order, so /health, /samples, /extract-text, and
# /evaluate above all take precedence; anything else falls through to serving
# frontend/ as static files (html=True serves index.html at "/" automatically).
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")