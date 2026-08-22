"""
Manual sanity-check harness for all four agents (requires an API key -- not
a substitute for tests/test_engine.py, which runs without one).

Usage:
    export ANTHROPIC_API_KEY=sk-...
    python tests/test_agents.py
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agents import SkillsAgent, ExperienceAgent, EducationAgent, FairnessAgent
from data.sample_data import JOB_DESCRIPTION, RESUMES


def run_all():
    skills_agent = SkillsAgent()
    experience_agent = ExperienceAgent()
    education_agent = EducationAgent()
    fairness_agent = FairnessAgent()

    for label, resume_text in RESUMES.items():
        print(f"\n{'=' * 60}")
        print(f"RESUME: {label}")
        print("=" * 60)

        skills_result = _safe_eval(skills_agent, resume_text, JOB_DESCRIPTION)
        experience_result = _safe_eval(experience_agent, resume_text, JOB_DESCRIPTION)
        education_result = _safe_eval(education_agent, resume_text, JOB_DESCRIPTION)

        if skills_result and experience_result and education_result:
            other_rationales = {
                "skills": skills_result["rationale"],
                "experience": experience_result["rationale"],
                "education": education_result["rationale"],
            }
            try:
                fairness_result = fairness_agent.evaluate(resume_text, JOB_DESCRIPTION, other_rationales)
                _print_result(fairness_result)
            except Exception as e:
                print(f"\n[fairness] FAILED: {e}")


def _safe_eval(agent, resume_text, job_description):
    try:
        result = agent.evaluate(resume_text, job_description)
        _print_result(result)
        return result
    except Exception as e:
        print(f"\n[{agent.AGENT_NAME}] FAILED: {e}")
        return None


def _print_result(result):
    print(f"\n[{result['agent']}]")
    print(f"  utility:   {result['utility']}")
    print(f"  rationale: {result['rationale']}")
    print(f"  flags:     {result['flags']}")


if __name__ == "__main__":
    run_all()
