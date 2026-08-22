"""
Unit tests for the Nash Bargaining and Shapley modules.
No API key needed -- these are pure deterministic functions.

Run with: python -m pytest tests/test_engine.py -v
      or: python tests/test_engine.py
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.nash_bargaining import nash_bargaining_decision
from engine.shapley import exact_shapley_values, utility_gain_characteristic, normalize_to_weights


def test_nash_bargaining_hires_when_all_gain():
    utilities = {"skills": 0.8, "experience": 0.7, "education": 0.6, "fairness": 0.9}
    weights = {"skills": 0.25, "experience": 0.25, "education": 0.25, "fairness": 0.25}
    d = {"skills": 0.3, "experience": 0.3, "education": 0.3, "fairness": 0.3}

    result = nash_bargaining_decision(utilities, weights, d)
    assert result["decision"] == "hire", result
    assert result["nash_product"] is not None
    print("test_nash_bargaining_hires_when_all_gain: PASS")


def test_nash_bargaining_rejects_when_one_agent_loses():
    utilities = {"skills": 0.8, "experience": 0.7, "education": 0.2, "fairness": 0.9}
    weights = {"skills": 0.25, "experience": 0.25, "education": 0.25, "fairness": 0.25}
    d = {"skills": 0.3, "experience": 0.3, "education": 0.3, "fairness": 0.3}  # education fails to gain

    result = nash_bargaining_decision(utilities, weights, d)
    assert result["decision"] == "reject", result
    assert result["nash_product"] is None
    assert "education" in result["reason"]
    print("test_nash_bargaining_rejects_when_one_agent_loses: PASS")


def test_nash_bargaining_rejects_weight_mismatch():
    utilities = {"skills": 0.8}
    weights = {"skills": 0.5}  # doesn't sum to 1.0
    d = {"skills": 0.3}
    try:
        nash_bargaining_decision(utilities, weights, d)
        assert False, "should have raised ValueError"
    except ValueError:
        print("test_nash_bargaining_rejects_weight_mismatch: PASS")


def test_shapley_values_sum_matches_full_coalition_value():
    """Efficiency property: Shapley values should sum to v(full set) - v(empty set)."""
    agents = ["skills", "experience", "education", "fairness"]
    utilities = {"skills": 0.8, "experience": 0.7, "education": 0.5, "fairness": 0.9}
    d = {"skills": 0.3, "experience": 0.3, "education": 0.3, "fairness": 0.3}

    def v(subset):
        return utility_gain_characteristic(subset, utilities, d)

    shapley_values = exact_shapley_values(agents, v)
    full_value = v(frozenset(agents))
    empty_value = v(frozenset())

    total = sum(shapley_values.values())
    assert abs(total - (full_value - empty_value)) < 1e-9, (total, full_value, empty_value)
    print("test_shapley_values_sum_matches_full_coalition_value: PASS")


def test_shapley_equal_agents_get_equal_values():
    """If all agents contribute identically, their Shapley values should be equal (symmetry)."""
    agents = ["a", "b", "c"]

    def v(subset):
        return len(subset) * 1.0  # every agent contributes exactly 1.0 regardless of order

    shapley_values = exact_shapley_values(agents, v)
    values = list(shapley_values.values())
    assert all(abs(val - values[0]) < 1e-9 for val in values), shapley_values
    print("test_shapley_equal_agents_get_equal_values: PASS")


def test_normalize_to_weights_sums_to_one():
    raw = {"skills": 0.4, "experience": 0.1, "education": -0.05, "fairness": 0.3}
    normalized = normalize_to_weights(raw)
    assert abs(sum(normalized.values()) - 1.0) < 1e-9
    assert all(w > 0 for w in normalized.values())
    print("test_normalize_to_weights_sums_to_one: PASS")


if __name__ == "__main__":
    test_nash_bargaining_hires_when_all_gain()
    test_nash_bargaining_rejects_when_one_agent_loses()
    test_nash_bargaining_rejects_weight_mismatch()
    test_shapley_values_sum_matches_full_coalition_value()
    test_shapley_equal_agents_get_equal_values()
    test_normalize_to_weights_sums_to_one()
    print("\nAll engine tests passed.")
