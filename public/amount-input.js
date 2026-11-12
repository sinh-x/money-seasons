// Shared exact amount grammar. Bare numbers are thousands; explicit VND is literal.
export const MAX_AMOUNT = 1_000_000_000_000;
export function parseAmount(input, { required = false } = {}) {
  const source = String(input).trim().toLocaleLowerCase('vi');
  if (!source) {
    if (required) throw new Error('Cần nhập số dư; 0 là một giá trị hợp lệ.');
    return null;
  }
  const match = source.match(/^([0-9][0-9.,]*)(?:\s*(m|tr|triệu|k|ngàn|nghìn|trăm|vnd|đ|đồng))?$/u);
  const fail = () => { throw new Error('Số tiền không hợp lệ. Ví dụ: 500, 5tr, 1,5tr hoặc 5000 VND.'); };
  if (!match) return fail();
  const [, raw, unit = 'k'] = match;
  const scale = { m: 1000000n, tr: 1000000n, triệu: 1000000n, k: 1000n, ngàn: 1000n, nghìn: 1000n, trăm: 100000n, vnd: 1n, đ: 1n, đồng: 1n }[unit];
  let whole, fraction = '';
  if (/^\d+$/.test(raw)) whole = raw;
  else if (/^\d{1,3}([.,])\d{3}(?:\1\d{3})*$/.test(raw)) whole = raw.replace(/[.,]/g, '');
  else {
    const decimal = raw.match(/^(\d+)[.,](\d{1,2})$/);
    if (!decimal) return fail();
    [, whole, fraction] = decimal;
  }
  // Bound before BigInt conversion even for hostile long input.
  if (whole.length > 16) return fail();
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction) * scale;
  if (numerator % denominator) return fail();
  const result = numerator / denominator;
  if (result > BigInt(MAX_AMOUNT)) return fail();
  return Number(result);
}
// Explicit literal unit guarantees that opening an editor never scales saved money again.
export const formatAmountInput = value => value === null ? '' : `${value} VND`;
