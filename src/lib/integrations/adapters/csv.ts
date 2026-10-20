import type { SupplierAdapter } from '../adapter'
import { manualAdapter } from './manual'

/**
 * CSV: the supplier sends products, costs and availability as a spreadsheet.
 * Staff upload it in Studio → Integrations → the connection → Import; the
 * rows are previewed against our data (../csv.ts `planImport`) and applied
 * only when someone presses "Apply". There is nothing to pull, so there are
 * no `import*` methods and "Sync now" is not offered.
 *
 * Bookings with a CSV supplier are still made by hand, so those methods are
 * the manual adapter's.
 */
export const csvAdapter: SupplierAdapter = {
  type: 'csv',
  implemented: true,
  createBooking: manualAdapter.createBooking,
  cancelBooking: manualAdapter.cancelBooking,
  getBookingStatus: manualAdapter.getBookingStatus,
}
