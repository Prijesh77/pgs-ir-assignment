"""Week 7: unit tests for the evaluation measures, checked against hand-worked examples."""

import math

import pytest

from pgs_ir.metrics import (
    average_precision,
    f1_at,
    interpolated_precision,
    ndcg_at,
    precision_at,
    r_precision,
    recall_at,
    reciprocal_rank,
    success_at,
)
from pgs_ir.week7 import randomisation_test

# A ranking where relevant documents (a, b, c) come at ranks 1, 3 and 6.
RANKED = ["a", "x", "b", "y", "z", "c", "w"]
RELEVANT = {"a", "b", "c", "d"}  # d is never retrieved


def test_precision_and_recall():
    assert precision_at(RANKED, RELEVANT, 3) == pytest.approx(2 / 3)
    assert precision_at(RANKED, RELEVANT, 10) == pytest.approx(3 / 10)  # missing results count as wrong
    assert recall_at(RANKED, RELEVANT, 3) == pytest.approx(2 / 4)
    assert recall_at(RANKED, RELEVANT, 10) == pytest.approx(3 / 4)


def test_f1_and_r_precision():
    p, r = 2 / 3, 2 / 4
    assert f1_at(RANKED, RELEVANT, 3) == pytest.approx(2 * p * r / (p + r))
    assert r_precision(RANKED, RELEVANT) == pytest.approx(2 / 4)  # R = 4: a and b in the top 4


def test_average_precision():
    # precision at each relevant hit: 1/1, 2/3, 3/6; d is missed and adds 0; divide by 4
    assert average_precision(RANKED, RELEVANT) == pytest.approx((1 + 2 / 3 + 3 / 6) / 4)
    assert average_precision([], RELEVANT) == 0.0


def test_reciprocal_rank_and_success():
    assert reciprocal_rank(["x", "y", "a"], RELEVANT) == pytest.approx(1 / 3)
    assert reciprocal_rank(["x"], RELEVANT) == 0.0
    assert success_at(["x", "a"], RELEVANT, 1) == 0.0
    assert success_at(["x", "a"], RELEVANT, 2) == 1.0


def test_graded_ndcg():
    grades = {"a": 2, "b": 1}
    assert ndcg_at(["a", "b"], grades, 10) == pytest.approx(1.0)  # ideal order
    # swapped: DCG = 1/log2(2) + 3/log2(3); ideal = 3/log2(2) + 1/log2(3)
    expected = (1 + 3 / math.log2(3)) / (3 + 1 / math.log2(3))
    assert ndcg_at(["b", "a"], grades, 10) == pytest.approx(expected)
    assert ndcg_at(["x"], grades, 10) == 0.0


def test_interpolated_precision():
    curve = interpolated_precision(["a", "x", "b"], {"a", "b"})
    assert curve[0] == 1.0  # recall 0.0: best precision anywhere is 1/1
    assert curve[5] == 1.0  # recall 0.5 reached at rank 1 with precision 1
    assert curve[10] == pytest.approx(2 / 3)  # recall 1.0 reached at rank 3
    assert len(curve) == 11


def test_randomisation_test():
    same = [0.5] * 50
    assert randomisation_test(same, same, n=200) == 1.0  # no difference at all
    better = [1.0] * 50
    assert randomisation_test(better, same, n=500) < 0.01  # always better
