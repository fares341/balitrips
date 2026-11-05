import type { Section } from './types'

/**
 * Studio strings — Google place photos (owner, Nov 2026): matching map places
 * to Google Maps places, reviewing low-confidence matches, and the API usage
 * log. Keys `gp.*`; en and ar hold the same keys.
 */
const section: Section = {
  en: {
    'gp.title': 'Google photos',
    'gp.description':
      'Places matched to Google Maps show their Google photos (with the author and Google credit) where our own photo is missing or shared with another place.',
    'gp.link': 'Google photos',
    'gp.off':
      'Google photos are off: GOOGLE_PLACES_API_KEY is not set on the server. Everything shows our own photos, as before.',
    'gp.counts':
      'Auto {auto} · Confirmed {confirmed} · Needs review {review} · Rejected {rejected} · Not matched {none} (of which never checked: {unchecked})',
    'gp.job_title': 'Match with Google',
    'gp.job_hint':
      'Looks up every place without a Google match (one Text Search each), auto-accepts close, well-named matches and queues the rest for review. Safe to run again: it continues where it stopped.',
    'gp.start': 'Match with Google',
    'gp.recheck': 'Re-check «not matched»',
    'gp.stop': 'Stop',
    'gp.running': 'Running… {done} / {total}',
    'gp.result':
      'Last run: {done} / {total} places — auto {auto}, review {review}, no match {none}, errors {errors}.',
    'gp.stopped_daily_cap':
      'Stopped: the daily Google request cap was reached. It continues tomorrow, or raise GOOGLE_PLACES_DAILY_CAP.',
    'gp.stopped_disabled': 'Stopped: no Google key on the server.',
    'gp.stopped_cancelled': 'Stopped by you.',
    'gp.stopped_error': 'Stopped after repeated errors: {error}',
    'gp.never_run': 'Not run since the server started.',
    'gp.review_title': 'Matches',
    'gp.tab_review': 'Needs review',
    'gp.tab_auto': 'Auto',
    'gp.tab_confirmed': 'Confirmed',
    'gp.tab_rejected': 'Rejected',
    'gp.tab_none': 'Not matched',
    'gp.col_ours': 'Our place',
    'gp.col_google': 'Google candidate',
    'gp.col_score': 'Score',
    'gp.distance': '{m} m away',
    'gp.open_maps': 'Open on Google Maps',
    'gp.no_candidate': 'No candidate.',
    'gp.candidate_unavailable': 'Could not load the candidate from Google right now.',
    'gp.accept': 'Accept',
    'gp.reject': 'Reject',
    'gp.unlink': 'Unlink',
    'gp.search_again': 'Search again',
    'gp.search_query': 'Search text',
    'gp.search_results': 'Google results for «{q}»',
    'gp.use_this': 'Use this',
    'gp.no_results': 'Google found nothing for this search.',
    'gp.usage_title': 'Google API usage',
    'gp.usage_hint':
      'Requests per day (UTC). Billable: Text Search Pro, Place Details Pro, Place Photos. Free: Place Details IDs Only (the photo list). Cap: {cap} billable requests per day (GOOGLE_PLACES_DAILY_CAP).',
    'gp.usage_month':
      'This month: {billable} billable requests ({photos} photos, {search} searches, {details} candidate lookups) and {free} free.',
    'gp.usage_empty': 'No Google requests yet.',
    'gp.kind_text_search': 'Text Search',
    'gp.kind_details_photos': 'Photo list (free)',
    'gp.kind_details_pro': 'Candidate details',
    'gp.kind_photo_media': 'Photos',
    'gp.col_day': 'Day',
    'gp.col_total': 'Billable',
    'gp.ok_accepted': 'Match accepted: Google photos show for this place.',
    'gp.ok_rejected': 'Match rejected: this place keeps our own photos.',
    'gp.ok_unlinked': 'Unlinked: this place keeps our own photos.',
    'gp.ok_started': 'Matching started.',
    'gp.err_gone': 'This place no longer exists.',
    'gp.err_id': 'That is not a Google place ID.',
    'gp.err_off': 'Google photos are off (no key on the server).',
    'gp.err_cap': 'The daily Google request cap is reached.',
    'gp.err_google': 'Google did not answer. Try again in a minute.',
  },
  ar: {
    'gp.title': 'صور Google',
    'gp.description':
      'الأماكن المطابقة مع خرائط Google تعرض صورها من Google (مع اسم المصوّر ونسبة Google) حين تكون صورتنا مفقودة أو مشتركة مع مكان آخر.',
    'gp.link': 'صور Google',
    'gp.off':
      'صور Google متوقفة: المتغير GOOGLE_PLACES_API_KEY غير مضبوط على الخادم. كل الصفحات تعرض صورنا كما كانت.',
    'gp.counts':
      'تلقائي {auto} · مؤكد {confirmed} · بحاجة لمراجعة {review} · مرفوض {rejected} · غير مطابق {none} (لم يُفحص بعد: {unchecked})',
    'gp.job_title': 'المطابقة مع Google',
    'gp.job_hint':
      'يبحث عن كل مكان بلا مطابقة (بحث نصي واحد لكل مكان)، ويقبل تلقائيًا المطابقات القريبة ذات الاسم الواضح، ويضع الباقي للمراجعة. آمن عند التكرار: يكمل من حيث توقف.',
    'gp.start': 'المطابقة مع Google',
    'gp.recheck': 'إعادة فحص «غير مطابق»',
    'gp.stop': 'إيقاف',
    'gp.running': 'قيد التشغيل… {done} / {total}',
    'gp.result':
      'آخر تشغيل: {done} / {total} مكان — تلقائي {auto}، مراجعة {review}، بلا مطابقة {none}، أخطاء {errors}.',
    'gp.stopped_daily_cap':
      'توقف: بلغنا الحد اليومي لطلبات Google. يكمل غدًا، أو ارفع GOOGLE_PLACES_DAILY_CAP.',
    'gp.stopped_disabled': 'توقف: لا يوجد مفتاح Google على الخادم.',
    'gp.stopped_cancelled': 'أوقفته أنت.',
    'gp.stopped_error': 'توقف بعد أخطاء متكررة: {error}',
    'gp.never_run': 'لم يُشغَّل منذ بدء الخادم.',
    'gp.review_title': 'المطابقات',
    'gp.tab_review': 'بحاجة لمراجعة',
    'gp.tab_auto': 'تلقائي',
    'gp.tab_confirmed': 'مؤكد',
    'gp.tab_rejected': 'مرفوض',
    'gp.tab_none': 'غير مطابق',
    'gp.col_ours': 'مكاننا',
    'gp.col_google': 'مرشح Google',
    'gp.col_score': 'الدرجة',
    'gp.distance': 'على بعد {m} م',
    'gp.open_maps': 'افتح في خرائط Google',
    'gp.no_candidate': 'لا يوجد مرشح.',
    'gp.candidate_unavailable': 'تعذر تحميل المرشح من Google الآن.',
    'gp.accept': 'قبول',
    'gp.reject': 'رفض',
    'gp.unlink': 'فك الربط',
    'gp.search_again': 'بحث جديد',
    'gp.search_query': 'نص البحث',
    'gp.search_results': 'نتائج Google لـ «{q}»',
    'gp.use_this': 'استخدم هذا',
    'gp.no_results': 'لم يجد Google شيئًا لهذا البحث.',
    'gp.usage_title': 'استخدام Google API',
    'gp.usage_hint':
      'الطلبات يوميًا (UTC). المدفوعة: Text Search Pro و Place Details Pro و Place Photos. المجانية: Place Details IDs Only (قائمة الصور). الحد: {cap} طلبًا مدفوعًا يوميًا (GOOGLE_PLACES_DAILY_CAP).',
    'gp.usage_month':
      'هذا الشهر: {billable} طلبًا مدفوعًا ({photos} صورة، {search} بحث، {details} تفاصيل مرشح) و {free} مجانيًا.',
    'gp.usage_empty': 'لا طلبات إلى Google بعد.',
    'gp.kind_text_search': 'بحث نصي',
    'gp.kind_details_photos': 'قائمة الصور (مجاني)',
    'gp.kind_details_pro': 'تفاصيل المرشح',
    'gp.kind_photo_media': 'الصور',
    'gp.col_day': 'اليوم',
    'gp.col_total': 'مدفوع',
    'gp.ok_accepted': 'قُبلت المطابقة: تظهر صور Google لهذا المكان.',
    'gp.ok_rejected': 'رُفضت المطابقة: يبقى المكان على صورنا.',
    'gp.ok_unlinked': 'فُك الربط: يبقى المكان على صورنا.',
    'gp.ok_started': 'بدأت المطابقة.',
    'gp.err_gone': 'هذا المكان لم يعد موجودًا.',
    'gp.err_id': 'هذا ليس معرّف مكان من Google.',
    'gp.err_off': 'صور Google متوقفة (لا مفتاح على الخادم).',
    'gp.err_cap': 'بلغنا الحد اليومي لطلبات Google.',
    'gp.err_google': 'لم يرد Google. حاول بعد دقيقة.',
  },
}

export default section
