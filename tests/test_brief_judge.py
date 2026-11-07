"""The report skill's brief-judge reads its level-three anchors from the climb rubric."""
import importlib.machinery
import importlib.util
import tempfile
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent / 'claude' / 'skills' / 'report' / 'scripts' / 'brief-judge'


def load():
    loader = importlib.machinery.SourceFileLoader('brief_judge', str(SKILL))
    spec = importlib.util.spec_from_loader('brief_judge', loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class BriefJudge(unittest.TestCase):
    def test_level_three_is_read_from_the_climb_rubric(self):
        bj = load()
        anchors = bj.load_anchors()
        self.assertEqual(sorted(anchors), sorted(key for key, *_ in bj.DIMENSIONS))
        for key, text in anchors.items():
            self.assertNotRegex(text, r'\]\(|\]\[|`', f'{key} keeps Markdown link syntax')
        self.assertIn('Feynman', anchors['refutation'])
        prompt = bj.build_prompt('Status: all good.', '[page structure] markdown', None, anchors)
        for text in anchors.values():
            self.assertIn(text, prompt)
        self.assertNotIn(' 3: ', ' '.join(levels for *_, levels in bj.DIMENSIONS))

    def test_a_rubric_missing_a_level_three_line_stops_the_judge(self):
        bj = load()
        text = bj.RUBRIC.read_text()
        start = text.index('\n   **3:**', text.index('**Shape:**'))
        with tempfile.TemporaryDirectory() as tmp:
            rubric = Path(tmp) / 'climb.md'
            rubric.write_text(text[:start] + text[text.index('\n', start + 1):])
            with self.assertRaisesRegex(ValueError, r"no '3:' line for Shape$"):
                bj.load_anchors(rubric)


if __name__ == '__main__':
    unittest.main()
