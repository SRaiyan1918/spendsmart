export const CURRENCIES = [
  ['INR', '₹', 'Indian Rupee'], ['USD', '$', 'US Dollar'], ['EUR', '€', 'Euro'],
  ['GBP', '£', 'British Pound'], ['JPY', '¥', 'Japanese Yen'], ['AED', 'د.إ', 'UAE Dirham'],
  ['SAR', '﷼', 'Saudi Riyal'], ['CAD', 'C$', 'Canadian Dollar'], ['AUD', 'A$', 'Australian Dollar'],
];

export const symbolOf = code => CURRENCIES.find(row => row[0] === code)?.[1] || '₹';

const API_KEY = process.env.REACT_APP_EXCHANGE_RATE_API_KEY || '932ac721e9d244b340738d9e';

export async function fetchRates() {
  const cacheKey = 'spendsmart_rates_v2';
  const cacheTime = 'spendsmart_rates_time_v2';
  try {
    const last = Number(localStorage.getItem(cacheTime) || 0);
    if (Date.now() - last < 24 * 60 * 60 * 1000) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
    }
    const response = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/INR`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.result !== 'success') return null;
    localStorage.setItem(cacheKey, JSON.stringify(data.conversion_rates));
    localStorage.setItem(cacheTime, String(Date.now()));
    return data.conversion_rates;
  } catch {
    return null;
  }
}
