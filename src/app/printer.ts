import type { PrinterAdapter, PrinterJob, PrinterResult } from './types';

export class MockPrinterAdapter implements PrinterAdapter {
  async print(job: PrinterJob): Promise<PrinterResult> {
    return {
      jobId: `mock-${job.createdAt}`,
      status: 'simulated',
    };
  }
}

export const printerAdapter = new MockPrinterAdapter();
