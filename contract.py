"""
Canonical interface contract validation.

Every scoring agent (Skills, Experience, Education, Fairness) must return
exactly this shape. Owned by Person C -- do not change without team agreement.
"""

REQUIRED_FIELDS = {"agent", "utility", "rationale", "flags"}
VALID_AGENT_NAMES = {"skills", "experience", "education", "fairness"}


class ContractViolation(ValueError):
    """Raised when an agent's output doesn't match the shared interface contract."""
    pass


def validate_agent_output(output: dict) -> dict:
    """
    Validate an agent's output against the shared interface contract.
    Raises ContractViolation with a specific reason if invalid.
    Returns the output unchanged if valid (for convenient chaining).
    """
    if not isinstance(output, dict):
        raise ContractViolation(f"Expected a dict, got {type(output).__name__}")

    missing = REQUIRED_FIELDS - output.keys()
    if missing:
        raise ContractViolation(f"Missing required fields: {missing}")

    if output["agent"] not in VALID_AGENT_NAMES:
        raise ContractViolation(
            f"'agent' must be one of {VALID_AGENT_NAMES}, got {output['agent']!r}"
        )

    if not isinstance(output["utility"], (int, float)) or isinstance(output["utility"], bool):
        raise ContractViolation(f"'utility' must be a number, got {type(output['utility']).__name__}")

    utility = float(output["utility"])
    if not (0.0 <= utility <= 1.0):
        raise ContractViolation(f"'utility' must be in [0, 1], got {utility}")

    if not isinstance(output["rationale"], str) or not output["rationale"].strip():
        raise ContractViolation("'rationale' must be a non-empty string")

    if not isinstance(output["flags"], list) or not all(isinstance(f, str) for f in output["flags"]):
        raise ContractViolation("'flags' must be a list of strings")

    return output
