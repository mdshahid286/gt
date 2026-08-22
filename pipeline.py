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

    # Per-decision Shapley explanation.
    # NOTE: normalizing to a "% contribution to hire" only makes sense when the
    # candidate was actually hired with a meaningfully positive total gain.
    # For rejected candidates, or edge cases where the total gain is near zero,
    # forcing a percentage breakdown produces nonsensical values (e.g. -184%,
    # 112%) because you'd be dividing by a small or negative denominator. In
    # those cases we report the raw Shapley values instead of a percentage --
    # still meaningful as relative point-contributions, just not framed as
    # shares of a "whole" that doesn't exist for a rejected candidate.
    agent_names = list(utilities.keys())
    shapley_values = exact_shapley_values(
        agent_names,
        lambda subset: utility_gain_characteristic(subset, utilities, disagreement_points),
    )
    total_shapley = sum(shapley_values.values())

    MIN_MEANINGFUL_TOTAL = 0.05  # below this, percentage normalization becomes unstable
    if bargaining_result["decision"] == "hire" and total_shapley > MIN_MEANINGFUL_TOTAL:
        shapley_explanation = {
            "type": "percentage",
            "values": {agent: round(100 * val / total_shapley, 1) for agent, val in shapley_values.items()},
        }
    else:
        shapley_explanation = {
            "type": "raw_value",
            "values": {agent: round(val, 3) for agent, val in shapley_values.items()},
            "note": (
                "Percentage attribution is only shown for hired candidates with a clearly "
                "positive total gain. This candidate was rejected (or the total gain was too "
                "small/negative to normalize sensibly), so raw Shapley values are shown "
                "instead: more positive means that agent contributed more toward a 'hire' "
                "outcome, more negative means it contributed toward the rejection."
            ),
        }

    return {
        "decision": bargaining_result["decision"],
        "nash_bargaining_detail": bargaining_result,
        "agent_outputs": {
            "skills": skills_result,
            "experience": experience_result,
            "education": education_result,
            "fairness": fairness_result,
        },
        "shapley_explanation": shapley_explanation,
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
            exp = result["shapley_explanation"]
            if exp["type"] == "percentage":
                print(f"Shapley explanation (% contribution): {exp['values']}")
            else:
                print(f"Shapley explanation (raw values, not %): {exp['values']}")
                print(f"  Note: {exp['note']}")
            for agent, output in result["agent_outputs"].items():
                print(f"  [{agent}] utility={output['utility']} flags={output['flags']}")
                print(f"    rationale: {output['rationale']}")
        except Exception as e:
            print(f"PIPELINE FAILED for {label}: {e}")
