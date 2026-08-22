"""
Evaluation metrics. Owned by Person D.

- precision_recall: standard classification metrics against ground-truth labels.
- decision_flip_rate: for counterfactual resume pairs (differing only in a
  protected/proxy signal), how often does the decision change? Lower is better
  -- this is the headline fairness metric for week 2.
"""


def precision_recall(predictions: list, ground_truth: list) -> dict:
    """
    predictions, ground_truth: lists of "hire" / "reject", same length, same order.
    """
    if len(predictions) != len(ground_truth):
        raise ValueError("predictions and ground_truth must be the same length")

    tp = sum(1 for p, g in zip(predictions, ground_truth) if p == "hire" and g == "hire")
    fp = sum(1 for p, g in zip(predictions, ground_truth) if p == "hire" and g == "reject")
    fn = sum(1 for p, g in zip(predictions, ground_truth) if p == "reject" and g == "hire")
    tn = sum(1 for p, g in zip(predictions, ground_truth) if p == "reject" and g == "reject")

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    accuracy = (tp + tn) / len(predictions) if predictions else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

    return {
        "precision": precision, "recall": recall, "accuracy": accuracy, "f1": f1,
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
    }


def decision_flip_rate(counterfactual_pairs: list) -> dict:
    """
    counterfactual_pairs: list of dicts like
        {"original_decision": "hire", "counterfactual_decision": "reject", "pair_id": "..."}
    where original/counterfactual differ only in a protected/proxy signal
    (name, dialect, unexplained gap) with everything else held identical.

    Returns flip rate (lower = fairer) plus the list of pair_ids that flipped,
    so you can inspect specific failure cases.
    """
    if not counterfactual_pairs:
        return {"flip_rate": None, "flipped_pairs": [], "total_pairs": 0}

    flipped = [
        pair["pair_id"] for pair in counterfactual_pairs
        if pair["original_decision"] != pair["counterfactual_decision"]
    ]

    return {
        "flip_rate": len(flipped) / len(counterfactual_pairs),
        "flipped_pairs": flipped,
        "total_pairs": len(counterfactual_pairs),
    }
