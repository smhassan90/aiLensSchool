"""Quick unit checks for stacked-fraction composition (no Paddle model load)."""

from __future__ import annotations

import unittest

from paddle_ocr_worker import (
    cluster_reading_lines,
    compose_stacked_fractions,
    text_from_lines_with_fractions,
)


class FractionComposeTest(unittest.TestCase):
    def test_pairs_stacked_digits(self) -> None:
        lines = [
            {"text": "Example:", "x0": 10, "y0": 10, "x1": 80, "y1": 30},
            {"text": "3", "x0": 100, "y0": 40, "x1": 118, "y1": 58},
            {"text": "8", "x0": 140, "y0": 40, "x1": 158, "y1": 58},
            {"text": "-", "x0": 100, "y0": 60, "x1": 118, "y1": 64},
            {"text": "-", "x0": 140, "y0": 60, "x1": 158, "y1": 64},
            {"text": "4", "x0": 100, "y0": 68, "x1": 118, "y1": 86},
            {"text": "11", "x0": 138, "y0": 68, "x1": 162, "y1": 86},
        ]
        text = text_from_lines_with_fractions(lines)
        self.assertIn("3/4", text)
        self.assertIn("8/11", text)
        self.assertNotIn("\n4\n", f"\n{text}\n")

    def test_mixed_number(self) -> None:
        lines = [
            {"text": "2", "x0": 40, "y0": 50, "x1": 55, "y1": 90},
            {"text": "1", "x0": 60, "y0": 40, "x1": 75, "y1": 58},
            {"text": "6", "x0": 60, "y0": 70, "x1": 75, "y1": 88},
        ]
        composed = compose_stacked_fractions(lines)
        texts = [r["text"] for r in composed]
        self.assertIn("2 1/6", texts)

    def test_cluster_keeps_fraction_list(self) -> None:
        lines = [
            {"text": "Example:", "x0": 10, "y0": 10, "x1": 70, "y1": 28},
            {"text": "3/4", "x0": 80, "y0": 12, "x1": 120, "y1": 30},
            {"text": "8/11", "x0": 130, "y0": 12, "x1": 180, "y1": 30},
        ]
        band = cluster_reading_lines(lines)
        self.assertEqual(len(band), 1)
        self.assertIn("3/4,", band[0])


if __name__ == "__main__":
    unittest.main()
