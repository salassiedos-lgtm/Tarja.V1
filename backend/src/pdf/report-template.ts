export interface PdfReport {
  reportCode: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationSeconds: number | null;
  hasDamage: boolean;
  damageSource: string | null;
  damageOperation: string | null;
  damageAffects: string | null;
  damageMoment: string | null;
  damageMomentOther: string | null;
  details: string | null;
  tarjadorInitials: string | null;
  vehicle: { vin: string; chassisNumber: string | null } | null;
  operation: { shipName: string; portDischarge: string | null; code: string } | null;
  billOfLading: { blNumber: string } | null;
  tarjador: { username: string; initials: string | null } | null;
  damages: { description: string }[];
}

export interface PdfAccessoryRow {
  name: string;
  hasAccessory: boolean;
  quantity: number;
}

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtDate(d: Date | null): string {
  if (!d) return '';
  const dt = new Date(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

function box(selected: boolean): string {
  return `<span class="box">${selected ? 'X' : ''}</span>`;
}

function accRow(a: PdfAccessoryRow | undefined): string {
  if (!a) return `<td></td><td class="c"></td><td class="c"></td>`;
  return `<td>${esc(a.name)}</td><td class="c">${a.hasAccessory ? 'SI' : 'NO'}</td><td class="c">${a.hasAccessory ? a.quantity : ''}</td>`;
}

export function renderReportHtml(
  r: PdfReport,
  accessories: PdfAccessoryRow[],
  logoDataUri: string,
): string {
  const left = accessories.slice(0, 8);
  const right = accessories.slice(8, 16);
  const rows: string[] = [];
  for (let i = 0; i < 8; i++) {
    rows.push(`<tr>${accRow(left[i])}${accRow(right[i])}</tr>`);
  }
  const damages =
    r.damages.length > 0
      ? r.damages.map((d) => `<div>• ${esc(d.description)}</div>`).join('')
      : `<div class="muted">Sin observaciones.</div>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; margin: 0; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #333; padding: 3px 5px; vertical-align: middle; }
  .head td { border: none; }
  .title { text-align: center; }
  .title h1 { margin: 0; font-size: 18px; letter-spacing: 1px; }
  .title p { margin: 0; font-style: italic; color: #333; }
  .section { background: #e9edf2; font-weight: bold; text-align: center; }
  .section small { font-weight: normal; font-style: italic; display: block; }
  .lbl { width: 22%; font-weight: bold; }
  .lbl small { font-weight: normal; font-style: italic; display: block; }
  .c { text-align: center; }
  .box { display: inline-block; width: 14px; height: 14px; border: 1px solid #333; text-align: center; line-height: 14px; font-weight: bold; margin-right: 4px; }
  .opt { padding: 3px 5px; }
  .muted { color: #888; }
  .sign { margin-top: 26px; width: 100%; }
  .sign td { border: none; text-align: center; padding-top: 22px; }
  .sign .line { border-top: 1px solid #333; padding-top: 3px; font-size: 9px; }
  .damageblock { min-height: 48px; }
</style></head><body>

<table class="head"><tr>
  <td style="width:170px"><img src="${logoDataUri}" style="width:150px" /></td>
  <td class="title"><h1>UNITS STATE REPORT</h1><p>REPORTE DE ESTADO DE UNIDADES</p></td>
  <td style="width:130px; text-align:right; font-size:9px">Código:<br><b>${esc(r.reportCode)}</b><br>Estado: ${esc(r.status)}</td>
</tr></table>

<table style="margin-top:6px">
  <tr><td class="section" colspan="2">GENERAL INFORMATION<small>DATOS GENERALES</small></td></tr>
  <tr><td class="lbl">Vessel<small>Nave</small></td><td>${esc(r.operation?.shipName)}</td></tr>
  <tr><td class="lbl">Date<small>Fecha</small></td><td>${fmtDate(r.finishedAt ?? r.startedAt)}</td></tr>
  <tr><td class="lbl">Bill of lading or Booking</td><td>${esc(r.billOfLading?.blNumber)}</td></tr>
  <tr><td class="lbl">Port of discharge/loading<small>Puerto de descarga/embarque</small></td><td>${esc(r.operation?.portDischarge ?? 'Chancay')}</td></tr>
  <tr><td class="lbl">Chasis number</td><td>${esc(r.vehicle?.chassisNumber ?? r.vehicle?.vin)}</td></tr>
</table>

<table style="margin-top:6px">
  <tr><th>INVENTORY</th><th class="c">Y/N</th><th class="c">CANT</th><th>INVENTORY</th><th class="c">Y/N</th><th class="c">CANT</th></tr>
  ${rows.join('')}
</table>

<table style="margin-top:6px">
  <tr><td class="section" colspan="4">THERE IS SOME DAMAGE FOUND IT? <small>¿EXISTEN DAÑOS A LA UNIDAD?</small></td></tr>
  <tr>
    <td class="opt" colspan="2">${box(r.hasDamage)} YES / SI</td>
    <td class="opt" colspan="2">${box(!r.hasDamage)} NO</td>
  </tr>
  <tr><td class="section" colspan="4">ORIGEN DEL DAÑO <small>DAMAGE SOURCE</small></td></tr>
  <tr>
    <td class="opt" colspan="2">${box(r.damageSource === 'CAUSADO')} Daño infligido</td>
    <td class="opt" colspan="2">${box(r.damageSource === 'ENCONTRADO')} Daño encontrado</td>
  </tr>
  <tr><td class="section" colspan="4">DAMAGE OCURE AT <small>EL DAÑO FUE DURANTE</small></td></tr>
  <tr>
    <td class="opt">${box(r.damageOperation === 'DESCARGA')} Descarga</td>
    <td class="opt">${box(r.damageOperation === 'EMBARQUE')} Embarque</td>
    <td class="opt">${box(r.damageOperation === 'TRANSITO')} Tránsito</td>
    <td class="opt">${box(r.damageOperation === 'REESTIBA')} Reestiba</td>
  </tr>
  <tr><td class="section" colspan="4">DAMAGE AFFECT TO <small>DAÑO OCASIONADO A</small></td></tr>
  <tr>
    <td class="opt" colspan="2">${box(r.damageAffects === 'CARGA_CHANCAY')} Carga con destino Chancay</td>
    <td class="opt" colspan="2">${box(r.damageAffects === 'CARGA_TRANSITO')} Carga en tránsito</td>
  </tr>
  <tr><td class="section" colspan="4">WHEN HAPPENED THE DAMAGE? <small>¿EN QUÉ MOMENTO SUCEDIÓ EL DAÑO?</small></td></tr>
  <tr>
    <td class="opt" colspan="2">${box(r.damageMoment === 'ANTES_DESCARGA')} Antes de la descarga</td>
    <td class="opt" colspan="2">${box(r.damageMoment === 'ANTES_EMBARQUE')} Antes del embarque</td>
  </tr>
  <tr>
    <td class="opt" colspan="2">${box(r.damageMoment === 'DURANTE_DESCARGA')} Durante la descarga</td>
    <td class="opt" colspan="2">${box(r.damageMoment === 'DURANTE_EMBARQUE')} Durante el embarque</td>
  </tr>
  <tr>
    <td class="opt" colspan="2">${box(r.damageMoment === 'POSTERIOR_DESCARGA')} Posterior a la descarga</td>
    <td class="opt" colspan="2">${box(r.damageMoment === 'OTROS')} Otros: ${esc(r.damageMomentOther)}</td>
  </tr>
  <tr><td class="section" colspan="4">DAMAGE DETAILS <small>DETALLE DE LOS HALLAZGOS O DAÑOS</small></td></tr>
  <tr><td colspan="4" class="damageblock">${damages}${r.details ? `<div style="margin-top:4px">${esc(r.details)}</div>` : ''}</td></tr>
</table>

<table class="sign"><tr>
  <td><div class="line">Ship´s representative</div></td>
  <td><div class="line">Customs Agent / Consignee</div></td>
  <td><div class="line">Port — ${esc(r.tarjador?.initials ?? r.tarjadorInitials)}</div></td>
</tr></table>

</body></html>`;
}
