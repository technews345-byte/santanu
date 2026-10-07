// Install test tooling with: npm install --no-save @firebase/rules-unit-testing
// Run against the demo project's Firestore emulator, never a production project.
const { readFileSync } = require('node:fs');
const { test, before, after, beforeEach } = require('node:test');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, deleteDoc, collection } = require('node:module').createRequire(require.resolve('@firebase/rules-unit-testing'))('firebase/firestore');
let env;
const now = '2026-10-07T00:00:00.000Z';
const account = { id: 'cash', name: 'Cash', type: 'cash', color: '#123456', icon: 'cash', initialBalance: 0, currency: 'INR', archived: 0, sortOrder: 0, createdAt: now, updatedAt: now, deletedAt: null };
const category = { id: 'food', name: 'Food', type: 'expense', color: '#123456', icon: 'restaurant', archived: 0, sortOrder: 0, createdAt: now, updatedAt: now, deletedAt: null };
const transaction = { id: 'expense', type: 'expense', amount: 100, currency: 'INR', accountId: 'cash', toAccountId: null, categoryId: 'food', note: 'Lunch', date: now, attachments: '[]', recurrence: 'none', nextOccurrence: null, createdAt: now, updatedAt: now, deletedAt: null };
const budget = { id: 'food', categoryId: 'food', monthKey: 'recurring', amount: 500, isRecurring: 1, createdAt: now, updatedAt: now, deletedAt: null };
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-spendly-security', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const db = (uid) => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
for (const [table, row] of Object.entries({ accounts: account, categories: category, transactions: transaction, budgets: budget })) {
  test(`${table}: owner can create/read/delete; anonymous and other users cannot`, async () => {
    const path = `users/alice/${table}/${row.id}`;
    await assertSucceeds(setDoc(doc(db('alice'), path), row));
    await assertSucceeds(getDoc(doc(db('alice'), path)));
    for (const who of [null, 'bob']) {
      await assertFails(getDoc(doc(db(who), path)));
      await assertFails(getDocs(collection(db(who), `users/alice/${table}`)));
      await assertFails(setDoc(doc(db(who), path), row));
      await assertFails(deleteDoc(doc(db(who), path)));
    }
    await assertSucceeds(deleteDoc(doc(db('alice'), path)));
  });
}
test('admin routes, unknown collections and spoofed IDs are denied', async () => {
  for (const path of ['admin/settings', 'users/alice/admin/role', 'users/alice/accounts/spoofed']) {
    await assertFails(setDoc(doc(db('alice'), path), account));
  }
});
for (const [name, patch] of Object.entries({ negative: { amount: -1 }, zero: { amount: 0 }, infinite: { amount: Infinity }, nan: { amount: NaN }, huge: { amount: 1e13 }, note: { note: 'x'.repeat(1001) }, admin: { admin: true }, type: { type: 'admin' }, sameAccount: { type: 'transfer', toAccountId: 'cash' } })) {
  test(`reject transaction: ${name}`, async () => {
    await assertFails(setDoc(doc(db('alice'), 'users/alice/transactions/expense'), { ...transaction, ...patch }));
  });
}
test('valid transfers and tombstones remain syncable', async () => {
  await assertSucceeds(setDoc(doc(db('alice'), 'users/alice/transactions/expense'), { ...transaction, type: 'transfer', toAccountId: 'bank', deletedAt: now }));
});
test('reject invalid budgets and injected colors', async () => {
  await assertFails(setDoc(doc(db('alice'), 'users/alice/budgets/food'), { ...budget, monthKey: '2026-99' }));
  await assertFails(setDoc(doc(db('alice'), 'users/alice/categories/food'), { ...category, color: 'red; background:url(https://evil)' }));
});
