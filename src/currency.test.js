import { fetchRates } from './currency';

beforeEach(() => { localStorage.clear(); global.fetch = jest.fn().mockRejectedValue(new Error('offline')); });

test('expired real currency rates remain available offline', async () => {
  localStorage.setItem('spendsmart_rates_v2', JSON.stringify({ INR: 1, USD: 0.012 }));
  localStorage.setItem('spendsmart_rates_time_v2', '1');
  expect(await fetchRates()).toEqual({ INR: 1, USD: 0.012 });
});

test('a failed refresh does not overwrite real cached rates', async () => {
  localStorage.setItem('spendsmart_rates_v2', JSON.stringify({ INR: 1, USD: 0.012 }));
  global.fetch.mockResolvedValue({ ok: false });
  expect(await fetchRates()).toEqual({ INR: 1, USD: 0.012 });
});

test('no cached conversion is invented offline', async () => {
  expect(await fetchRates()).toBeNull();
});
