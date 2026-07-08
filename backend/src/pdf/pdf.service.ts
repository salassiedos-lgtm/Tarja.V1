import { Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { renderReportHtml, type PdfAccessoryRow, type PdfReport } from './report-template';

@Injectable()
export class PdfService {
  private readonly logoDataUri: string;

  constructor(private readonly prisma: PrismaService) {
    let uri = '';
    try {
      const buf = readFileSync(join(process.cwd(), 'assets', 'cosco-logo.png'));
      uri = `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
      uri = '';
    }
    this.logoDataUri = uri;
  }

  async generate(reportId: number): Promise<Buffer> {
    const report = await this.prisma.tarjaReport.findUnique({
      where: { id: reportId },
      include: {
        vehicle: true,
        operation: { include: { ship: true } },
        billOfLading: true,
        tarjador: true,
        accessories: { include: { accessory: true } },
        damages: true,
      },
    });
    if (!report) throw new NotFoundException('Reporte no encontrado');

    const catalog = await this.prisma.accessory.findMany({ orderBy: { sortOrder: 'asc' } });
    const byId = new Map(report.accessories.map((a) => [a.accessoryId, a]));
    const accessories: PdfAccessoryRow[] = catalog.map((c) => {
      const link = byId.get(c.id);
      return {
        name: c.name,
        hasAccessory: link?.hasAccessory ?? false,
        quantity: link?.quantity ?? 0,
      };
    });

    // `operations` ya no guarda `ship_name`: se resuelve por la relacion `ship`.
    const data = {
      ...report,
      operation: report.operation
        ? {
            code: report.operation.code,
            portDischarge: report.operation.portDischarge,
            shipName: report.operation.ship.name,
          }
        : null,
    };

    const html = renderReportHtml(data as unknown as PdfReport, accessories, this.logoDataUri);

    // Carga dinamica: puppeteer es ESM-only; evitamos importarlo al cargar el modulo (tests).
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
