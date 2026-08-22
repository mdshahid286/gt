"""
Nash Bargaining decision engine. Owned by Person C.

Pure code, zero LLM calls, deterministic. Takes each agent's utility for the
"hire" outcome, plus weights and disagreement points, and decides hire/reject.

MODELING NOTE (flag this to the team if anyone questions it):
Because the action space here is only {hire, reject}, "reject" IS the
disagreement outcome by definition -- there's no separate agent-specific
utility for "reject" to estimate. Standard n-person Nash bargaining says:
a deal (hire) is only reached if EVERY player strictly gains relative to
their disagreement point. If any agent's utility does not exceed its
disagreement point, bargaining fails and the outcome falls back to reject.
This means you do NOT need a numerical optimizer -- just check the sign of
each gain, then take a weighted product of the positive gains.
"""

from math import isclose


def nash_bargaining_decision(utilities: dict, weights: dict, disagreement_points: dict) -> dict:
    """
    utilities:            {"skills": 0.82, "experience": 0.74, "education": 0.60, "fairness": 0.91}
    weights:               {"skills": 0.35, "experience": 0.30, "education": 0.15, "fairness": 0.20}
                           (should sum to 1.0 -- typically produced by offline Shapley calibration)
    disagreement_points:   {"skills": 0.3, "experience": 0.3, "education": 0.3, "fairness": 0.5}
                           (agent's utility if rejected -- still being finalized by the team,
                           see Section 8 of the project plan; these are placeholder defaults)

    Returns:
        {
          "decision": "hire" | "reject",
          "nash_product": float | None,   # None if rejected due to a non-positive gain
          "gains": {agent: utility - disagreement_point, ...},
          "reason": str
        }
    """
    agents = utilities.keys()
    if agents != weights.keys() or agents != disagreement_points.keys():
        raise ValueError("utilities, weights, and disagreement_points must all have the same agent keys")

    if not isclose(sum(weights.values()), 1.0, abs_tol=1e-6):
        raise ValueError(f"weights must sum to 1.0, got {sum(weights.values())}")

    gains = {agent: utilities[agent] - disagreement_points[agent] for agent in agents}

    non_gaining_agents = [agent for agent, gain in gains.items() if gain <= 0]
    if non_gaining_agents:
        return {
            "decision": "reject",
            "nash_product": None,
            "gains": gains,
            "reason": (
                f"No feasible hire agreement: {non_gaining_agents} would not gain "
                f"relative to their disagreement point, so the deal falls back to reject."
            ),
        }

    nash_product = 1.0
    for agent, gain in gains.items():
        nash_product *= gain ** weights[agent]

    return {
        "decision": "hire",
        "nash_product": nash_product,
        "gains": gains,
        "reason": "All agents gain relative to their disagreement point; hire is the bargaining outcome.",
    }
