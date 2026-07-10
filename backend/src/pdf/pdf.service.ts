import { Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import {
  renderReportHtml,
  renderReportsDocument,
  type PdfAccessoryRow,
  type PdfReport,
} from './report-template';

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
    return this.htmlToPdf(html);
  }

  /**
   * PDF combinado de todas las tarjas registradas de un lote (operación), una por
   * página, usando el mismo formato que la tarja individual. `damage` filtra por
   * con daños ('1') / sin daños ('0'); sin valor incluye todas.
   */
  async generateOperation(operationId: number, damage?: string): Promise<Buffer> {
    const where: {
      operationId: number;
      status: { in: ('FINALIZADO' | 'CON_DANO')[] };
      hasDamage?: boolean;
    } = { operationId, status: { in: ['FINALIZADO', 'CON_DANO'] } };
    if (damage === '1') where.hasDamage = true;
    else if (damage === '0') where.hasDamage = false;

    const reports = await this.prisma.tarjaReport.findMany({
      where,
      orderBy: { finishedAt: 'asc' },
      include: {
        vehicle: true,
        operation: { include: { ship: true } },
        billOfLading: true,
        tarjador: true,
        accessories: { include: { accessory: true } },
        damages: true,
      },
    });
    if (reports.length === 0) throw new NotFoundException('No hay tarjas para imprimir');

    const catalog = await this.prisma.accessory.findMany({ orderBy: { sortOrder: 'asc' } });
    const items = reports.map((report) => {
      const byId = new Map(report.accessories.map((a) => [a.accessoryId, a]));
      const accessories: PdfAccessoryRow[] = catalog.map((c) => {
        const link = byId.get(c.id);
        return {
          name: c.name,
          hasAccessory: link?.hasAccessory ?? false,
          quantity: link?.quantity ?? 0,
        };
      });
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
      return { report: data as unknown as PdfReport, accessories };
    });

    return this.htmlToPdf(renderReportsDocument(items, this.logoDataUri));
  }

  private async htmlToPdf(html: string): Promise<Buffer> {
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
