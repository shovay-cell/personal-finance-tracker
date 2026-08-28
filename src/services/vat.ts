import { CurrencyCode } from '@/types';

/**
 * VAT arithmetic for received payments. In Israel an invoice total already
 * includes VAT, so the tax is extracted from the gross amount rather than added
 * on top: 1180 at 18% → 180 VAT and 1000 net. The same split applies to a full
 * payment, a partial payment and an advance alike — money received against a
 * receipt carries its VAT the moment it arrives.
 */
export function vatFromGross(gross: number, ratePercent: number): number {
  if (!Number.isFinite(gross) || gross <= 0 || ratePercent <= 0) return 0;
  return Math.round(((gross * ratePercent) / (100 + ratePercent)) * 100) / 100;
}

export function netFromGross(gross: number, ratePercent: number): number {
  return Math.round((gross - vatFromGross(gross, ratePercent)) * 100) / 100;
}

/** VAT added on top of a net amount — used when a price is quoted without VAT. */
export function vatFromNet(net: number, ratePercent: number): number {
  if (!Number.isFinite(net) || net <= 0 || ratePercent <= 0) return 0;
  return Math.round(((net * ratePercent) / 100) * 100) / 100;
}

export function describeVatSplit(
  gross: number,
  ratePercent: number,
  currency: CurrencyCode
): { vat: number; net: number; currency: CurrencyCode } {
  return { vat: vatFromGross(gross, ratePercent), net: netFromGross(gross, ratePercent), currency };
}
