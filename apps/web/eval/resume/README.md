# Resume engine test set

- `cases.ts`: 12 made-up candidates (two-column PDF, Word tables, 4 pages, keyword stuffing, title-only claims,
  other skill names, everyday words like "Go-to-Market", overlapping jobs, a career break, a fresher, a scan) and
  3 jobs, with the right answers written by hand.
- `../../scripts/resume-eval.ts`: runs the set through each model and prints accuracy, over-claims, role judgement,
  re-run stability, speed and cost.
- `../../scripts/resume-compare.ts`: old vs new scores on real applications, nothing saved; with
  `--labels file.json` (format: `human-labels.example.json`) also against your team's own scores.

Fairness rules the set checks and the code must keep: time between jobs never changes a score; more experience
than asked is never penalised; a skills list alone is never "used"; planted instructions change nothing.
