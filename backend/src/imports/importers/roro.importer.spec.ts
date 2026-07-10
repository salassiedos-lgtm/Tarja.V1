import { Workbook } from 'exceljs';
import { RoroImporter } from './roro.importer';

/** Excel "CHASIS TRANSBORDO": NRO | B/L | CHASIS NUMBER | TIPO CARGA | BULTOS | TONS | MARCA | ... */
async function makeExcel(): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['NRO', 'B/L', 'CHASIS NUMBER', 'TIPO CARGA', 'BULTOS', 'TONS', 'MARCA', 'DAMAGE', 'BAR CODE', 'ZONA']);
  ws.addRow([1, 'BL-T3', 'LEFEDDE15VTP04723', 'Grand Vigus', 1, 1.5, 'JMC', '', '', 'A1']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('RoroImporter', () => {
  it('mapea el formato CHASIS TRANSBORDO (chasis -> VIN, TONS -> kg)', async () => {
    const rows = await new RoroImporter().parse(await makeExcel());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      vin: 'LEFEDDE15VTP04723',
      bl: 'BL-T3',
      brand: 'JMC',
      model: 'Grand Vigus',
      weight: 1500, // 1.5 TONS -> 1500 kg
      quantity: 1,
      containerNumber: null,
    });
    expect(rows[0].errors).toEqual([]);
  });

  it('rechaza un Excel sin columna CHASIS NUMBER', async () => {
    const wb = new Workbook();
    wb.addWorksheet('H').addRow(['B/L', 'MARCA']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(new RoroImporter().parse(buf)).rejects.toThrow(/RO-RO/);
  });
});
