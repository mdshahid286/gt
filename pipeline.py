"""
End-to-end integration pipeline. Owned by Person C.

Resume + job description --> 4 agents --> Nash Bargaining --> decision
                                                            --> Shapley explanation

Run directly for a manual smoke test:
    export ANTHROPIC_API_KEY=sk-...
    python pipeline.py
"""

from agents import SkillsAgent, ExperienceAgent, EducationAgent, FairnessAgent
from engine.nash_bargaining import nash_bargaining_decision
from engine.shapley import exact_shapley_values, utility_gain_characteristic
from data.sample_data import (
    JOB_DESCRIPTION, RESUMES, DEFAULT_DISAGREEMENT_POINTS, DEFAULT_WEIGHTS,
)


def evaluate_candidate(resume_text: str, job_description: str,
                        weights: dict = None, disagreement_points: dict = None) -> dict:
    """
    Runs the full pipeline for a single candidate and returns the decision,
    the Nash bargaining detail, and a Shapley-based explanation.
    """
    weights = weights or DEFAULT_WEIGHTS
    disagreement_points = disagreement_points or DEFAULT_DISAGREEMENT_POINTS

    skills_agent = SkillsAgent()
    experience_agent = ExperienceAgent()
    education_agent = EducationAgent()
    fairness_agent = FairnessAgent()

    # Skills, Experience, Education run independently (order doesn't matter)
    skills_result = skills_agent.evaluate(resume_text, job_description)
    experience_result = experience_agent.evaluate(resume_text, job_description)
    education_result = education_agent.evaluate(resume_text, job_description)

    # Fairness agent runs last -- it needs the other three agents' rationale
    other_rationales = {
        "skills": skills_result["rationale"],
        "experience": experience_result["rationale"],
        "education": education_result["rationale"],
    }
    fairness_result = fairness_agent.evaluate(resume_text, job_description, other_rationales)

    utilities = {
        "skills": skills_result["utility"],
        "experience": experience_result["utility"],
        "education": education_result["utility"],
        "fairness": fairness_result["utility"],
    }

    # Aggregation: pure code, no LLM calls from here down
    bargaining_result = nash_bargaining_decision(utilities, weights, disagreement_points)

    # Per-decision Shapley explanation
    agent_names = list(utilities.keys())
    shapley_values = exact_shapley_values(
        agent_names,
        lambda subset: utility_gain_characteristic(subset, utilities, disagreement_points),
    )
    total_shapley = sum(shapley_values.values()) or 1e-9  # avoid div by zero
    explanation_pct = {agent: round(100 * val / total_shapley, 1) for agent, val in shapley_values.items()}

    return {
        "decision": bargaining_result["decision"],
        "nash_bargaining_detail": bargaining_result,
        "agent_outputs": {
            "skills": skills_result,
            "experience": experience_result,
            "education": education_result,
            "fairness": fairness_result,
        },
        "shapley_explanation_pct": explanation_pct,
    }


if __name__ == "__main__":
    for label, resume_text in RESUMES.items():
        print(f"\n{'=' * 70}")
        print(f"CANDIDATE: {label}")
        print("=" * 70)
        try:
            result = evaluate_candidate(resume_text, JOB_DESCRIPTION)
            print(f"DECISION: {result['decision']}")
            print(f"Reason: {result['nash_bargaining_detail']['reason']}")
            print(f"Shapley explanation (% contribution): {result['shapley_explanation_pct']}")
            for agent, output in result["agent_outputs"].items():
                print(f"  [{agent}] utility={output['utility']} flags={output['flags']}")
                print(f"    rationale: {output['rationale']}")
        except Exception as e:
            print(f"PIPELINE FAILED for {label}: {e}")
