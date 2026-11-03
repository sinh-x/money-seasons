// Shared synthetic verification data only. Never reads an existing store/profile.
import { blankPlan } from '../public/model.js';
export function debtFixture() {
  return {
    ...blankPlan('2025-11', '2026-01'),
    accounts: [{ id: 'cash', name: 'Synthetic cash' }],
    snapshots: [{ id: 'cash-snapshot', accountId: 'cash', date: '2025-11-01', amount: 100000 }],
    debtAccounts: [
      { id: 'pay-a', name: 'Synthetic debt A', direction: 'payable' },
      { id: 'pay-b', name: 'Synthetic debt B', direction: 'payable' },
      { id: 'pay-unknown', name: 'Synthetic missing balance', direction: 'payable' },
      { id: 'receive-a', name: 'Synthetic receivable A', direction: 'receivable' },
      { id: 'receive-b', name: 'Synthetic receivable B', direction: 'receivable' }
    ],
    debtSnapshots: [
      { id: 'pa-oct', accountId: 'pay-a', date: '2025-10-01', amount: 10000 },
      { id: 'pa-nov-early', accountId: 'pay-a', date: '2025-11-01', amount: 9000 },
      { id: 'pa-nov-latest', accountId: 'pay-a', date: '2025-11-20', amount: 8000 },
      { id: 'pa-dec', accountId: 'pay-a', date: '2025-12-02', amount: 7000 },
      { id: 'pb-nov', accountId: 'pay-b', date: '2025-11-03', amount: 4000 },
      { id: 'pb-dec-zero', accountId: 'pay-b', date: '2025-12-10', amount: 0 },
      { id: 'ra-nov', accountId: 'receive-a', date: '2025-11-05', amount: 2500 },
      { id: 'ra-dec', accountId: 'receive-a', date: '2025-12-01', amount: 2000 },
      { id: 'rb-dec', accountId: 'receive-b', date: '2025-12-04', amount: 1500 },
      // Entered later, but it must not replace November20 or December2.
      { id: 'pa-nov-backfill', accountId: 'pay-a', date: '2025-11-10', amount: 8500 }
    ]
  };
}
// Independently worked VND: Nov payable=8000+4000; Dec=7000+0.
// Nov receivable=2500+unknown; Dec=2000+1500. Missing payable stays unknown.
export const DEBT_EXPECTED = [
  { month: '2025-11', payable: { known: 12000, missing: 1 }, receivable: { known: 2500, missing: 1 } },
  { month: '2025-12', payable: { known: 7000, missing: 1 }, receivable: { known: 3500, missing: 0 } },
  { month: '2026-01', payable: { known: 7000, missing: 1 }, receivable: { known: 3500, missing: 0 } }
];
