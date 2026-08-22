"""
Shapley value module. Owned by Person C.

Used in two distinct roles -- do not conflate them:
  1. OFFLINE weight calibration: run on a validation set of past decisions to
     compute each agent's average marginal contribution to correct outcomes.
     The resulting values feed in as the `weights` dict for the Nash Bargaining
     engine.
  2. PER-DECISION explanation: run on a single candidate's realized utilities
     to produce a human-readable attribution ("selected mainly due to skills
     40%, experience 25%...").

With only 4 agents, exact computation (2^4 = 16 subsets) is cheap -- no need
for Monte Carlo sampling at this scale.
"""

import itertools
from math import factorial


def _all_subsets(agents):
    """All subsets of `agents`, including the empty set and the full set."""
    for r in range(len(agents) + 1):
        for combo in itertools.combinations(agents, r):
            yield frozenset(combo)


def exact_shapley_values(agents: list, value_function) -> dict:
    """
    agents: list of agent name strings, e.g. ["skills", "experience", "education", "fairness"]
    value_function: callable(subset: frozenset[str]) -> float
                     the characteristic function v(S) -- must handle the empty set (v(empty) is
                     usually 0, but the function should define it explicitly).

    Returns: {agent_name: shapley_value, ...}
    """
    n = len(agents)
    subsets = list(_all_subsets(agents))
    v = {s: value_function(s) for s in subsets}

    shapley_values = {}
    for agent in agents:
        others = [a for a in agents if a != agent]
        total = 0.0
        for r in range(len(others) + 1):
            for combo in itertools.combinations(others, r):
                S = frozenset(combo)
                S_with_agent = S | {agent}
                marginal_contribution = v[S_with_agent] - v[S]
                weight = (factorial(len(S)) * factorial(n - len(S) - 1)) / factorial(n)
                total += weight * marginal_contribution
        shapley_values[agent] = total

    return shapley_values


def normalize_to_weights(shapley_values: dict) -> dict:
    """
    Convert raw Shapley values into non-negative weights that sum to 1.0,
    suitable for use as the `weights` dict in nash_bargaining_decision.
    Negative Shapley values (an agent that on average hurt outcomes) are
    floored at a small epsilon rather than dropped, so every agent keeps
    at least minimal influence -- flag it to the team if this happens, since
    it may indicate a problem with that agent's prompt.
    """
    epsilon = 1e-6
    floored = {agent: max(val, epsilon) for agent, val in shapley_values.items()}
    total = sum(floored.values())
    return {agent: val / total for agent, val in floored.items()}


# ---------------------------------------------------------------------------
# Example characteristic functions
# ---------------------------------------------------------------------------

def utility_gain_characteristic(subset: frozenset, utilities: dict, disagreement_points: dict) -> float:
    """
    A simple additive characteristic function for PER-DECISION explanation:
    v(S) = sum of (utility - disagreement point) for agents in S.

    This is a deliberate simplification for explanation purposes (not a claim
    that agents' contributions are literally additive in the bargaining sense)
    -- flag to the team if a more faithful characteristic function is wanted,
    e.g. one that re-runs the bargaining decision on each subset.
    """
    return sum(utilities[a] - disagreement_points[a] for a in subset)


def validation_accuracy_characteristic(subset: frozenset, validation_set: list, decision_fn) -> float:
    """
    A characteristic function for OFFLINE weight calibration:
    v(S) = accuracy of decisions made using only the agents in S, evaluated
    against a validation set of past (candidate, ground_truth_decision) pairs.

    validation_set: list of dicts like
        {"utilities": {"skills": 0.8, ...}, "ground_truth": "hire"}
    decision_fn: callable(subset_utilities: dict) -> "hire" | "reject"
                 e.g. a simplified rule (mean utility > threshold) used ONLY
                 for calibration -- not the same as the live Nash Bargaining
                 call, which needs weights this function is helping to produce.

    Returns: accuracy as a float in [0, 1]. v(empty set) = 0.0 by convention.
    """
    if not subset:
        return 0.0

    correct = 0
    for example in validation_set:
        subset_utilities = {agent: example["utilities"][agent] for agent in subset}
        predicted = decision_fn(subset_utilities)
        if predicted == example["ground_truth"]:
            correct += 1

    return correct / len(validation_set) if validation_set else 0.0
