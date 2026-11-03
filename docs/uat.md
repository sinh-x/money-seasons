# MS-001 — human UAT checklist (not executed)

This concise checklist accompanies the preserved external r002 `uat-preview.md` (16 scenarios). All **human outcomes are Not run**; automated test groups are not human acceptance. Use only a disposable synthetic environment/profile/store after operator authorization, never an existing household plan or the old3080/3081 services by default. Use a separately supported controlled test clock for future-date examples; never change the host clock or invent financial history.

Record candidate commit, environment, date, expected/observed results and Sinh's decision privately as appropriate. No real names/balances/secrets/screenshots in Git or PA artifacts.

| TS / AC | Synthetic task and expected result | Human status |
|---|---|---|
| 1 | Count default14 months, Nov2026–Dec2027; cross Dec–Jan; try1/120 months and invalid windows. Shorten/move the window: keep every full schedule/history record and include only overlapping occurrences. Preserve valid data and original years. | Not run |
| 2 | Create Person/Group/Category; one expense and income share an object. Rename across tabs/reload. Duplicate names stay distinct; referenced deletion blocked. | Not run |
| 3 | Save named expense/details/schedule with blank amount; reload unknown; change to0. Cancel and confirm deletion; preserve shared object/unrelated income. No actual field. | Not run |
| 4 | Empty/expense-only objects hidden in Income, all in Add picker. Unknown/0/tentative/out-of-summary-month income reveals its object; deleting last income hides only that card. | Not run |
| 5 | Once/monthly/N2/yearly anchoredNovember occurrences; rejectN0/fraction/121. January estimate change preserves prior values and later points; cancel/same-point confirmation; save a full yearly schedule beyond the window (including a schedule longer than120 months), edit past/future entries outside it, and move/shrink/expand the forecast without dropping/re-anchoring schedules or history. Extending a window does not extend routines. | Not run |
| 6 | In plans/cash/debt try5→5000,500→500000,5000/5M/5tr→5000000,5trăm→500000,5ngàn→5000; preview and literal-VND roundtrip. Reject malformed/mixed/negative/exponent/fractional/overflow; blank differs from0. | Not run |
| 7 | Cash snapshots: newest applicable reference date wins, later-entered history doesn't replace a newer date; December never used for November. Invalid/future reject; same-day correction confirms; missing balance unknown. | Not run |
| 8 | VND: NovA3000+B7000−2000→8000; Dec onlyB6000 refresh: staleA3000+B6000−full2000→7000; Jan no refresh→5000. Verify dates/reset/carry/unknown/tentative behavior. | Not run |
| 9 | Separate payable/receivable accounts/history. Backfill/future rejection/0/unknown. Change debt snapshots alone; every cash forecast remains identical. | Not run |
| 10 | Plan repayment1000 expense and collection400 income. Each changes cash once (net−600); no assumed full debt amount, actual record or automatic outstanding-balance change. | Not run |
| 11 | Compare grouped table, selected summary, cards/detail to independent model totals; reference dates, reset/carry, stale/unknown/negative text; edit January cell without rewriting earlier estimates. Collapse each object and full income/expense sections: keep totals visible/unchanged and retain nested group choices when reopening sections. | Not run |
| 12 | Save objects/plans/cash/debt history; another browser/browser clearing/owned restart retains acknowledged state. Inspect owned fault tests and sole-writer/corrupt-store handling; no false save/sample reset. | Not run |
| 13 | Auth denial, shared equal access, cookies/logout/restart/expiry/attempt/origin/CSRF. Operator separately verifies real private HTTPS/ACL allowed and denied devices. Local tests do not certify network access. | Not run |
| 14 | Two clients same revision, saveA then staleB; retainB candidate/form. Export, reload/reapply manually. Lost ack reread before retry; uncertainty never labeled saved. | Not run |
| 15 | Active lossless JSON roundtrip; malformed/oversized/duplicate/dangling/unsupported/cancel unchanged. Legacy original downloaded/retained, original year/IDs/history and conservative mapping reviewed; actual exclusion disclosed/confirmed, no invented account balance. | Not run |
| 16 | All five workspaces/dialogs at320/360/390/768/1440px; contained table scroll/cards; labels, keyboard/Escape/focus/text warnings, retained invalid input. Collapse/expand Income/Expense cards and cash/debt history; test current-view collapse-all/expand-all, keyboard Enter/Space, focus/scroll and announced state. Names/month totals/account balances remain visible, including partial labels. Toggling must not save/change revision/export/forecasts; choices reset on full reload. Review named axe/browser evidence and remaining independent review findings separately. | Not run |

## Acceptance record

- Reviewer / date / candidate: **pending**.
- All16 outcomes and regressions accepted or explicitly dispositioned: **pending**.
- Real private-device access / runtime qualification: **pending operator evidence**.
- Real-data migration: **not performed; separate authorization required**.
- Independent exact-source/FeatureSHA review and native workflow promotion: **not claimed**.
