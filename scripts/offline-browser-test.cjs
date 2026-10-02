// Run against the explicitly enabled local Firebase emulators and a production build.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const output = process.env.PWA_TEST_OUTPUT || '/tmp/spendsmart-offline-evidence';
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
  let page = await context.newPage();
  const errors = [];
  const dialogs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept().catch(() => {}); });
  await page.route('https://pagead2.googlesyndication.com/**', route => route.abort());
  const origin = process.env.PWA_TEST_URL || 'http://127.0.0.1:4173';
  const field = label => page.getByText(label, { exact: true }).locator('..').locator('input');
  async function waitGone(name) { await page.getByRole('button', { name, exact: true }).waitFor({ state: 'hidden', timeout: 15000 }); }
  async function addTx(type, amount, category, note) {
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    await page.getByRole('button', { name: type, exact: true }).click();
    await field('Amount (INR)').fill(String(amount));
    await page.getByRole('button', { name: category, exact: true }).click();
    await field('Note').fill(note);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await waitGone('Save');
  }
  async function reopen() {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('Available / Spendable Balance', { exact: true }).waitFor({ timeout: 15000 });
  }

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.getByText('tap to skip', { exact: true }).click();
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  const email = `offline-${Date.now()}@example.test`;
  await page.getByPlaceholder('Name', { exact: true }).fill('Offline Test');
  await page.getByPlaceholder('Email', { exact: true }).fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill('offlineTest123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.locator('header').getByText('Offline Test', { exact: true }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.screenshot({ path: path.join(output, 'online-home.png') });
  const cacheFiles = await page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('spendsmart-offline-'));
    return (await (await caches.open(names[0])).keys()).map(request => new URL(request.url).pathname);
  });
  assert.ok(cacheFiles.includes('/splash.mp4'));
  assert.ok(cacheFiles.some(file => /main\..*\.js$/.test(file)));
  assert.ok(cacheFiles.some(file => /chunk\.js$/.test(file)));
  console.log('PASS: complete precache and first online login');

  await context.setOffline(true);
  await reopen();
  await page.screenshot({ path: path.join(output, 'offline-empty-home.png') });
  await addTx('Income', 10000, 'Salary', 'Offline salary');
  await addTx('Expense', 120, 'Food', 'Offline lunch');
  await addTx('Refund', 20, 'Food', 'Offline refund');
  await page.getByRole('button', { name: '+ Goal', exact: true }).click();
  await field('Title').fill('Offline Phone');
  await field('Target (INR)').fill('1000');
  await page.getByRole('button', { name: 'Create Goal', exact: true }).click();
  await waitGone('Create Goal');
  for (const amount of [600, 800]) {
    await page.getByRole('button', { name: 'Add money', exact: true }).click();
    await field('Amount (INR)').fill(String(amount));
    await page.getByRole('button', { name: 'Save to Goal', exact: true }).click();
    await waitGone('Save to Goal');
  }
  await page.getByText('₹1000.00 / ₹1000.00', { exact: true }).waitFor();
  console.log('PASS: offline income, expense, refund, goal creation and capped allocations');

  await page.getByRole('button', { name: /Udhar$/, exact: false }).click();
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  await field('Name').fill('Offline Ali');
  await field('Amount (INR)').fill('500');
  await page.getByRole('button', { name: 'Save Udhar', exact: true }).click();
  await waitGone('Save Udhar');
  await page.getByRole('button', { name: 'Wapas mila?', exact: true }).click();
  await field('Amount (INR)').fill('200');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await waitGone('Confirm');
  await page.getByText('₹300.00 remaining', { exact: true }).waitFor();
  console.log('PASS: offline loan creation and return projection');

  await page.getByRole('button', { name: /Budget$/, exact: false }).click();
  await page.getByRole('button', { name: 'Edit Budget', exact: true }).click();
  await page.locator('input[type=number]').fill('15000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitGone('Save');
  await page.getByText('₹15000.00', { exact: true }).waitFor();
  await page.getByTitle('Recurring', { exact: true }).click();
  await field('Amount (INR)').fill('50');
  await page.getByRole('button', { name: 'Food', exact: true }).click();
  const prior = new Date(); prior.setMonth(prior.getMonth() - 1);
  await field('Start date').fill(prior.toISOString().slice(0, 10));
  await field('Note').fill('Offline recurring');
  await page.getByRole('button', { name: 'Save recurring', exact: true }).click();
  await waitGone('Save recurring');
  await page.getByRole('button', { name: 'Home', exact: false }).click();
  await page.getByText('₹8550.00', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'offline-home-with-data.png') });
  await reopen();
  await page.getByText('₹8550.00', { exact: true }).waitFor();
  await page.getByText('₹1000.00 / ₹1000.00', { exact: true }).waitFor();
  console.log('PASS: offline budget, recurring occurrence and persisted data after reload');

  await page.getByRole('button', { name: /History$/, exact: false }).click();
  const row = page.getByText(/Offline lunch$/).locator('../..');
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await field('Amount (INR)').fill('150');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitGone('Save');
  await page.getByText('-₹150.00', { exact: true }).waitFor();
  await page.getByText(/Offline lunch$/).locator('../..').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText(/Offline lunch$/).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: /Home$/, exact: false }).click();
  await page.getByText('₹8670.00', { exact: true }).waitFor();
  console.log('PASS: offline edit and delete');

  const pendingBefore = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('spendsmart_commands_v1_')).length);
  assert.equal(pendingBefore, 3);
  await context.setOffline(false);
  await page.waitForFunction(() => !Object.keys(localStorage).some(key => key.startsWith('spendsmart_commands_v1_')), null, { timeout: 45000 });
  fs.writeFileSync(path.join(output, 'sync-diagnostics.json'), JSON.stringify({ dialogs, body: await page.locator('body').innerText(), journal: await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('spendsmart_writes_v1_')))) }, null, 2));
  await page.getByText('₹8670.00', { exact: true }).waitFor();
  const lookup = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'offlineTest123!', returnSecureToken: true }) }).then(response => response.json());
  const uid = lookup.localId;
  assert.ok(uid, JSON.stringify(lookup));
  const remoteFetch = url => fetch(url, { headers: { Authorization: 'Bearer owner' } });
  const base = `http://127.0.0.1:8080/v1/projects/demo-spendsmart/databases/(default)/documents/users/${uid}`;
  let remote;
  for (let attempt = 0; attempt < 100; attempt++) {
    remote = await remoteFetch(`${base}/transactions`).then(response => response.json());
    if (remote.documents?.length === 7) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(remote.documents?.length, 7, JSON.stringify(remote));
  const records = remote.documents.map(item => item.fields);
  assert.equal(records.filter(item => item.goalId).length, 2);
  assert.equal(records.filter(item => item.udharId).length, 2);
  assert.equal(records.filter(item => item.recurringId).length, 1);
  const savings = await remoteFetch(`${base}/savings`).then(response => response.json());
  assert.equal(Number(savings.documents[0].fields.savedAmount.integerValue || savings.documents[0].fields.savedAmount.doubleValue), 1000);
  const loans = await remoteFetch(`${base}/udhar`).then(response => response.json());
  assert.equal(Number(loans.documents[0].fields.returned.integerValue || loans.documents[0].fields.returned.doubleValue), 200);
  await context.setOffline(true);
  await reopen();
  await page.getByText('₹8670.00', { exact: true }).waitFor();
  await context.setOffline(false);
  await reopen();
  const again = await remoteFetch(`${base}/transactions`).then(response => response.json());
  assert.equal(again.documents.length, 7);
  console.log('PASS: reconnect sync, exact server balances, no duplicate transfers or recurring records');

  // A deleted target must not block an unrelated loan return.
  const loanId = loans.documents[0].name.split('/').pop();
  await context.setOffline(true);
  await page.evaluate(({ uid, loanId }) => {
    const now = new Date();
    for (const command of [
      { id: 'offline_missing_target', type: 'goal', targetId: 'deleted-on-another-device', amount: 10, createdAt: new Date(now.getTime() - 20).toISOString() },
      { id: 'offline_valid_return', type: 'loan', targetId: loanId, amount: 100, createdAt: now.toISOString() },
    ]) {
      command.date = now.toISOString().slice(0, 10);
      localStorage.setItem(`spendsmart_commands_v1_${encodeURIComponent(uid)}:${command.id}`, JSON.stringify(command));
    }
    window.dispatchEvent(new CustomEvent('spendsmart-financial-queue', { detail: uid }));
  }, { uid, loanId });
  await context.setOffline(false);
  await page.waitForFunction(() => !Object.keys(localStorage).some(key => key.startsWith('spendsmart_commands_v1_')), null, { timeout: 20000 });
  await page.getByText('₹8770.00', { exact: true }).waitFor();
  assert.ok(dialogs.some(message => message.includes('pending entry ko cancel')));
  console.log('PASS: deleted target cancellation does not block another financial command');

  // Reject a queued write only after closing its page, so no commit promise can report it.
  await context.setOffline(true);
  await addTx('Expense', 37, 'Food', 'Denied after reopen');
  const originalRules = fs.readFileSync('tests/emulators/firestore.rules', 'utf8');
  const deniedRules = originalRules.replace(
    'allow read, write: if request.auth != null && request.auth.uid == uid;\n      }',
    "allow read: if request.auth != null && request.auth.uid == uid;\n        allow write: if request.auth != null && request.auth.uid == uid && (collection != 'transactions' || request.resource == null || !('note' in request.resource.data) || request.resource.data.note != 'Denied after reopen');\n      }"
  );
  assert.notEqual(deniedRules, originalRules);
  const rulesURL = 'http://127.0.0.1:8080/emulator/v1/projects/demo-spendsmart:securityRules';
  async function setRules(content) {
    const response = await fetch(rulesURL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }) });
    assert.ok(response.ok, await response.text());
  }
  await setRules(deniedRules);
  try {
    await page.close();
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept().catch(() => {}); });
    await page.route('https://pagead2.googlesyndication.com/**', route => route.abort());
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2, null, { timeout: 10000 });
    await page.getByText('tap to skip', { exact: true }).click();
    await page.getByText('Available / Spendable Balance', { exact: true }).waitFor();
    await context.setOffline(false);
    await page.waitForFunction(() => Object.entries(localStorage).some(([key, value]) => key.startsWith('spendsmart_writes_v1_') && JSON.parse(value).data?.note === 'Denied after reopen' && JSON.parse(value).error), null, { timeout: 20000 });
    await page.getByText('₹8770.00', { exact: true }).waitFor();
    assert.ok(dialogs.some(message => message.includes('backup') && message.includes('confirm nahi hua')));
    const remoteAfterDenial = await remoteFetch(`${base}/transactions`).then(response => response.json());
    assert.equal(remoteAfterDenial.documents.length, 8);
    console.log('PASS: offline splash in a new window; rule rejection after reopen is reported and its data backup retained');
  } finally { await setRules(originalRules); }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, email, uid, cacheFiles, dialogs, serverTransactionCount: 8, browserErrors: errors }, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
