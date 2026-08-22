# Fair AI Recruitment System Using Cooperative Game Theory

Multi-agent resume screening where candidate evaluation is treated as a cooperative
game (Nash Bargaining + Shapley value) rather than a single model producing one score.

Read `docs/Fair_AI_Recruitment_Project_Plan.md` first if you're new to the project --
it has the full formal model, objectives, and timeline. This README is just setup +
folder guide.

## Folder structure

```
fair_hiring_project/
├── contract.py              # Canonical interface contract every agent must satisfy
├── pipeline.py               # End-to-end integration: resume in -> decision + explanation out
├── requirements.txt
├── .env.example
│
├── agents/                   # Person A owns skills/experience; Person B owns education/fairness
│   ├── base_agent.py         # Shared LLM-call + validation + retry logic
│   ├── skills_agent.py
│   ├── experience_agent.py
│   ├── education_agent.py
│   └── fairness_agent.py
│
├── engine/                    # Person C owns this -- pure code, zero LLM calls
│   ├── nash_bargaining.py    # Aggregation: utilities -> hire/reject
│   └── shapley.py            # Offline weight calibration + per-decision explanation
│
├── baseline/                  # Person D owns this
│   └── baseline_model.py     # Single-model comparison point (no agents, no game theory)
│
├── evaluation/                 # Person D owns this
│   └── evaluate.py           # Precision/recall + counterfactual decision-flip rate
│
├── data/
│   └── sample_data.py        # Synthetic test resumes + placeholder weights/disagreement points
│
├── tests/
│   ├── test_engine.py        # No API key needed -- pure math, run this first
│   └── test_agents.py        # Needs API key -- calls real agents against sample resumes
│
└── docs/                      # Planning documents -- also upload these to Claude Projects
    ├── Fair_AI_Recruitment_Project_Plan.md
    ├── Team_Task_Assignment.md
    └── Claude_Project_Context.md
```

## Setup

Agents run against **Gemini or Groq**, chosen via the `LLM_PROVIDER` environment
variable. Both expose OpenAI-compatible endpoints, so the code uses the `openai`
SDK for either -- only `base_url`, API key, and model name differ (see
`PROVIDER_CONFIGS` in `agents/base_agent.py`).

Note: Groq (fast LPU inference, hosts open models like Llama) is a different
company from Grok (xAI) -- don't mix up the API keys or base URLs.

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then fill in your real key(s) and pick a provider
```

Edit `.env`:
```
LLM_PROVIDER=gemini             # or "groq"
GOOGLE_API_KEY=...              # if using gemini
GROQ_API_KEY=...                # if using groq
```

Then load it into your shell (or use a `.env` loader like `python-dotenv`):
```bash
export $(grep -v '^#' .env | xargs)
```

**Before running anything for real:**
- Verify the default model names in `PROVIDER_CONFIGS` (`agents/base_agent.py` and
  `baseline/baseline_model.py`) against current provider docs -- both Gemini and
  Groq update their model lineups frequently. Override with `LLM_MODEL` in `.env`
  if the default has gone stale.
- **Gemini's free tier**: roughly 10-15 requests/minute depending on model, as of
  writing.
- **Groq's free tier**: `llama-3.3-70b-versatile` (the default here) is capped
  around 1,000 requests/day, 30 requests/minute -- fine for development, but with
  4 sequential agent calls per candidate, don't run large batches back-to-back
  without checking you're under the cap. `llama-3.1-8b-instant` has a much higher
  daily cap (~14,400/day) if you need more volume and can tolerate lower quality
  scoring.

## Run order (recommended)

1. **Engine tests first — no API key needed:**
   ```bash
   python tests/test_engine.py
   ```
   This validates the Nash Bargaining and Shapley math is correct (including the
   Shapley efficiency and symmetry properties) before you spend any API credits.

2. **Agent smoke test — needs an API key:**
   ```bash
   python tests/test_agents.py
   ```
   Runs all four agents against 4 synthetic resumes (strong match, weak match,
   non-traditional background, and a prompt-injection attempt) so you can eyeball
   whether each agent is behaving correctly in isolation.

3. **Full pipeline:**
   ```bash
   python pipeline.py
   ```
   Runs resume -> 4 agents -> Nash Bargaining -> decision + Shapley explanation,
   end to end, on the same sample resumes.

## What's still a placeholder (do not treat as finalized)

- `data/sample_data.py`: `DEFAULT_WEIGHTS` are equal (0.25 each) and
  `DEFAULT_DISAGREEMENT_POINTS` are rough guesses. The real weights should come from
  `engine/shapley.py`'s offline calibration once a validation set of past decisions
  exists. See `docs/Fair_AI_Recruitment_Project_Plan.md` Section 8 for open questions.
- `evaluation/evaluate.py`'s `decision_flip_rate` expects a counterfactual dataset
  that doesn't exist yet -- that's Person D's week 2 task.
- The Advocate/Skeptic adversarial debate step and the Pareto frontier plot are not
  implemented yet -- both are week 2 / stretch goals, see the project plan.

## Using this with Claude Projects

Upload everything in `docs/` to your Claude Project's knowledge so any team member's
Claude session has full context on the formal model, interface contract, and who
owns what. `Claude_Project_Context.md` is written specifically for this purpose.
