# Fair AI Recruitment System Using Cooperative Game Theory
## Complete Project Planning Document

---

## 1. Project Overview

**Problem.** Automated resume-screening systems save time but can encode bias through indirect signals — names, regional language patterns, educational background, career gaps.

**Approach.** Instead of one model producing a single score, the candidate is evaluated by several specialized agents whose scores are combined through a formal cooperative game rather than a simple weighted average. Game theory decides *how much influence* each agent gets and produces a mathematically grounded explanation for the outcome.

**Deliverables.** A working multi-agent pipeline, a formal game-theoretic specification, a comparison against a single-model baseline, and (time permitting) a paper draft positioned against existing multi-agent hiring literature.

---

## 2. How Game Theory Works in This Project

Game theory contributes three distinct things to the pipeline, and it's important to keep them separate:

| Concept | Role in the system | What it is NOT doing |
|---|---|---|
| **Utility functions** | Each agent's normalized 0–1 score for a candidate | Not the final decision |
| **Nash Bargaining** | The rule that combines all agent utilities into one hire/reject decision | Not an explanation mechanism |
| **Shapley value** | Used twice: (a) offline, to calibrate how much bargaining power each agent gets, based on past outcomes; (b) per-decision, to explain why a specific candidate was selected | Not the decision rule itself |
| **Pareto optimality** | An evaluation lens — is there a decision rule that improves fairness without hurting accuracy, or have we hit the frontier? | Not something computed per-candidate; it's a property of the whole system, checked at evaluation time |

**Why this matters:** a common mistake (which the early version of this plan made) is treating "negotiation" and "cooperative game combination" as two separate pipeline stages. They're not — Nash Bargaining *is* the cooperative-game decision mechanism. Shapley value is a different tool entirely, used for attribution (before the fact, to set weights; after the fact, to explain).

### The formal game

- **Players:** N = {Skills, Experience, Education, Fairness} (Recruiter agent dropped — redundant with the job description input).
- **Utility function:** each agent i computes u_i(candidate, job) ∈ [0, 1], normalized to a common scale so a "92/100 skills score" and a "bias flag" are comparable.
- **Disagreement point:** d_i = agent i's utility if the candidate is rejected. Note this need not be zero for all agents — the Fairness agent's disagreement utility can reasonably be *higher* than the others', since rejecting avoids the risk of an unfair hire.
- **Decision rule (n-person Nash Bargaining):**

  x\* = argmax_x ∏ᵢ (uᵢ(x) − dᵢ)^wᵢ

  where wᵢ is agent i's bargaining weight (power index), and x ranges over {hire, reject}.
- **Weight calibration (offline Shapley):** on a validation set of past outcomes, compute each agent's Shapley value — its average marginal contribution to correct/fair decisions across all possible agent subsets — and use these values as the wᵢ above.
- **Per-decision explanation (online Shapley):** for a specific candidate, compute each agent's Shapley contribution to that candidate's *realized* utility, and present it as the explanation ("selected mainly due to skills 40%, experience 25%, fairness adjustment 20%...").
- **Evaluation lens (Pareto optimality):** across many candidates, plot the accuracy–fairness Pareto frontier for this system vs. the single-model baseline. The headline result is whether this system's frontier dominates the baseline's, not a single-point fairness score.

---

## 3. Objectives

1. Formalize resume screening as an n-person cooperative game with clearly defined players, utilities, and a disagreement point.
2. Implement four specialized agents (Skills, Experience, Education, Fairness), each producing a normalized utility score.
3. Implement Nash Bargaining as the aggregation mechanism that converts agent utilities into a hire/reject decision.
4. Implement Shapley value in its two roles — offline weight calibration and per-decision explanation.
5. Benchmark against a single-model baseline on hiring-quality metrics (precision/recall) and a bias metric (counterfactual decision-flip rate).
6. Demonstrate the accuracy–fairness Pareto frontier of the proposed system vs. the baseline.
7. *(Stretch)* Add an adversarial Advocate/Skeptic debate step that cross-examines borderline decisions for hidden bias.
8. *(Stretch)* Package the findings for submission to a workshop track (e.g. an AI-fairness or AI-for-HR workshop).

---

## 4. System Architecture

*(See the architecture diagram shared earlier in this conversation.)*

- **Input layer:** resume + job description.
- **Agent layer:** four parallel agents (Skills, Experience, Education — teal; Fairness — coral), each an LLM call with a role-specific prompt returning a normalized utility score.
- **Aggregation layer:** Nash Bargaining engine (purple), pure code — takes the four utilities plus calibrated weights, outputs hire/reject.
- **Output layer:** Decision (blue) and Shapley explanation (amber), generated from the same aggregation step.
- **Offline calibration loop (gray):** runs separately, on a validation set of past decisions, to compute Shapley-based weights that feed into the aggregation layer.

---

## 5. Week 1 Plan — Core Implementation (Target: 50%)

| Day | Milestone | Deliverable |
|---|---|---|
| 1 | Formalize the game + setup | One-page math spec (players, u_i, d_i, bargaining formula); environment + API keys; dataset selected |
| 2 | Build the agents | 4 LLM-backed agent functions, each returning a normalized utility score |
| 3 | Aggregation engine | Nash Bargaining solver (n-person, weighted) implemented in code |
| 4 | Explanation engine | Shapley value module: offline weight calibration + per-decision attribution |
| 5 | End-to-end integration | Full pipeline: resume in → decision + explanation out, on ~20–30 sample resumes |
| 6 | Baseline + basic evaluation | Single-model baseline built; precision/recall comparison table; 2–3 worked case studies |
| 7 | Buffer + documentation | Bug fixes, milestone write-up, demo-ready script |

**Explicitly deferred to week 2:** Advocate/Skeptic debate agent, full counterfactual fairness dataset, Pareto frontier plot.

---

## 6. Week 2 Plan — Evaluation + Innovation (Target: remaining 50%)

| Day | Milestone | Deliverable |
|---|---|---|
| 8 | Counterfactual dataset | Take real resumes, generate paired versions where only a protected/proxy signal changes (name, dialect marker, unexplained gap) — everything else identical. Aim for enough pairs to be statistically meaningful (dozens minimum, hundreds if aiming for publication) |
| 9 | Fairness evaluation | Run baseline and proposed system on counterfactual pairs; measure decision-flip rate for each |
| 10 | Advocate/Skeptic agent | Implement the adversarial debate step: Advocate builds the strongest honest case, Skeptic checks whether the score depends on bias-adjacent signals; wire it in as a pre-finalization check |
| 11 | Pareto frontier analysis | Plot accuracy vs. fairness for baseline and proposed system across varying weight configurations; identify whether the proposed system's frontier dominates the baseline's |
| 12 | Case studies + polish | 3–5 fully worked examples (decision + Shapley breakdown + debate transcript) for the report/demo |
| 13 | Report / paper draft | Write up methods, results, and position against existing literature (see Section 7) |
| 14 | Buffer | Final fixes, presentation prep |

---

## 7. Publication Positioning (if pursuing this beyond the course)

Existing related work to position against, so the contribution reads as novel rather than incremental:

- **Multi-agent LLM resume screening** (2025): four-agent pipelines (extractor, evaluator, summarizer, formatter) using RAG for context-aware scoring — no game-theoretic aggregation.
- **FAIRE benchmark**: evaluates gender/racial bias in LLM-based resume screening, finding persistent disparities — a benchmark, not a mitigation framework.
- **Shapley-for-fairness preprocessing** (e.g. FairSHAP-style work): uses Shapley values over *training data* to locate fairness-critical features — Shapley applied to data, not to agents or decisions.

**This project's specific novelty claim:** a bargaining-based aggregation mechanism (not weighted averaging, not simple negotiation) combined with a dual-role Shapley value (weight calibration + explanation) and an adversarial fairness check — applied to the *decision process itself*, not just to feature attribution.

**Realistic target:** a workshop track (e.g. FAccT-adjacent, or an AI-for-HR/fairness workshop at a larger ML conference) rather than a top-tier main track for a first submission.

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| LLM agent scores are noisy/inconsistent | Fix temperature low, run each agent 2–3 times and average, log raw outputs for debugging |
| Nash Bargaining implementation bugs (numerical optimization over a 2-outcome space is actually simple — don't over-engineer) | Since the action space is just {hire, reject}, the argmax is just: evaluate the Nash product for both outcomes and pick the larger — no numerical solver needed |
| Shapley computation cost grows with agent count | With only 4 agents, exact Shapley (2⁴ = 16 subsets) is cheap — no need for Monte Carlo sampling at this scale |
| Small dataset limits statistical significance of fairness results | Be explicit in the report about sample size limits; frame week-1 results as a proof of concept, week-2 counterfactual results as the more rigorous test |
| Running out of time before week 2 stretch goals | Week 1 core pipeline is the non-negotiable 50%; treat Advocate/Skeptic and Pareto frontier as genuinely optional additions, not blockers for submission |

---

## 9. Deliverables Checklist

- [ ] One-page formal game specification (players, utilities, disagreement point, bargaining formula)
- [ ] Working 4-agent scoring pipeline
- [ ] Nash Bargaining decision engine
- [ ] Offline Shapley weight calibration
- [ ] Per-decision Shapley explanation
- [ ] Single-model baseline for comparison
- [ ] Precision/recall comparison table
- [ ] Counterfactual fairness dataset + decision-flip rate results
- [ ] Accuracy–fairness Pareto frontier plot
- [ ] *(Stretch)* Advocate/Skeptic adversarial fairness check
- [ ] 3–5 worked case studies
- [ ] Final report / paper draft
