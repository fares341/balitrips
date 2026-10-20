/**
 * PDF generation.
 *
 * `gotenberg.ts` is the Chromium client, `templates.ts` the self-contained
 * HTML, `itinerary.ts` the per-version-per-locale documents built at publish
 * time, and `voucher.ts` the per-order document.
 *
 * NOTHING HERE MAY BE CALLED FROM A REQUEST. Every entry point below reaches
 * a Chromium render that peaks around 1.5 GiB on a box with 4 GiB shared with
 * Postgres. Enqueue `pdf.itinerary` instead — see `src/worker/queues.ts`.
 */

export {
  gotenbergHealthy,
  gotenbergUrl,
  renderPdf,
  GotenbergError,
  type PdfMetadata,
  type RenderPdfOptions,
} from './gotenberg'

export {
  generateItineraryDocuments,
  itinerariesMissingDocuments,
  itineraryObjectKey,
  ItineraryDocumentError,
  BRAND,
  type GeneratedDocument,
  type GenerateItineraryOptions,
} from './itinerary'

export {
  generateOrderVoucher,
  presignOrderVoucher,
  loadOrderVoucher,
  voucherObjectKey,
  VoucherError,
  type GeneratedVoucher,
} from './voucher'

export {
  generateOrderInvoice,
  invoiceAvailable,
  invoiceRendered,
  invoiceObjectKey,
  loadOrderInvoice,
  presignOrderInvoice,
  InvoiceError,
  type GeneratedInvoice,
} from './invoice'

export {
  invoicePdfHtml,
  itineraryPdfHtml,
  voucherPdfHtml,
  type InvoicePdfInput,
  type ItineraryPdfDay,
  type ItineraryPdfInput,
  type VoucherPdfInput,
  type VoucherPdfLine,
} from './templates'
