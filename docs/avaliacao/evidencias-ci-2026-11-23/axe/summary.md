# Automated accessibility evidence

Web commit `b9eac83e773a2b332d79389643f57cb7808efbe2`; API `f1d07db796f2f4964f652669d0130a9e1ebe9eb9`.
Chromium 151.0.7922.34; axe-core 4.12.1; viewport 1440 × 900; reduced motion enabled.
Scanned 27/27 intended states.
Distinct rules returned by axe: 63. The tagged catalog contains 70 rules; catalog membership alone does not mean a rule ran.
States with violations: 0; rule occurrences: 0; nodes: 0.
States requiring manual review: 27.

| State | Role | Theme | Violations | Incomplete | Passed rules | Inapplicable rules |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| landing | visitor | default | 0 | 1 | 21 | 42 |
| tool-dictionary | visitor | default | 0 | 1 | 26 | 37 |
| tool-daily-sign | visitor | default | 0 | 1 | 24 | 39 |
| tool-resources | visitor | default | 0 | 1 | 24 | 39 |
| tool-faq | visitor | default | 0 | 1 | 24 | 39 |
| tool-guide | visitor | default | 0 | 1 | 24 | 39 |
| tool-fingerspelling | visitor | default | 0 | 2 | 27 | 35 |
| login | visitor | default | 0 | 1 | 16 | 47 |
| signup | visitor | default | 0 | 1 | 15 | 48 |
| invite-invalid | visitor | default | 0 | 1 | 15 | 48 |
| app-home | host | default | 0 | 1 | 22 | 41 |
| room-list | host | default | 0 | 1 | 22 | 41 |
| host-context | host | dark | 0 | 3 | 25 | 38 |
| host-context-error | host | dark | 0 | 3 | 25 | 38 |
| host-room-dark | host | dark | 0 | 3 | 21 | 42 |
| host-room-light | host | light | 0 | 3 | 21 | 42 |
| invite-valid | visitor | default | 0 | 1 | 20 | 43 |
| guest-waiting | guest | dark | 0 | 1 | 21 | 42 |
| host-admission-queue | host | dark | 0 | 3 | 25 | 38 |
| guest-room | guest | dark | 0 | 3 | 21 | 42 |
| guest-chat | guest | dark | 0 | 3 | 25 | 38 |
| host-people | host | dark | 0 | 3 | 24 | 39 |
| host-removal-dialog | host | dark | 0 | 3 | 24 | 39 |
| host-device-dialog | host | dark | 0 | 3 | 25 | 38 |
| captions-literal | host | dark | 0 | 3 | 21 | 42 |
| captions-adapted-mode | host | dark | 0 | 3 | 21 | 42 |
| meeting-ended | host | dark | 0 | 1 | 21 | 42 |

## Conditions and limits

- Real local API, ephemeral PostgreSQL 16 and LiveKit 1.9.10
- Deterministic local HTTP fixture, no speech model inference
- 2
- API fake provider returns the literal, no LLM inference
- Browser-generated microphone/camera fixtures
- reduce
- https://fonts.googleapis.com, https://vlibras.gov.br
- Automated axe rules tagged WCAG A/AA, not an assessment of all 55 success criteria.
- One desktop Chromium viewport. No screen reader, human evaluation or physical mobile device.
- Third-party VLibras and external linked resources are outside this run.
- Caption-mode rendering uses simulated ASR and adaptation; no accuracy, latency or comprehension measurement.
- Incomplete results require human review. Repeated rule/node occurrences are not distinct WCAG failures.
