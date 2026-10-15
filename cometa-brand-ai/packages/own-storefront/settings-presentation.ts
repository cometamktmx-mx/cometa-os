// Shipping is stored in integer cents. Wholesale amounts already use major units.
export function centsToPesos(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw Error('Importe almacenado inválido.');
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}
export function pesosToCents(value: string): number {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) throw Error('Escribe un importe en pesos con hasta dos decimales.');
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 100000000) throw Error('El importe máximo es 1,000,000.00.');
  return cents;
}
// Do not restrict existing multi-country settings to the demonstration market.
export const countryCodes = ['MX', ...'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ')].filter((code,i,all)=>all.indexOf(code)===i);
export function countryName(code: string): string {
  try { return new Intl.DisplayNames(['es-MX'], {type:'region'}).of(code) ?? code; } catch { return code; }
}
