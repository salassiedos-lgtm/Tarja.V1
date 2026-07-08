import { Workbook } from 'exceljs';
import { DesconsolidadoImporter } from './desconsolidado.importer';

const HEADERS = [
  'Commission number', 'Container number', 'B/L number', 'Goods name',
  'Number of pieces', 'Weight(kg)', 'Volume(M3)', 'Cargo code', 'Package',
  'Mark', 'Cargo space', 'Operation time', 'Staff', 'license plate number',
  'Part number/\nchassis number', 'brand', 'model', 'damaged', 'Remark',
];

function row(vin: string, container = 'FCIU9513895', bl = 'COSU6502185840 ') {
  return ['', container, bl, 'GENERAL CARGO', '1', '1920', '0', 'C01', 'VEI',
    '', '', '', '', '', vin, 'JMC', 'Grand Vigus', '', ''];
}

async function makeExcel(rows: string[][]): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(HEADERS);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('DesconsolidadoImporter', () => {
  const importer = new DesconsolidadoImporter();

  it('lee el VIN de "Part number/\\nchassis number"', async () => {
    const rows = await importer.parse(await makeExcel([row('LEFEDDE15VTP04723')]));
    expect(rows).toHaveLength(1);
    expect(rows[0].vin).toBe('LEFEDDE15VTP04723');
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings).toEqual([]);
  });

  it('hace trim del BL, que en el archivo real trae un espacio final', async () => {
    const rows = await importer.parse(await makeExcel([row('LEFEDDE15VTP04723')]));
    expect(rows[0].bl).toBe('COSU6502185840');
  });

  it('mapea contenedor, marca, modelo, peso y cantidad', async () => {
    const rows = await importer.parse(await makeExcel([row('LEFEDDE15VTP04723')]));
    expect(rows[0]).toMatchObject({
      containerNumber: 'FCIU9513895',
      brand: 'JMC',
      model: 'Grand Vigus',
      weight: 1920,
      quantity: 1,
    });
  });

  it('advierte (sin error) cuando el digito verificador falla', async () => {
    const rows = await importer.parse(await makeExcel([row('LEFEDDE15VTP04724')]));
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings).toContain('Digito verificador del VIN invalido');
  });

  it('marca error cuando el VIN esta vacio', async () => {
    const rows = await importer.parse(await makeExcel([row('')]));
    expect(rows[0].errors).toContain('VIN vacio');
  });

  it('ignora las filas totalmente vacias', async () => {
    const rows = await importer.parse(await makeExcel([row('LEFEDDE15VTP04723'), []]));
    expect(rows).toHaveLength(1);
  });

  it('rechaza un Excel que no tiene la columna de chasis', async () => {
    const wb = new Workbook();
    wb.addWorksheet('Sheet1').addRow(['Nave', 'VIN', 'BL']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(importer.parse(buf)).rejects.toThrow(/formato Desconsolidado/);
  });
});
