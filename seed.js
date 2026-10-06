'use strict';

// Seed data captured from the live broker-app artifact on 2026-10-06.
// User records are exact copies; transactions/performance for user 1 are exact,
// other users get small deterministic sample histories.

const USERS = [
  {
    id: 1,
    name: 'Ronald Joseph Reyes',
    email: 'ronald@northstar.capital',
    plan: 'Momentum Select',
    status: 'active',
    cash: 877088.97,
    invested: 24860,
    roi: 18.42,
    is_admin: 0,
    created_at: '2026-08-02T00:00:00.000Z',
    updated_at: '2026-10-06T07:26:21.122Z',
  },
  {
    id: 2,
    name: 'Maya Chen',
    email: 'maya@northstar.capital',
    plan: 'Digital Assets',
    status: 'active',
    cash: 1042.8,
    invested: 15340,
    roi: 12.75,
    is_admin: 0,
    created_at: '2026-08-18T00:00:00.000Z',
    updated_at: '2026-10-02T00:00:00.000Z',
  },
  {
    id: 3,
    name: 'Noah Williams',
    email: 'noah@northstar.capital',
    plan: 'Balanced Alpha',
    status: 'review',
    cash: 520,
    invested: 9875,
    roi: -3.18,
    is_admin: 0,
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 4,
    name: 'Zara Okafor',
    email: 'zara@northstar.capital',
    plan: 'Momentum Select',
    status: 'active',
    cash: 6428,
    invested: 32100,
    roi: 23.1,
    is_admin: 0,
    created_at: '2026-09-02T00:00:00.000Z',
    updated_at: '2026-09-30T00:00:00.000Z',
  },
  {
    id: 5,
    name: 'Alex',
    email: 'alex@northstar.capital',
    plan: 'Starter Portfolio',
    status: 'active',
    cash: 0,
    invested: 0,
    roi: 0,
    is_admin: 0,
    created_at: '2026-10-06T07:24:44.127Z',
    updated_at: '2026-10-06T07:24:44.127Z',
  },
  {
    id: 6,
    name: 'Platform Admin',
    email: 'admin@northstar.capital',
    plan: 'Operations',
    status: 'active',
    cash: 0,
    invested: 0,
    roi: 0,
    is_admin: 1,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
];

// Exact transaction history for user 1 (Ronald Joseph Reyes).
const TRANSACTIONS_USER_1 = [
  { type: 'deposit', amount: 2500, note: 'Card deposit', status: 'completed', created_at: '2026-09-24T00:00:00.000Z' },
  { type: 'withdrawal', amount: 1250, note: 'To linked bank', status: 'completed', created_at: '2026-09-28T00:00:00.000Z' },
  { type: 'deposit', amount: 5000, note: 'Bank transfer', status: 'completed', created_at: '2026-10-01T00:00:00.000Z' },
  { type: 'admin_adjustment', amount: 869435.98, note: 'Balance increased by operations', status: 'completed', created_at: '2026-10-06T07:24:37.748Z' },
  { type: 'admin_adjustment', amount: 4788.79, note: 'Balance increased by operations', status: 'completed', created_at: '2026-10-06T07:26:21.122Z' },
];

// Exact performance series for user 1.
const PERFORMANCE_USER_1 = [
  { date: '2026-04-17T00:00:00.000Z', value: 21450 },
  { date: '2026-05-17T00:00:00.000Z', value: 22180 },
  { date: '2026-06-17T00:00:00.000Z', value: 23640 },
  { date: '2026-07-17T00:00:00.000Z', value: 24190 },
  { date: '2026-08-17T00:00:00.000Z', value: 25470 },
  { date: '2026-09-17T00:00:00.000Z', value: 26674 },
  { date: '2026-10-03T00:00:00.000Z', value: 32330.51 },
  { date: '2026-10-06T07:24:37.748Z', value: 901739.39 },
  { date: '2026-10-06T07:26:21.122Z', value: 906528.18 },
];

// Small deterministic sample histories for the other investors.
const SAMPLE_HISTORIES = {
  2: {
    transactions: [
      { type: 'deposit', amount: 15000, note: 'Bank transfer', status: 'completed', created_at: '2026-08-20T00:00:00.000Z' },
      { type: 'withdrawal', amount: 2000, note: 'To linked bank', status: 'completed', created_at: '2026-09-12T00:00:00.000Z' },
      { type: 'deposit', amount: 2500, note: 'Card deposit', status: 'completed', created_at: '2026-10-01T00:00:00.000Z' },
    ],
    performance: [
      { date: '2026-08-18T00:00:00.000Z', value: 15000 },
      { date: '2026-09-01T00:00:00.000Z', value: 16420 },
      { date: '2026-09-18T00:00:00.000Z', value: 15880 },
      { date: '2026-10-02T00:00:00.000Z', value: 18338.65 },
    ],
  },
  3: {
    transactions: [
      { type: 'deposit', amount: 10000, note: 'Bank transfer', status: 'completed', created_at: '2026-09-18T00:00:00.000Z' },
      { type: 'withdrawal', amount: 500, note: 'To linked bank', status: 'completed', created_at: '2026-09-29T00:00:00.000Z' },
    ],
    performance: [
      { date: '2026-09-17T00:00:00.000Z', value: 10000 },
      { date: '2026-09-24T00:00:00.000Z', value: 10420 },
      { date: '2026-10-01T00:00:00.000Z', value: 10080.98 },
    ],
  },
  4: {
    transactions: [
      { type: 'deposit', amount: 30000, note: 'Bank transfer', status: 'completed', created_at: '2026-09-03T00:00:00.000Z' },
      { type: 'deposit', amount: 5000, note: 'Card deposit', status: 'completed', created_at: '2026-09-27T00:00:00.000Z' },
    ],
    performance: [
      { date: '2026-09-02T00:00:00.000Z', value: 30000 },
      { date: '2026-09-15T00:00:00.000Z', value: 36210 },
      { date: '2026-09-30T00:00:00.000Z', value: 45943.1 },
    ],
  },
  5: { transactions: [], performance: [] },
};

module.exports = { USERS, TRANSACTIONS_USER_1, PERFORMANCE_USER_1, SAMPLE_HISTORIES };
