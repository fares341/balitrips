/**
 * Indonesian text of the policies centre: a faithful translation of the
 * owner's Arabic document (policies-content.tsx, «مركز السياسات», 2 Nov 2026),
 * section by section and clause by clause. It must say exactly what the
 * Arabic says; when the Arabic changes, change this with it. The Arabic text
 * prevails (Terms, clause 12).
 */

import { CookieSettingsButton } from '@/components/analytics/consent-banner'
import { Link } from '@/i18n/routing'

import {
  cookieButtonClass,
  PolicyBody,
  PolicyCta,
  PolicyHero,
  PolicySection,
  PolicyTable,
  type PolicyId,
} from './policies-shell'

const TITLES: Record<PolicyId, string> = {
  terms: 'Syarat dan Ketentuan',
  booking: 'Kebijakan Pemesanan dan Konfirmasi Pesanan',
  cancellation: 'Kebijakan Pembatalan dan Pengembalian Dana',
  digital: 'Kebijakan Itinerari dan Produk Digital',
  payment: 'Kebijakan Pembayaran dan Harga',
  fulfillment: 'Kebijakan Pelaksanaan dan Penyerahan Layanan',
  privacy: 'Kebijakan Privasi dan Perlindungan Data',
  cookies: 'Kebijakan Cookie',
  safety: 'Kebijakan Keselamatan dan Syarat Keikutsertaan Aktivitas',
  complaints: 'Kebijakan Keluhan dan Layanan Pelanggan',
}

const TOP = 'Kembali ke atas'

export function PoliciesContentId() {
  return (
    <>
      <PolicyHero
        eyebrow="Kebijakan platform dan syarat penggunaan"
        title="Pusat Kebijakan"
        lede="Di sini kami kumpulkan semua yang perlu Anda ketahui sebelum dan sesudah membeli atau memesan: apa yang Anda beli, kapan pemesanan Anda menjadi terkonfirmasi, kapan Anda berhak membatalkan dan menerima pengembalian dana, serta bagaimana kami menangani data Anda. Syarat khusus tiap aktivitas selalu ditampilkan di halamannya sebelum pembayaran."
        updated="Terakhir diperbarui: 2 November 2026"
      />
      <PolicyBody tocTitle="Daftar isi" titles={TITLES}>
        <PolicySection id="terms" title={TITLES.terms} backToTop={TOP}>
          <p>
            Selamat datang di platform <strong>Bali Trips</strong> (&quot;platform&quot; atau
            &quot;kami&quot;). Syarat ini mengatur penggunaan Anda atas situs web dan semua layanan
            yang tersedia melaluinya. Dengan menggunakan platform atau menyelesaikan pesanan atau
            pemesanan apa pun, Anda menyatakan telah membaca, memahami, dan menyetujui syarat ini,
            beserta kebijakan terkait yang diterbitkan di Pusat Kebijakan.
          </p>
          <h3>1. Layanan yang disediakan platform</h3>
          <p>Platform menyediakan layanan berikut khusus untuk Pulau Bali:</p>
          <ul>
            <li>
              <strong>Itinerari wisata digital:</strong> program perjalanan siap pakai yang dibeli
              dan diunduh secara elektronik.
            </li>
            <li>
              <strong>Peta wisata interaktif:</strong> peta yang menampilkan tempat dan rekomendasi
              pilihan tim Bali Trips; sebagian gratis dan sebagian memerlukan pembelian.
            </li>
            <li>
              <strong>Pemesanan acara, aktivitas, dan layanan wisata:</strong> seperti tur,
              aktivitas air, petualangan, dan layanan sopir, yang sebagian besar dilaksanakan oleh
              penyedia layanan lokal di Bali.
            </li>
          </ul>
          <h3>2. Kelayakan penggunaan</h3>
          <ul>
            <li>
              Anda harus berusia 18 tahun atau lebih untuk menyelesaikan pembelian atau pemesanan
              apa pun.
            </li>
            <li>
              Saat memesan untuk orang lain, Anda menyatakan berwenang memberikan data mereka dan
              menyetujui syarat ini atas nama mereka, serta bertanggung jawab memberi tahu mereka
              tentang syarat aktivitas.
            </li>
          </ul>
          <h3>3. Akun dan pembayaran sebagai tamu</h3>
          <ul>
            <li>
              Anda dapat membeli dengan membuat akun atau sebagai tamu, sesuai yang disediakan
              halaman pembayaran.
            </li>
            <li>
              Anda bertanggung jawab menjaga kerahasiaan data masuk akun Anda dan atas semua yang
              dilakukan melalui akun tersebut.
            </li>
            <li>
              Anda dapat meminta penutupan akun kapan saja melalui saluran kontak yang tercantum di
              situs.
            </li>
          </ul>
          <h3>4. Kebenaran data</h3>
          <p>
            Anda bertanggung jawab atas kebenaran dan kelengkapan data yang Anda berikan saat
            memesan, termasuk nama, nomor telepon atau WhatsApp, jumlah peserta, usia, dan tempat
            menginap di Bali. Platform tidak bertanggung jawab atas layanan yang tidak dapat
            dilaksanakan, atau atas tidak dapat dihubunginya Anda, karena data yang salah atau tidak
            lengkap yang Anda berikan, dan hal itu tidak menimbulkan pengembalian dana.
          </p>
          <h3>5. Terjadinya pesanan</h3>
          <ul>
            <li>
              Pesanan dianggap diterima saat pembayaran selesai atau bukti transfer diunggah, dan
              dianggap terkonfirmasi sesuai penjelasan dalam{' '}
              <strong>Kebijakan Pemesanan dan Konfirmasi Pesanan</strong>.
            </li>
            <li>
              Sebelum pembayaran ditampilkan semua informasi pokok layanan: deskripsi, harga total,
              tanggal, syarat pembatalan, dan jenis konfirmasi.
            </li>
            <li>Ringkasan pesanan dan fakturnya Anda terima melalui email dan/atau WhatsApp.</li>
          </ul>
          <h3>6. Hubungan dengan penyedia layanan</h3>
          <ul>
            <li>
              Bali Trips bekerja sebagai platform yang menampilkan aktivitas dan layanan wisata
              serta mengatur pemesanannya, sedangkan sebagian besar aktivitas dilaksanakan oleh
              penyedia layanan lokal yang independen (perusahaan operator, pemandu, sopir, dan
              lainnya).
            </li>
            <li>
              Platform menangani: penyajian informasi, penerimaan pemesanan dan pembayaran,
              koordinasi dengan penyedia layanan, pengiriman konfirmasi, serta tindak lanjut pesanan
              dan keluhan Anda sampai selesai.
            </li>
            <li>
              Penyedia layanan menangani: pelaksanaan aktivitas secara nyata, penyediaan peralatan
              dan staf yang kompeten, penerapan standar keselamatan, dan kepatuhan terhadap
              peraturan setempat di Indonesia.
            </li>
            <li>
              Nama penyedia layanan dapat muncul di halaman aktivitas atau dalam konfirmasi,
              tergantung sifat pemesanan. Sebagian syarat aktivitas (seperti usia dan keselamatan)
              berasal dari penyedia layanan dan ditampilkan kepada Anda sebelum pembayaran.
            </li>
          </ul>
          <h3>7. Peta dan rekomendasi</h3>
          <p>
            Peta dan rekomendasi adalah alat bantu perencanaan. Munculnya suatu tempat di peta atau
            dalam itinerari tidak berarti jaminan atas ketersediaannya, mutu layanannya, atau
            tetapnya harga dan jam bukanya. Rinciannya ada dalam{' '}
            <strong>Kebijakan Itinerari dan Produk Digital</strong>.
          </p>
          <h3>8. Penggunaan yang dilarang</h3>
          <p>Anda dilarang:</p>
          <ul>
            <li>
              Menyalin, menerbitkan ulang, atau menjual konten platform, itinerari, atau data peta.
            </li>
            <li>Menggunakan alat otomatis untuk mengambil data dari situs.</li>
            <li>Mencoba mengakses sistem atau akun pengguna tanpa izin.</li>
            <li>
              Memberikan data palsu, membuat pemesanan fiktif, atau menggunakan alat pembayaran yang
              tidak berhak Anda gunakan.
            </li>
            <li>Menggunakan platform untuk tujuan apa pun yang melanggar peraturan.</li>
          </ul>
          <p>
            Kami berhak menangguhkan akun mana pun atau membatalkan pesanan mana pun yang terbukti
            terkait dengan pelanggaran syarat ini.
          </p>
          <h3>9. Kekayaan intelektual</h3>
          <p>
            Seluruh konten platform dimiliki oleh Bali Trips atau dilisensikan kepadanya, dan
            dilindungi oleh peraturan kekayaan intelektual, termasuk: nama dan merek dagang, desain,
            teks, itinerari wisata, foto milik platform, peta yang dirancang khusus, serta kategori
            dan kumpulan. Penggunaan platform atau pembelian darinya tidak memberi Anda hak
            kepemilikan apa pun, melainkan lisensi penggunaan pribadi yang terbatas sesuai{' '}
            <strong>Kebijakan Itinerari dan Produk Digital</strong>.
          </p>
          <h3>10. Batas tanggung jawab</h3>
          <ul>
            <li>
              Platform berupaya dengan saksama dalam memilih penyedia layanan dan memeriksa
              informasi mereka, tetapi tidak bertanggung jawab atas kerugian yang timbul langsung
              dari tindakan penyedia layanan selama pelaksanaan, dari peserta yang melanggar
              petunjuk keselamatan, atau dari keadaan di luar kendali.
            </li>
            <li>
              Platform tidak bertanggung jawab atas kerugian tidak langsung, seperti tertinggal
              penerbangan atau pemesanan hotel yang terkait, kecuali hal itu timbul dari kesalahan
              langsung platform.
            </li>
            <li>
              Dalam segala keadaan, tanggung jawab platform tidak melebihi nilai layanan berbayar
              yang menjadi pokok tuntutan, dalam batas yang diizinkan peraturan.
            </li>
            <li>
              Kami sangat menyarankan Anda memiliki <strong>asuransi perjalanan</strong> yang
              mencakup aktivitas yang ingin Anda ikuti.
            </li>
          </ul>
          <h3>11. Perubahan syarat</h3>
          <p>
            Kami dapat memperbarui syarat ini dari waktu ke waktu, dan tanggal baru diterbitkan di
            bagian atas halaman. Versi yang berlaku pada saat pesanan Anda diselesaikan berlaku
            untuk pesanan tersebut.
          </p>
          <h3>12. Bahasa yang berlaku</h3>
          <p>
            Syarat ini diterbitkan dalam bahasa Arab dan bahasa Inggris. Jika ada pertentangan di
            antara keduanya, teks bahasa Arab yang berlaku.
          </p>
          <h3>13. Hukum yang berlaku</h3>
          <p>Syarat ini tunduk pada dan ditafsirkan sesuai peraturan Kerajaan Arab Saudi.</p>
        </PolicySection>

        <PolicySection id="booking" title={TITLES.booking} backToTop={TOP}>
          <p>
            Kebijakan ini menjelaskan bagaimana pesanan Anda berubah dari pemesanan yang sudah
            dibayar menjadi aktivitas yang terkonfirmasi, dan perbedaan penting antara{' '}
            <strong>selesainya pembayaran</strong> dan <strong>konfirmasi ketersediaan</strong>.
          </p>
          <h3>1. Jenis konfirmasi</h3>
          <p>Setiap aktivitas di halamannya memiliki salah satu dari dua jenis konfirmasi:</p>
          <ul>
            <li>
              <strong>Konfirmasi instan (Instant Confirmation):</strong> pemesanan menjadi
              terkonfirmasi langsung setelah pembayaran berhasil.
            </li>
            <li>
              <strong>Sesuai ketersediaan (Subject to Availability):</strong> pemesanan dikirim ke
              penyedia layanan untuk memeriksa ketersediaan, dan Anda menerima konfirmasi atau
              permohonan maaf paling lambat 24 jam sejak pesanan diterima.
            </li>
          </ul>
          <h3>2. Status pesanan</h3>
          <PolicyTable
            head={['Status', 'Arti']}
            rows={[
              [
                <strong key="s">Menunggu pembayaran / transfer</strong>,
                'Pesanan sudah dibuat dan pembayaran belum selesai, atau transfer bank belum diverifikasi.',
              ],
              [
                <strong key="s">Sedang ditinjau</strong>,
                'Pembayaran selesai, dan pemesanan menunggu konfirmasi penyedia layanan.',
              ],
              [
                <strong key="s">Terkonfirmasi</strong>,
                'Ketersediaan sudah dikonfirmasi, dan voucher pemesanan sudah dikirim kepada Anda.',
              ],
              [<strong key="s">Selesai</strong>, 'Aktivitas sudah dilaksanakan.'],
              [
                <strong key="s">Dibatalkan</strong>,
                'Pemesanan dibatalkan oleh Anda, oleh platform, atau oleh penyedia layanan.',
              ],
              [
                <strong key="s">Dana dikembalikan</strong>,
                'Dana sudah dikembalikan dalam keadaan yang berhak sesuai Kebijakan Pembatalan dan Pengembalian Dana.',
              ],
            ]}
          />
          <p>
            <strong>Penting:</strong> pemesanan berstatus &quot;Sedang ditinjau&quot; belum
            merupakan pemesanan yang terkonfirmasi. Kami menyarankan Anda tidak mengaitkan
            pengaturan lain yang tidak dapat dibatalkan dengannya sebelum konfirmasi tiba.
          </p>
          <h3>3. Jika aktivitas tidak tersedia</h3>
          <p>
            Jika penyedia layanan menolak atau aktivitas sudah penuh, kami menawarkan salah satu
            pilihan berikut kepada Anda:
          </p>
          <ol>
            <li>Jadwal pengganti untuk aktivitas yang sama.</li>
            <li>Aktivitas pengganti yang serupa.</li>
            <li>Pengembalian penuh dana yang sudah dibayar.</li>
          </ol>
          <h3>4. Voucher pemesanan</h3>
          <p>
            Setelah konfirmasi, Anda menerima voucher melalui email dan/atau WhatsApp, dan voucher
            itu muncul di halaman &quot;Perjalanan Saya&quot;. Voucher memuat: nomor pemesanan,
            aktivitas dan paket, tanggal dan waktu, jumlah peserta, titik kumpul atau alamat
            penjemputan, nomor kontak pada hari aktivitas, dan petunjuk khusus apa pun. Anda wajib
            menunjukkan voucher (elektronik atau cetak) saat hadir.
          </p>
          <h3>5. Waktu dan tempat berkumpul</h3>
          <ul>
            <li>
              Anda wajib hadir di titik kumpul atau berada di tempat penjemputan paling lambat 15
              menit sebelum waktu yang ditentukan.
            </li>
            <li>
              Jika aktivitas mencakup penjemputan dari hotel, Anda bertanggung jawab memasukkan
              alamat menginap yang benar dan berada di lobi hotel pada waktu yang ditentukan.
            </li>
            <li>
              Keterlambatan dapat mengakibatkan Anda tidak dapat ikut serta, dan diperlakukan
              sebagai ketidakhadiran tanpa pengembalian dana.
            </li>
          </ul>
          <h3>6. Mengubah pemesanan</h3>
          <ul>
            <li>
              <strong>Menambah jumlah orang:</strong> dimungkinkan sesuai ketersediaan dengan
              membayar selisihnya.
            </li>
            <li>
              <strong>Mengurangi jumlah orang:</strong> tidak menimbulkan pengembalian dana setelah
              batas waktu pembatalan berakhir.
            </li>
            <li>
              <strong>Mengubah tanggal atau waktu:</strong> permintaan diajukan melalui halaman
              &quot;Perjalanan Saya&quot; atau saluran kontak, dan bergantung pada ketersediaan
              jadwal baru serta persetujuan penyedia layanan; dapat menimbulkan selisih harga atau
              biaya yang ditentukan penyedia layanan. Jika perubahan tidak dapat dilakukan,
              pemesanan tetap pada jadwal semula.
            </li>
            <li>Perubahan baru berlaku setelah dikonfirmasi kepada Anda secara tertulis.</li>
          </ul>
          <h3>7. Pemesanan untuk rombongan</h3>
          <p>
            Orang yang menyelesaikan pemesanan dianggap mewakili semua peserta, dan wajib memberi
            tahu mereka tentang konfirmasi, petunjuk, dan syarat keselamatan.
          </p>
        </PolicySection>

        <PolicySection id="cancellation" title={TITLES.cancellation} backToTop={TOP}>
          <p>
            Bali Trips berkomitmen memesan aktivitas dan membayar penyedia layanan di Bali segera
            setelah pesanan Anda dikonfirmasi, dan dana itu tidak dapat ditarik kembali dari mereka
            sesudahnya. Karena itu, mohon periksa rincian aktivitas, tanggal, dan jumlah orang
            dengan saksama sebelum menyelesaikan pembayaran.
          </p>
          <h3>1. Aturan umum</h3>
          <p>
            Semua pemesanan <strong>tidak dapat dibatalkan atau dikembalikan dananya</strong>{' '}
            setelah batas waktu pembatalan yang dijelaskan di bawah berakhir.
          </p>
          <h3>2. Batas waktu pembatalan gratis</h3>
          <p>
            Anda dapat membatalkan pemesanan dan menerima pengembalian dana penuh jika mengajukan
            permintaan pembatalan <strong>paling lambat satu jam sebelum waktu aktivitas</strong>,
            kecuali halaman aktivitas menyebutkan batas waktu yang berbeda untuknya. Permintaan
            pembatalan diajukan melalui halaman &quot;Perjalanan Saya&quot; atau saluran kontak
            resmi, dan waktunya dihitung sejak kami menerimanya.
          </p>
          <p>
            Setelah batas waktu ini berakhir, pemesanan menjadi final, dan dana tidak dikembalikan
            dalam keadaan berikut:
          </p>
          <ul>
            <li>Pembatalan dari pihak pelanggan dengan alasan apa pun.</li>
            <li>Tidak hadir atau terlambat dari waktu berkumpul atau penjemputan.</li>
            <li>Pengurangan jumlah peserta.</li>
            <li>
              Salah satu peserta tidak memenuhi syarat keselamatan atau keikutsertaan yang sudah
              diumumkan sebelumnya (seperti usia, berat badan, atau kondisi kesehatan).
            </li>
            <li>
              Keadaan pribadi, seperti sakit, perubahan jadwal penerbangan, atau perubahan rencana
              perjalanan.
            </li>
            <li>Tidak menggunakan sebagian layanan setelah layanan dimulai.</li>
          </ul>
          <p>
            Karena itu kami menyarankan Anda memiliki asuransi perjalanan yang mencakup pembatalan
            aktivitas.
          </p>
          <h3>3. Pembatalan dari pihak penyedia layanan atau platform</h3>
          <p>
            Jika aktivitas dibatalkan oleh penyedia layanan atau platform karena sebab yang bukan
            dari Anda, Anda berhak memilih antara:
          </p>
          <ol>
            <li>
              <strong>Jadwal pengganti</strong> untuk aktivitas yang sama tanpa biaya tambahan.
            </li>
            <li>
              <strong>Aktivitas pengganti</strong> yang serupa.
            </li>
            <li>
              <strong>Pengembalian penuh</strong> dana yang dibayar untuk aktivitas tersebut.
            </li>
          </ol>
          <h3>4. Cuaca, keselamatan, dan keadaan kahar</h3>
          <ul>
            <li>
              Penyedia layanan berhak menghentikan atau menunda aktivitas jika kondisi cuaca, laut,
              atau kondisi operasional apa pun membuat pelaksanaannya tidak aman, dan keputusannya
              dalam hal itu bersifat final demi keselamatan Anda.
            </li>
            <li>
              <strong>Keadaan kahar</strong> mencakup setiap keadaan di luar kehendak para pihak
              yang menghalangi pelaksanaan aktivitas secara aman, antara lain: cuaca berbahaya,
              bencana alam, aktivitas gunung berapi dan gempa bumi, penutupan atau keputusan
              pemerintah, wabah, terhentinya transportasi umum, kerusuhan, dan kejadian besar.
            </li>
            <li>
              Jika aktivitas dibatalkan karena salah satu sebab ini <strong>sebelum dimulai</strong>
              , kami menawarkan jadwal pengganti atau aktivitas pengganti, dan jika itu tidak
              memungkinkan, dana dikembalikan kepada Anda.
            </li>
            <li>
              Jika aktivitas terhenti <strong>setelah dimulai</strong> karena alasan keselamatan,
              dana tidak dikembalikan.
            </li>
          </ul>
          <h3>5. Produk digital</h3>
          <p>
            Itinerari wisata dan akses ke peta lengkap tidak dapat dikembalikan dananya setelah
            diserahkan, sesuai <strong>Kebijakan Itinerari dan Produk Digital</strong>.
          </p>
          <h3>6. Keadaan ketika dana dikembalikan</h3>
          <p>Selain yang disebutkan di atas, dana dikembalikan hanya dalam keadaan berikut:</p>
          <ul>
            <li>
              <strong>Pembayaran ganda karena kekeliruan:</strong> jumlah yang ganda dikembalikan
              penuh setelah diverifikasi.
            </li>
            <li>
              <strong>Dana terpotong tanpa pemesanan dibuat:</strong> dana dikembalikan penuh atau
              pemesanan dikonfirmasi.
            </li>
            <li>
              <strong>Layanan tidak dapat dilaksanakan karena sebab dari platform:</strong> dana
              dikembalikan penuh.
            </li>
          </ul>
          <h3>7. Cara dan jangka waktu pengembalian dana</h3>
          <ul>
            <li>
              Dana dikembalikan ke alat pembayaran semula bilamana memungkinkan; untuk transfer
              bank, dana dikembalikan ke rekening asal transfer.
            </li>
            <li>
              Kami memulai proses pengembalian dana dalam 5 hari kerja sejak disetujui, dan
              munculnya dana di rekening Anda dapat memakan waktu 5 sampai 14 hari kerja, tergantung
              bank atau penerbit kartu.
            </li>
            <li>Biaya transfer bank yang dikenakan bank tidak dikendalikan oleh platform.</li>
          </ul>
          <h3>8. Hak menurut peraturan</h3>
          <p>Kebijakan ini tidak mengurangi hak apa pun yang ditetapkan peraturan bagi konsumen.</p>
        </PolicySection>

        <PolicySection id="digital" title={TITLES.digital} backToTop={TOP}>
          <p>
            Kebijakan ini mengatur pembelian dan penggunaan produk digital di Bali Trips:{' '}
            <strong>itinerari wisata siap pakai</strong> dan{' '}
            <strong>akses ke peta interaktif lengkap</strong>.
          </p>
          <h3>1. Apa isi itinerari wisata?</h3>
          <p>
            Setiap itinerari adalah program perjalanan untuk jumlah hari tertentu, dan mencakup,
            sesuai itinerarinya: rencana harian yang disarankan, tempat dan aktivitas yang
            direkomendasikan, rekomendasi restoran dan kafe, tautan lokasi di peta, serta kiat
            praktis untuk transportasi dan pengaturan waktu. Isi tiap itinerari, jumlah harinya, dan
            wilayah yang dicakupnya dijelaskan di halamannya sebelum pembelian.
          </p>
          <h3>2. Penerimaan</h3>
          <ul>
            <li>
              Itinerari tersedia untuk diunduh <strong>segera setelah pembayaran berhasil</strong>;
              tautan unduhan dikirim ke email dan/atau WhatsApp Anda, dan tetap tersedia di halaman
              &quot;Perjalanan Saya&quot; bagi yang memiliki akun.
            </li>
            <li>
              Untuk pembayaran dengan transfer bank, itinerari tersedia setelah transfer
              diverifikasi.
            </li>
            <li>Anda dapat meminta berkas dikirim ulang kapan saja melalui saluran kontak.</li>
          </ul>
          <h3>3. Masalah pengunduhan</h3>
          <p>
            Jika berkas tidak sampai kepada Anda, rusak, atau tidak sesuai dengan itinerari yang
            Anda beli, hubungi kami dan kami akan mengirim versi yang benar. Jika masalah tidak
            dapat diselesaikan, kami mengembalikan dana Anda sepenuhnya.
          </p>
          <h3>4. Akses ke peta lengkap</h3>
          <ul>
            <li>
              Sebagian peta tersedia gratis, sedangkan wilayah lainnya memerlukan pembelian akses
              lengkap.
            </li>
            <li>
              Akses terkait dengan akun Anda atau nomor pesanan, dan berlangsung selama jangka waktu
              yang dijelaskan saat pembelian.
            </li>
            <li>
              Akses bersifat pribadi, dan data masuk tidak boleh dibagikan kepada orang lain. Kami
              berhak membatasi akses bila terdeteksi penggunaan yang tidak wajar.
            </li>
          </ul>
          <h3>5. Pengembalian dana</h3>
          <ul>
            <li>
              Produk digital diserahkan seketika dan tidak dapat dikembalikan, karena itu{' '}
              <strong>
                harga itinerari tidak dikembalikan setelah diunduh atau dibuka, begitu pula harga
                peta setelah akses lengkap diaktifkan
              </strong>
              .
            </li>
            <li>
              Dana dikembalikan hanya jika produk tidak sampai kepada Anda dan kami tidak dapat
              menyampaikannya, atau dana terpotong lebih dari satu kali.
            </li>
          </ul>
          <h3>6. Penggunaan pribadi dan kekayaan intelektual</h3>
          <ul>
            <li>
              Saat membeli, Anda diberi lisensi pribadi, non-eksklusif, dan tidak dapat dialihkan
              untuk menggunakan itinerari atau peta bagi perjalanan Anda dan pendamping Anda.
            </li>
            <li>
              Dilarang menjual kembali itinerari, menerbitkannya, membagikannya secara terbuka, atau
              mengunggahnya ke situs atau grup mana pun; dilarang pula menyalin data peta atau
              memotretnya secara sistematis dengan tujuan menerbitkannya ulang.
            </li>
            <li>Kami berhak mengambil tindakan hukum bila hal itu dilanggar.</li>
          </ul>
          <h3>7. Ketepatan informasi dan rekomendasi</h3>
          <ul>
            <li>
              Itinerari dan peta mencerminkan informasi dan rekomendasi yang tersedia{' '}
              <strong>pada saat disusun atau terakhir diperbarui</strong>.
            </li>
            <li>
              Jam buka, harga, dan alamat tempat dapat berubah, dan sebagian dapat tutup; biaya
              transportasi dan jadwal acara juga dapat berubah.
            </li>
            <li>
              Munculnya suatu tempat di peta atau dalam itinerari berarti tempat itu rekomendasi tim
              kami, bukan jaminan atas ketersediaannya atau mutu layanannya. Mohon periksa informasi
              penting (seperti reservasi dan jam buka) sebelum berangkat.
            </li>
            <li>
              Anda dapat memberi tahu kami tentang informasi yang tidak tepat, dan kami akan
              meninjau serta memperbaruinya.
            </li>
          </ul>
          <h3>8. Lokasi geografis</h3>
          <p>
            Saat Anda menggunakan fitur &quot;Tempat di dekat saya&quot;, peta meminta izin Anda
            untuk mengakses lokasi Anda. Kami tidak mengakses lokasi Anda tanpa persetujuan Anda,
            dan Anda dapat mencabutnya kapan saja dari pengaturan peramban atau perangkat.
            Rinciannya ada dalam <strong>Kebijakan Privasi</strong>.
          </p>
        </PolicySection>

        <PolicySection id="payment" title={TITLES.payment} backToTop={TOP}>
          <h3>1. Mata uang</h3>
          <p>
            <strong>
              Pembayaran dalam riyal Saudi, dan harga ditampilkan dalam mata uang negara Anda
              sebagai perkiraan.
            </strong>{' '}
            Dana selalu dipotong dari kartu Anda dalam riyal Saudi (SAR), dan jumlah pasti dalam
            riyal ditampilkan kepada Anda sebelum pembayaran dikonfirmasi. Adapun harga yang
            ditampilkan dalam mata uang negara Anda bersifat perkiraan, hanya sebagai panduan. Jika
            Anda membayar dengan kartu yang diterbitkan dalam mata uang lain, bank penerbit kartu
            Anda dapat mengenakan selisih kurs atau biaya internasional yang tidak ada kaitannya
            dengan platform.
          </p>
          <h3>2. Harga total</h3>
          <p>
            Ringkasan pesanan sebelum pembayaran menampilkan harga total secara terperinci: harga
            dasar aktivitas atau paket, tambahan yang dipilih (seperti sopir atau layanan tambahan),
            diskon, serta pajak atau biaya jika ada. Tidak ada biaya yang ditambahkan tanpa
            ditampilkan kepada Anda sebelum pembayaran dikonfirmasi.
          </p>
          <h3>3. Yang tidak termasuk dalam harga</h3>
          <p>
            Kecuali disebutkan dengan jelas di halaman aktivitas pada bagian &quot;Yang termasuk
            dalam harga&quot;, harga tidak mencakup: biaya masuk lokasi, makanan, tip, pengeluaran
            pribadi, dan asuransi.
          </p>
          <h3>4. Cara pembayaran</h3>
          <ul>
            <li>
              <strong>Pembayaran elektronik</strong> melalui gerbang pembayaran berlisensi, dengan
              cara pembayaran yang tersedia di halaman pembayaran.
            </li>
            <li>
              <strong>Transfer bank</strong> ke rekening platform yang tercantum di halaman
              pembayaran.
            </li>
          </ul>
          <p>
            Kami tidak menyimpan data kartu Anda di server kami; data itu diproses sepenuhnya
            melalui gerbang pembayaran sesuai standar keamanan pembayaran.
          </p>
          <h3>5. Pembayaran dengan transfer bank</h3>
          <ul>
            <li>
              Transfer harus diselesaikan dan bukti diunggah dalam 24 jam sejak pesanan dibuat.
            </li>
            <li>
              Pesanan tetap berstatus &quot;Menunggu transfer&quot; sampai diverifikasi, dan kursi
              atau jadwal belum dipesan secara final sebelum itu.
            </li>
            <li>
              Jika transfer tidak sampai dalam batas waktu, pesanan dapat dibatalkan otomatis. Jika
              transfer sampai setelah pembatalan, kami memesan ulang layanan bila tersedia atau
              mengembalikan dana.
            </li>
            <li>
              Jumlah yang ditransfer harus sama dengan total pesanan, dan pelanggan menanggung biaya
              transfer apa pun yang dikenakan banknya.
            </li>
          </ul>
          <h3>6. Diskon dan kode diskon</h3>
          <ul>
            <li>
              Setiap kode diskon memiliki syaratnya sendiri (masa berlaku, batas minimum pesanan,
              dan aktivitas yang tercakup), dan tidak boleh menggabungkan lebih dari satu kode
              kecuali disebutkan lain.
            </li>
            <li>
              Kode tidak dapat ditukar dengan uang tunai, dan tidak diterapkan secara surut pada
              pesanan sebelumnya.
            </li>
          </ul>
          <h3>7. Perubahan harga</h3>
          <p>
            Harga aktivitas dan itinerari dapat berubah kapan saja, tetapi harga yang dikonfirmasi
            saat pembayaran tidak berubah untuk pesanan Anda. Jika muncul harga yang jelas keliru
            karena kesalahan teknis, kami memberi tahu Anda dan menawarkan untuk menyelesaikan
            pesanan dengan harga yang benar atau membatalkannya dan mengembalikan dana.
          </p>
          <h3>8. Masalah pembayaran</h3>
          <ul>
            <li>
              <strong>Pembayaran gagal:</strong> pemesanan tidak dibuat, dan dana yang tertahan
              dikembalikan bank secara otomatis dalam jangka waktu yang lazim padanya.
            </li>
            <li>
              <strong>Dana terpotong dan pemesanan tidak muncul:</strong> hubungi kami dengan nomor
              transaksi atau gambar pemberitahuan pemotongan, dan kami akan memeriksa lalu
              mengonfirmasi pemesanan atau mengembalikan dana.
            </li>
            <li>
              <strong>Pembayaran ganda:</strong> jumlah yang ganda dikembalikan penuh setelah
              diverifikasi.
            </li>
          </ul>
          <h3>9. Faktur</h3>
          <p>
            Anda menerima faktur elektronik pesanan melalui email, dan faktur itu tersedia di
            halaman &quot;Perjalanan Saya&quot;.
          </p>
          <h3>10. Pengembalian dana</h3>
          <p>
            Pengembalian dana dilakukan hanya dalam keadaan yang berhak, sesuai{' '}
            <strong>Kebijakan Pembatalan dan Pengembalian Dana</strong>.
          </p>
        </PolicySection>

        <PolicySection id="fulfillment" title={TITLES.fulfillment} backToTop={TOP}>
          <p>
            Bali Trips tidak mengirim produk fisik, karena itu kebijakan ini menjelaskan bagaimana
            dan kapan layanan digital diserahkan dan aktivitas dilaksanakan.
          </p>
          <h3>1. Itinerari wisata digital</h3>
          <ul>
            <li>
              Diserahkan segera setelah pembayaran berhasil melalui tautan unduhan yang dikirim
              lewat email dan/atau WhatsApp, dan tetap tersedia di halaman &quot;Perjalanan
              Saya&quot;.
            </li>
            <li>Untuk transfer bank, diserahkan setelah transfer diverifikasi.</li>
          </ul>
          <h3>2. Akses ke peta lengkap</h3>
          <p>Diaktifkan segera setelah pembayaran berhasil pada akun atau nomor pesanan.</p>
          <h3>3. Acara dan aktivitas</h3>
          <ul>
            <li>
              <strong>Konfirmasi:</strong> instan atau dalam 24 jam sesuai jenis konfirmasi
              aktivitas, sebagaimana dijelaskan dalam{' '}
              <strong>Kebijakan Pemesanan dan Konfirmasi Pesanan</strong>.
            </li>
            <li>
              <strong>Voucher:</strong> dikirim setelah konfirmasi, dan memuat semua rincian
              kehadiran.
            </li>
            <li>
              <strong>Sebelum aktivitas:</strong> penyedia layanan atau tim kami dapat menghubungi
              Anda melalui WhatsApp sebelum jadwal untuk memastikan waktu penjemputan atau
              berkumpul.
            </li>
            <li>
              <strong>Pelaksanaan:</strong> dilakukan oleh penyedia layanan pada tanggal dan waktu
              yang tercantum di voucher, sesuai deskripsi aktivitas dan apa yang dicakupnya.
            </li>
          </ul>
          <h3>4. Layanan sopir</h3>
          <ul>
            <li>
              Mobil yang sesuai ditentukan otomatis menurut jumlah penumpang, dan jumlah jam layanan
              serta cakupannya dijelaskan dalam pesanan.
            </li>
            <li>
              Layanan dimulai dari tempat penjemputan yang ditentukan dalam pemesanan; jam tambahan
              atau wilayah di luar cakupan dapat dikenai biaya tambahan yang disepakati sebelumnya.
            </li>
            <li>Biaya masuk lokasi, makanan, dan parkir tidak termasuk kecuali disebutkan lain.</li>
          </ul>
          <h3>5. Keterlambatan pelaksanaan</h3>
          <p>
            Jika pelaksanaan layanan terlambat dari jadwal yang disepakati karena sebab dari
            platform atau penyedia layanan, kami segera memberi tahu Anda dan menawarkan jadwal
            pengganti atau pengembalian dana.
          </p>
          <h3>6. Tanggung jawab pelanggan</h3>
          <p>
            Pelanggan wajib memberikan data kontak yang benar, membalas pesan konfirmasi, berada di
            tempat dan pada waktu yang ditentukan, serta mematuhi petunjuk penyedia layanan.
          </p>
        </PolicySection>

        <PolicySection id="privacy" title={TITLES.privacy} backToTop={TOP}>
          <p>
            Di Bali Trips kami berkomitmen melindungi data pribadi Anda dan memprosesnya sesuai
            Undang-Undang Perlindungan Data Pribadi, peraturan pelaksanaannya, dan praktik terbaik.
            Kebijakan ini menjelaskan data yang kami kumpulkan, tujuannya, cara penggunaan dan
            pembagiannya, serta hak Anda.
          </p>
          <h3>1. Data yang kami kumpulkan</h3>
          <ul>
            <li>
              <strong>Data identitas dan kontak:</strong> nama, nomor telepon atau WhatsApp, dan
              email.
            </li>
            <li>
              <strong>Data pemesanan:</strong> aktivitas yang dipesan, tanggal, jumlah pelancong,
              tempat menginap di Bali, dan catatan khusus.
            </li>
            <li>
              <strong>Data kelayakan keikutsertaan (hanya bila diperlukan):</strong> usia, atau
              berat badan, atau pernyataan tidak adanya halangan kesehatan, hanya untuk aktivitas
              yang mensyaratkannya.
            </li>
            <li>
              <strong>Data pembayaran:</strong> data kartu diproses langsung oleh gerbang
              pembayaran, dan kami tidak menyimpannya. Kami hanya menyimpan referensi transaksi dan
              statusnya, serta bukti transfer untuk transfer bank.
            </li>
            <li>
              <strong>Lokasi geografis:</strong> hanya dengan persetujuan Anda untuk menggunakan
              fitur tempat terdekat di peta, dan kami tidak menyimpannya secara permanen.
            </li>
            <li>
              <strong>Data penggunaan teknis:</strong> jenis perangkat dan peramban, halaman yang
              Anda kunjungi, dan cookie, sesuai <strong>Kebijakan Cookie</strong>.
            </li>
          </ul>
          <h3>2. Tujuan pemrosesan dan dasar hukum</h3>
          <PolicyTable
            head={['Tujuan', 'Dasar hukum']}
            rows={[
              [
                'Melaksanakan pesanan dan pemesanan serta mengirim konfirmasi dan berkas',
                'Pelaksanaan kontrak dengan Anda',
              ],
              [
                'Menghubungi Anda terkait pemesanan (WhatsApp, email, telepon)',
                'Pelaksanaan kontrak',
              ],
              [
                'Memeriksa kelayakan keikutsertaan dalam aktivitas',
                'Pelaksanaan kontrak dan perlindungan keselamatan Anda',
              ],
              [
                'Memproses pembayaran dan mencegah penipuan',
                'Pelaksanaan kontrak dan kepentingan yang sah',
              ],
              ['Layanan pelanggan dan penanganan keluhan', 'Pelaksanaan kontrak'],
              ['Kewajiban akuntansi dan hukum', 'Kewajiban hukum'],
              [
                'Peningkatan situs dan analitik',
                'Kepentingan yang sah / persetujuan Anda atas cookie',
              ],
              [
                'Pesan pemasaran dan penawaran',
                'Persetujuan Anda, yang dapat Anda cabut kapan saja',
              ],
            ]}
          />
          <p>
            Kami mengumpulkan data sesedikit mungkin yang diperlukan untuk tiap tujuan, dan tidak
            menggunakannya untuk tujuan yang bertentangan dengan tujuan pengumpulannya.
          </p>
          <h3>3. Pembagian data</h3>
          <p>
            Kami tidak menjual data pribadi Anda. Kami membagikannya hanya sebatas yang diperlukan
            kepada:
          </p>
          <ul>
            <li>
              <strong>Penyedia layanan yang melaksanakan aktivitas:</strong> nama, nomor kontak,
              jumlah peserta, tempat penjemputan, dan data kelayakan bila diperlukan, setelah
              pemesanan dikonfirmasi dan hanya untuk tujuan pelaksanaannya.
            </li>
            <li>
              <strong>Gerbang pembayaran:</strong> data yang diperlukan untuk menyelesaikan
              transaksi dan mencegah penipuan.
            </li>
            <li>
              <strong>Penyedia layanan teknis:</strong> seperti hosting, email, platform WhatsApp
              Business, dan alat analitik, berdasarkan kewajiban kontraktual untuk melindungi data.
            </li>
            <li>
              <strong>Instansi resmi:</strong> bila ada permintaan menurut hukum yang mengikat.
            </li>
          </ul>
          <h3>4. Pemindahan data ke luar Kerajaan</h3>
          <p>
            Karena aktivitas dilaksanakan di Indonesia, data pemesanan yang diperlukan harus
            dipindahkan kepada penyedia layanan di sana. Sebagian sistem teknis juga dapat
            di-hosting di luar Kerajaan. Hal itu dilakukan sebatas yang diperlukan untuk
            melaksanakan layanan, dan sesuai ketentuan hukum tentang pemindahan data.
          </p>
          <h3>5. Jangka waktu penyimpanan</h3>
          <ul>
            <li>
              <strong>Data pemesanan dan faktur:</strong> selama jangka waktu yang disyaratkan
              peraturan akuntansi dan perdagangan.
            </li>
            <li>
              <strong>Data kelayakan kesehatan:</strong> dihapus setelah aktivitas dilaksanakan.
            </li>
            <li>
              <strong>Data akun:</strong> selama akun aktif, dan dihapus atau dianonimkan setelah
              permintaan penutupan, dengan memperhatikan apa yang wajib disimpan menurut peraturan.
            </li>
            <li>
              <strong>Data pemasaran:</strong> sampai Anda mencabut persetujuan.
            </li>
          </ul>
          <h3>6. Perlindungan data</h3>
          <p>
            Kami menerapkan langkah teknis dan organisasi yang sesuai, antara lain: enkripsi koneksi
            (HTTPS), pembatasan hak akses di dalam tim sesuai kebutuhan, dan tidak menyimpan data
            kartu.
          </p>
          <h3>7. Hak Anda</h3>
          <p>Anda berhak:</p>
          <ul>
            <li>
              <strong>Mengetahui</strong> data yang kami kumpulkan dan cara pemrosesannya.
            </li>
            <li>
              <strong>Mengakses</strong> data Anda dan memperoleh salinannya.
            </li>
            <li>
              <strong>Memperbaiki</strong> data apa pun yang tidak tepat atau tidak lengkap.
            </li>
            <li>
              <strong>Memusnahkan</strong> data Anda bila sudah tidak diperlukan, dengan
              memperhatikan kewajiban hukum.
            </li>
            <li>
              <strong>Mencabut persetujuan</strong> atas pemrosesan yang didasarkan pada persetujuan
              Anda, seperti pemasaran dan lokasi geografis.
            </li>
          </ul>
          <p>
            Untuk menggunakan hak Anda, hubungi kami melalui saluran kontak yang tercantum di situs,
            dan kami akan menjawab dalam jangka waktu yang ditetapkan peraturan.
          </p>
          <h3>8. Data anak di bawah umur</h3>
          <p>
            Kami tidak mengumpulkan data anak secara langsung. Data peserta di bawah umur (seperti
            usia) diberikan oleh wali saat pemesanan dan hanya untuk tujuan keikutsertaan yang aman.
          </p>
          <h3>9. Pembaruan</h3>
          <p>
            Kami dapat memperbarui kebijakan ini, dan memberi tahu Anda tentang perubahan penting
            melalui situs atau email.
          </p>
        </PolicySection>

        <PolicySection id="cookies" title={TITLES.cookies} backToTop={TOP}>
          <h3>1. Apa itu cookie?</h3>
          <p>
            Berkas kecil yang disimpan di perangkat Anda saat mengunjungi situs, dan membantu kami
            menjalankannya, mengingat preferensi Anda, serta memahami cara penggunaannya.
          </p>
          <h3>2. Jenis cookie yang kami gunakan</h3>
          <PolicyTable
            head={['Jenis', 'Tujuan', 'Dapatkah ditolak?']}
            rows={[
              [
                <strong key="s">Wajib</strong>,
                'Menjalankan situs: keranjang pemesanan, masuk akun, keamanan, dan penyimpanan bahasa',
                'Tidak, situs tidak berfungsi tanpanya',
              ],
              [
                <strong key="s">Analitik</strong>,
                'Memahami jumlah kunjungan dan halaman yang paling banyak digunakan untuk meningkatkan situs (seperti Google Analytics)',
                'Ya',
              ],
              [
                <strong key="s">Pemasaran</strong>,
                'Mengukur kinerja iklan dan menampilkan iklan yang sesuai bagi Anda di platform lain (seperti Meta Pixel, TikTok Pixel, dan Google Ads)',
                'Ya',
              ],
            ]}
          />
          <h3>3. Mengendalikan cookie</h3>
          <ul>
            <li>
              Pada kunjungan pertama Anda muncul pesan untuk memilih jenis cookie yang Anda setujui,
              dan kami tidak mengaktifkan cookie analitik dan pemasaran sebelum Anda menyetujuinya.
            </li>
            <li>
              Anda dapat mengubah pilihan kapan saja dari tautan &quot;Pengaturan cookie&quot; di
              bagian bawah situs, atau menghapus cookie dari pengaturan peramban Anda.
            </li>
            <li>
              Menolak cookie yang tidak wajib tidak memengaruhi kemampuan Anda untuk memesan dan
              membeli.
            </li>
          </ul>
          <CookieSettingsButton className={cookieButtonClass} />
          <h3>4. Cookie pihak ketiga</h3>
          <p>
            Sebagian cookie dipasang oleh penyedia layanan eksternal, dan tunduk pada kebijakan
            privasi mereka sendiri. Selengkapnya lihat <strong>Kebijakan Privasi</strong>.
          </p>
        </PolicySection>

        <PolicySection id="safety" title={TITLES.safety} backToTop={TOP}>
          <p>
            Keselamatan Anda adalah prioritas. Sebagian aktivitas di Bali, seperti ATV, buggy, arung
            jeram, paralayang, perjalanan helikopter, dan aktivitas air, mengandung risiko alami
            atau persyaratan khusus. Kebijakan ini menjelaskan aturan umum, sedangkan{' '}
            <strong>syarat tiap aktivitas ditampilkan di halamannya sebelum pembayaran</strong>, dan
            diambil dari penyedia layanan yang melaksanakannya.
          </p>
          <h3>1. Syarat khusus tiap aktivitas</h3>
          <p>Sesuai sifatnya, halaman aktivitas dapat memuat:</p>
          <ul>
            <li>Batas usia minimum atau maksimum.</li>
            <li>Batas berat atau tinggi badan.</li>
            <li>
              Kondisi kesehatan yang menghalangi keikutsertaan, seperti penyakit jantung dan
              punggung, kehamilan, dan operasi yang baru dijalani.
            </li>
            <li>Persyaratan mengemudi, seperti surat izin mengemudi untuk sebagian kendaraan.</li>
            <li>Tingkat kebugaran atau kemampuan berenang.</li>
            <li>Pakaian dan perlengkapan yang diperlukan.</li>
          </ul>
          <h3>2. Tanggung jawab Anda sebelum memesan</h3>
          <ul>
            <li>
              Membaca syarat aktivitas dan memastikan kelayakan semua peserta sebelum pembayaran.
            </li>
            <li>
              Mengungkapkan kondisi kesehatan atau keadaan apa pun yang dapat memengaruhi
              keselamatan.
            </li>
            <li>Berkonsultasi dengan dokter Anda jika ada keraguan tentang kesehatan.</li>
          </ul>
          <h3>3. Selama aktivitas</h3>
          <ul>
            <li>Mematuhi sepenuhnya petunjuk pemandu atau instruktur dan penyedia layanan.</li>
            <li>
              Mengenakan perlengkapan keselamatan yang disediakan, seperti helm, jaket pelampung,
              dan sabuk pengaman.
            </li>
            <li>Tidak ikut serta di bawah pengaruh alkohol atau zat apa pun yang memabukkan.</li>
            <li>Mengawasi anak-anak yang ikut serta sepanjang waktu.</li>
          </ul>
          <h3>4. Hak menghentikan keikutsertaan</h3>
          <p>
            Penyedia layanan berhak melarang siapa pun ikut serta atau menghentikan keikutsertaannya
            jika ia tidak memenuhi syarat yang diumumkan, melanggar petunjuk, atau ternyata
            keikutsertaannya membahayakan dirinya atau orang lain, dan dana tidak dikembalikan dalam
            keadaan ini.
          </p>
          <h3>5. Kondisi cuaca</h3>
          <p>
            Banyak aktivitas bergantung pada cuaca dan keadaan laut. Keputusan penyedia layanan
            untuk menghentikan atau menunda karena alasan keselamatan bersifat final, dan baginya
            berlaku ketentuan keadaan kahar dalam{' '}
            <strong>Kebijakan Pembatalan dan Pengembalian Dana</strong>.
          </p>
          <h3>6. Pernyataan dan asuransi</h3>
          <ul>
            <li>
              Penyedia layanan dapat meminta Anda menandatangani pernyataan risiko sebelum sebagian
              aktivitas.
            </li>
            <li>
              Kami sangat menyarankan Anda memiliki asuransi perjalanan yang mencakup aktivitas
              olahraga dan petualangan.
            </li>
          </ul>
          <h3>7. Batas tanggung jawab</h3>
          <p>
            Penyedia layanan bertanggung jawab atas pelaksanaan aktivitas serta penyediaan peralatan
            dan staf yang kompeten. Platform tidak bertanggung jawab atas cedera yang timbul karena
            peserta tidak mematuhi petunjuk atau menyembunyikan kondisi kesehatan, dalam batas yang
            diizinkan peraturan.
          </p>
        </PolicySection>

        <PolicySection id="complaints" title={TITLES.complaints} backToTop={TOP}>
          <p>
            Kami ingin pengalaman Anda bersama Bali Trips berjalan lancar, dan jika terjadi masalah
            kami ingin menyelesaikannya dengan cepat dan jelas.
          </p>
          <h3>1. Saluran kontak</h3>
          <p>
            Anda dapat menghubungi kami melalui WhatsApp atau email yang tercantum di halaman
            &quot;Hubungi kami&quot;, atau melalui halaman &quot;Perjalanan Saya&quot;. Tersedia
            pula nomor kontak khusus hari aktivitas di voucher pemesanan.
          </p>
          <h3>2. Mengajukan keluhan</h3>
          <p>Agar kami dapat menangani keluhan Anda dengan cepat, mohon berikan hal berikut:</p>
          <ul>
            <li>Nomor pesanan atau pemesanan.</li>
            <li>Nama dan nomor kontak.</li>
            <li>Uraian masalah yang jelas dan tanggal terjadinya.</li>
            <li>Lampiran pendukung apa pun, seperti foto, bukti pembayaran, dan percakapan.</li>
          </ul>
          <p>
            Keluhan terkait suatu aktivitas sebaiknya diajukan dalam 7 hari sejak jadwalnya, agar
            kami dapat memeriksanya bersama penyedia layanan.
          </p>
          <h3>3. Tahap penanganan</h3>
          <ol>
            <li>
              <strong>Penerimaan:</strong> kami mengonfirmasi penerimaan keluhan Anda dan memberi
              nomor untuk memantaunya.
            </li>
            <li>
              <strong>Pemeriksaan:</strong> kami meninjau pemesanan dan menghubungi penyedia layanan
              bila diperlukan.
            </li>
            <li>
              <strong>Penyelesaian:</strong> kami menjawab Anda dengan keputusan dan solusi yang
              diusulkan dalam 5 hari kerja; jangka waktu dapat diperpanjang untuk kasus yang rumit,
              dan kami akan memberi tahu Anda.
            </li>
            <li>
              <strong>Eskalasi:</strong> jika solusi tidak memuaskan Anda, Anda dapat meminta
              keluhan diteruskan ke manajemen platform untuk ditinjau.
            </li>
          </ol>
          <h3>4. Masalah pengembalian dana</h3>
          <p>
            Jika pengembalian dana sudah disetujui untuk Anda dan dana belum muncul di rekening Anda
            setelah jangka waktu yang dijelaskan dalam{' '}
            <strong>Kebijakan Pembatalan dan Pengembalian Dana</strong>, hubungi kami dan kami akan
            memberikan referensi transaksi di bank.
          </p>
          <h3>5. Masukan dan saran</h3>
          <p>
            Kami menyambut pendapat, saran, dan penilaian Anda atas aktivitas, itinerari, dan
            informasi di peta; semua itu membantu kami berkembang.
          </p>
        </PolicySection>

        <PolicyCta>
          <strong>Ada pertanyaan tentang kebijakan mana pun?</strong>
          <Link href="/contact">Hubungi kami</Link>
        </PolicyCta>
      </PolicyBody>
    </>
  )
}
