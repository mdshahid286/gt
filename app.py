"""
Streamlit UI for the Fair AI Recruitment System.

Wraps pipeline.py directly -- no separate backend needed, since this is a
Python-only project. Run with:

    streamlit run app.py

Provider (Gemini/Groq) is read from your .env file, same as the CLI pipeline --
this UI doesn't override LLM_PROVIDER, it just calls evaluate_candidate().

Theme: dark "case file / tribunal" register -- deliberate choice tied to the
subject (agents negotiating a verdict), not a default. See .streamlit/config.toml
for the base palette; custom CSS below handles typography and the verdict stamp.
"""

import streamlit as st

from pipeline import evaluate_candidate
from data.sample_data import JOB_DESCRIPTION, RESUMES, DEFAULT_WEIGHTS, DEFAULT_DISAGREEMENT_POINTS

st.set_page_config(page_title="Fair AI Recruitment System", page_icon="⚖️", layout="wide")

# ---------------------------------------------------------------------------
# Custom theme: fonts, verdict stamp, score bars, agent cards
# ---------------------------------------------------------------------------
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

html, body, [class*="css"] {
    font-family: 'IBM Plex Sans', sans-serif;
}
h1, h2, h3 { font-family: 'Fraunces', serif !important; letter-spacing: -0.01em; }

.eyebrow {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8A93A3;
    margin-bottom: 0.2rem;
}

/* Verdict stamp -- the signature element */
.verdict-stamp {
    display: inline-block;
    padding: 0.55rem 1.5rem;
    border: 3px solid currentColor;
    border-radius: 4px;
    font-family: 'Fraunces', serif;
    font-weight: 700;
    font-size: 1.5rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    transform: rotate(-1.5deg);
    margin: 0.4rem 0 1rem 0;
}
.verdict-hire { color: #2F9E68; border-color: #2F9E68; background: rgba(47,158,104,0.08); }
.verdict-reject { color: #C1443C; border-color: #C1443C; background: rgba(193,68,60,0.08); }

/* Agent score bars -- ledger-style, not a generic progress widget */
.score-value {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 1.4rem;
    font-weight: 600;
    color: #E8E6DE;
    margin-top: 0.4rem;
}
.score-track {
    height: 7px;
    background: #2A3140;
    border-radius: 4px;
    overflow: hidden;
    margin: 0.35rem 0 0.15rem 0;
}
.score-fill {
    height: 100%;
    background: linear-gradient(90deg, #C9A227, #E4C55A);
    border-radius: 4px;
}
.flag-pill {
    display: inline-block;
    background: rgba(193,68,60,0.15);
    color: #E28880;
    border: 1px solid rgba(193,68,60,0.4);
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-family: 'IBM Plex Mono', monospace;
    margin: 0.35rem 0;
}

[data-testid="stMetricValue"] { font-family: 'IBM Plex Mono', monospace !important; }
[data-testid="stSidebar"] { border-right: 1px solid #2A3140; }
div[data-testid="stButton"] button {
    border-radius: 4px;
    letter-spacing: 0.03em;
    font-weight: 600;
}
</style>
""", unsafe_allow_html=True)

st.markdown('<div class="eyebrow">Cooperative Game Theory &middot; Four Agents Negotiate a Verdict</div>', unsafe_allow_html=True)
st.title("⚖️ Fair AI Recruitment System")
st.caption(
    "Multi-agent resume screening combined via Nash Bargaining, explained via Shapley value. "
    "Not a single model's opinion -- four independent agents negotiate to a decision."
)

# ---------------------------------------------------------------------------
# Sidebar: candidate input
# ---------------------------------------------------------------------------
with st.sidebar:
    st.header("Candidate input")

    sample_choice = st.selectbox(
        "Load a sample resume",
        ["-- write your own --"] + list(RESUMES.keys()),
        help="The 4 synthetic test resumes from data/sample_data.py -- includes a prompt-injection test case.",
    )
    default_resume = RESUMES[sample_choice] if sample_choice != "-- write your own --" else ""

    job_description = st.text_area("Job description", value=JOB_DESCRIPTION, height=140)
    resume_text = st.text_area("Candidate resume", value=default_resume, height=280)

    st.divider()
    with st.expander("Advanced: weights & disagreement points"):
        st.caption("Placeholders until Person C runs offline Shapley calibration -- see docs/ Section 8.")
        weights = {}
        d_points = {}
        for agent in ["skills", "experience", "education", "fairness"]:
            c1, c2 = st.columns(2)
            weights[agent] = c1.slider(f"{agent} weight", 0.0, 1.0, DEFAULT_WEIGHTS[agent], 0.05, key=f"w_{agent}")
            d_points[agent] = c2.slider(f"{agent} disagreement pt", 0.0, 1.0, DEFAULT_DISAGREEMENT_POINTS[agent], 0.05, key=f"d_{agent}")
        weight_sum = sum(weights.values())
        if abs(weight_sum - 1.0) > 1e-6:
            st.warning(f"Weights sum to {weight_sum:.2f}, not 1.0 -- will fall back to defaults.")

    st.divider()
    st.caption("Provider comes from your `.env` (`LLM_PROVIDER`). Change it there, not here.")

    run_button = st.button("Run evaluation", type="primary", use_container_width=True)

# ---------------------------------------------------------------------------
# Main: run pipeline and display results
# ---------------------------------------------------------------------------
if run_button:
    if not resume_text.strip() or not job_description.strip():
        st.error("Please provide both a job description and a resume before running.")
    else:
        with st.spinner("Running 4 agents + Nash Bargaining + Shapley explanation (several API calls, ~10-20s)..."):
            try:
                result = evaluate_candidate(
                    resume_text, job_description,
                    weights=weights if abs(sum(weights.values()) - 1.0) < 1e-6 else None,
                    disagreement_points=d_points,
                )
                error = None
            except Exception as e:
                result = None
                error = str(e)

    if error:
        st.error(f"Pipeline failed: {error}")
    elif result:
        decision = result["decision"]
        stamp_class = "verdict-hire" if decision == "hire" else "verdict-reject"
        stamp_text = "Hired" if decision == "hire" else "Rejected"
        st.markdown(f'<div class="verdict-stamp {stamp_class}">{stamp_text}</div>', unsafe_allow_html=True)
        st.write(result["nash_bargaining_detail"]["reason"])

        st.subheader("Agent scores")
        cols = st.columns(4)
        for col, agent in zip(cols, ["skills", "experience", "education", "fairness"]):
            output = result["agent_outputs"][agent]
            pct = max(0.0, min(1.0, output["utility"])) * 100
            with col:
                with st.container(border=True):
                    st.markdown(f"**{agent.capitalize()}**")
                    st.markdown(
                        f'<div class="score-value">{output["utility"]:.2f}</div>'
                        f'<div class="score-track"><div class="score-fill" style="width:{pct}%"></div></div>',
                        unsafe_allow_html=True,
                    )
                    if output["flags"]:
                        st.markdown(
                            f'<span class="flag-pill">&#9873; {", ".join(output["flags"])}</span>',
                            unsafe_allow_html=True,
                        )
                    st.caption(output["rationale"])

        st.subheader("Shapley explanation")
        exp = result["shapley_explanation"]
        st.bar_chart(exp["values"])
        if exp["type"] == "percentage":
            st.caption("% contribution to the hire decision (only meaningful because this candidate was hired).")
        else:
            st.caption(exp["note"])

        with st.expander("Raw Nash bargaining detail"):
            st.json(result["nash_bargaining_detail"])
else:
    st.info("Pick a sample resume in the sidebar (or write your own), then click **Run evaluation**.")
