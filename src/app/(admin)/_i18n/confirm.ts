import type { Section } from './types'

/**
 * Studio strings — the shared confirmation dialog (`<ConfirmSubmit>`) and the
 * typed confirmations for refunds, bans and revokes. Keys `confirm.*`.
 */
const section: Section = {
  en: {
    'confirm.title': 'Are you sure?',
    'confirm.cancel': 'Cancel',
    'confirm.cannot_undo': 'This cannot be undone from here.',
    'confirm.type_to_confirm': 'Type {value} to confirm',
    'confirm.delete_title': 'Delete this for good?',
    'confirm.archive_title': 'Archive this?',
    'confirm.remove_title': 'Remove this?',
    'confirm.revoke_title': 'Revoke access?',
    'confirm.ban_title': 'Ban this?',
    'confirm.err_typed_word': 'Type the confirmation word exactly as shown to continue.',
    'confirm.refund_title': 'Refund this payment through the provider?',
    'confirm.refund_message':
      'The full amount goes back to the customer’s card. The order stays paid by its first payment.',
    'confirm.refund_amount': 'Amount',
    'confirm.refund_order': 'Order number',
    'confirm.refund_type_order': 'Type the order number {value} to confirm',
    'confirm.err_refund_order': 'The order number you typed does not match. Nothing was refunded.',
  },
  ar: {
    'confirm.title': 'هل أنت متأكد؟',
    'confirm.cancel': 'إلغاء الأمر',
    'confirm.cannot_undo': 'لا يمكن التراجع عن هذا من هنا.',
    'confirm.type_to_confirm': 'اكتب {value} للتأكيد',
    'confirm.delete_title': 'حذف نهائي؟',
    'confirm.archive_title': 'أرشفة هذا العنصر؟',
    'confirm.remove_title': 'إزالة هذا العنصر؟',
    'confirm.revoke_title': 'سحب الصلاحية؟',
    'confirm.ban_title': 'حظر؟',
    'confirm.err_typed_word': 'اكتب كلمة التأكيد كما هي تماماً للمتابعة.',
    'confirm.refund_title': 'استرداد هذه الدفعة عبر مزوّد الدفع؟',
    'confirm.refund_message':
      'سيُعاد المبلغ كاملاً إلى بطاقة العميل. يبقى الطلب مدفوعاً بدفعته الأولى.',
    'confirm.refund_amount': 'المبلغ',
    'confirm.refund_order': 'رقم الطلب',
    'confirm.refund_type_order': 'اكتب رقم الطلب {value} للتأكيد',
    'confirm.err_refund_order': 'رقم الطلب الذي كتبته غير مطابق. لم يُسترد أي مبلغ.',
  },
  id: {
    'confirm.title': 'Anda yakin?',
    'confirm.cancel': 'Batal',
    'confirm.cannot_undo': 'Tindakan ini tidak bisa dibatalkan dari sini.',
    'confirm.type_to_confirm': 'Ketik {value} untuk mengonfirmasi',
    'confirm.delete_title': 'Hapus permanen?',
    'confirm.archive_title': 'Arsipkan ini?',
    'confirm.remove_title': 'Hapus ini?',
    'confirm.revoke_title': 'Cabut akses?',
    'confirm.ban_title': 'Blokir ini?',
    'confirm.err_typed_word': 'Ketik kata konfirmasi persis seperti yang ditampilkan.',
    'confirm.refund_title': 'Kembalikan dana pembayaran ini lewat penyedia?',
    'confirm.refund_message':
      'Seluruh jumlah dikembalikan ke kartu pelanggan. Pesanan tetap lunas oleh pembayaran pertamanya.',
    'confirm.refund_amount': 'Jumlah',
    'confirm.refund_order': 'Nomor pesanan',
    'confirm.refund_type_order': 'Ketik nomor pesanan {value} untuk mengonfirmasi',
    'confirm.err_refund_order': 'Nomor pesanan tidak cocok. Tidak ada dana yang dikembalikan.',
  },
}

export default section
