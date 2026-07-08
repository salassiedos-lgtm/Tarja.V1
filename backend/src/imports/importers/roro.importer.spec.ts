import { Workbook } from 'exceljs';
import { RoroImporter } from './roro.importer';

async function makeExcel(): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['Nave', 'VIN', 'BL', 'Cantidad', 'Marca', 'Modelo', 'Peso']);
  ws.addRow(['NAVE T3', 'LEFEDDE15VTP04723', 'BL-T3', 1, 'JMC', 'Grand Vigus', 1500]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('RoroImporter', () => {
  it('mapea el formato legado', async () => {
    const rows = await new RoroImporter().parse(await makeExcel());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      vin: 'LEFEDDE15VTP04723',
      bl: 'BL-T3',
      brand: 'JMC',
      model: 'Grand Vigus',
      weight: 1500,
      quantity: 1,
      containerNumber: null,
    });
    expect(rows[0].errors).toEqual([]);
  });

  it('rechaza un Excel sin columna VIN', async () => {
    const wb = new Workbook();
    wb.addWorksheet('H').addRow(['Container number', 'B/L number']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(new RoroImporter().parse(buf)).rejects.toThrow(/formato RORO/);
  });
});
