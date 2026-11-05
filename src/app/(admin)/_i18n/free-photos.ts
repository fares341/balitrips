import type { Section } from './types'

/**
 * Studio strings — free place photos (Wikimedia Commons, Openverse,
 * optional Unsplash). Keys `fp.*`; en and ar hold the same keys.
 */
const section: Section = {
  en: {
    'fp.title': 'Free photos',
    'fp.description':
      'Openly-licensed photos for map places from Wikimedia Commons / Wikidata and Openverse (and Unsplash when its key is set on the server). Every photo keeps its author, licence and source link, shown under it on the site.',
    'fp.link': 'Find free photos',
    'fp.job_title': 'Find free photos',
    'fp.job_hint':
      'Looks up every place not checked yet. Close, well-named Commons matches (geotag within 150 m and a name match) are applied automatically, but ONLY to places with no photo or only a shared/duplicate one; your own unique photos are never replaced. Everything else waits here for review.',
    'fp.start': 'Find free photos',
    'fp.recheck': 'Check all places again',
    'fp.stop': 'Stop',
    'fp.running': 'Running… {done} / {total}',
    'fp.result':
      'Last run: {done} / {total} places — good match {good}, auto-applied {auto}, nothing usable {none}, errors {errors}.',
    'fp.stopped_cancelled': 'Stopped by you.',
    'fp.stopped_error': 'Stopped after repeated errors: {error}',
    'fp.never_run': 'Not run yet on this server.',
    'fp.unsplash_on': 'Unsplash: on (hotlinked, credited).',
    'fp.unsplash_off':
      'Unsplash: off (UNSPLASH_ACCESS_KEY not set). Commons and Openverse are used.',
    'fp.counts':
      'Places checked {checked} of {total} · with candidates {withCands} · photos applied {applied} (auto {auto})',
    'fp.tab_review': 'To review',
    'fp.tab_auto': 'Auto-applied (spot-check)',
    'fp.tab_applied': 'Applied',
    'fp.tab_none': 'Nothing found',
    'fp.use_main': 'Use as main',
    'fp.add_gallery': 'Add to gallery',
    'fp.reject': 'Reject',
    'fp.undo': 'Remove from place',
    'fp.distance': '{m} m away',
    'fp.no_geo': 'no geotag',
    'fp.name': 'name {score}',
    'fp.tier_high': 'high',
    'fp.tier_good': 'good',
    'fp.tier_fair': 'fair',
    'fp.dup': 'duplicate of another place',
    'fp.current': 'Current photo',
    'fp.current_shared': 'shared with other places',
    'fp.current_unique': 'unique (yours)',
    'fp.current_none': 'none',
    'fp.clear_title': 'Shared / duplicate photos',
    'fp.clear_hint':
      '{n} places show a photo that other places use too (e.g. one picture on every mosque). This removes ONLY those shared photos, so each place shows its category illustration until a real photo is found. Unique photos are kept. Logged in the audit log.',
    'fp.clear': 'Replace shared/duplicate photos with category illustration',
    'fp.ok_applied': 'Photo applied, with its credit.',
    'fp.ok_rejected': 'Candidate rejected.',
    'fp.ok_removed': 'Photo removed from the place.',
    'fp.ok_cleared': '{n} places now show their category illustration instead of a shared photo.',
    'fp.err_duplicate': 'That picture is already used on another place.',
    'fp.err_gone': 'That candidate no longer exists.',
    'fp.err_unsplash_off': 'Unsplash is off on this server.',
    'fp.err_download': 'Could not download or process the image: {error}',
  },
  ar: {
    'fp.title': 'صور مجانية',
    'fp.description':
      'صور برخص مفتوحة لأماكن الخريطة من ويكيميديا كومنز/ويكي بيانات وOpenverse (وUnsplash إذا ضُبط مفتاحه على الخادم). كل صورة تحتفظ بالمصوّر والرخصة ورابط المصدر وتظهر تحتها في الموقع.',
    'fp.link': 'ابحث عن صور مجانية',
    'fp.job_title': 'ابحث عن صور مجانية',
    'fp.job_hint':
      'يبحث لكل مكان لم يُفحص بعد. التطابقات القوية من كومنز (موقع الصورة ضمن 150 م وتطابق الاسم) تُطبّق تلقائياً فقط على الأماكن بلا صورة أو بصورة مكررة/مشتركة؛ صورك الفريدة لا تُستبدل أبداً. الباقي ينتظر المراجعة هنا.',
    'fp.start': 'ابحث عن صور مجانية',
    'fp.recheck': 'افحص كل الأماكن من جديد',
    'fp.stop': 'إيقاف',
    'fp.running': 'جارٍ… {done} / {total}',
    'fp.result':
      'آخر تشغيل: {done} / {total} مكان — تطابق جيد {good}، طُبّق تلقائياً {auto}، لا شيء صالح {none}، أخطاء {errors}.',
    'fp.stopped_cancelled': 'أوقفته أنت.',
    'fp.stopped_error': 'توقف بعد أخطاء متكررة: {error}',
    'fp.never_run': 'لم يُشغَّل بعد على هذا الخادم.',
    'fp.unsplash_on': 'Unsplash: مفعّل (رابط مباشر مع النسبة).',
    'fp.unsplash_off':
      'Unsplash: غير مفعّل (لا يوجد UNSPLASH_ACCESS_KEY). يُستخدم كومنز وOpenverse.',
    'fp.counts':
      'أماكن مفحوصة {checked} من {total} · لها مرشحات {withCands} · صور مطبّقة {applied} (تلقائي {auto})',
    'fp.tab_review': 'للمراجعة',
    'fp.tab_auto': 'طُبّق تلقائياً (للتحقق)',
    'fp.tab_applied': 'مطبّق',
    'fp.tab_none': 'لم يُعثر على شيء',
    'fp.use_main': 'اجعلها الرئيسية',
    'fp.add_gallery': 'أضف للمعرض',
    'fp.reject': 'رفض',
    'fp.undo': 'أزلها من المكان',
    'fp.distance': 'على بعد {m} م',
    'fp.no_geo': 'بلا موقع',
    'fp.name': 'الاسم {score}',
    'fp.tier_high': 'عالٍ',
    'fp.tier_good': 'جيد',
    'fp.tier_fair': 'متوسط',
    'fp.dup': 'مكررة في مكان آخر',
    'fp.current': 'الصورة الحالية',
    'fp.current_shared': 'مشتركة مع أماكن أخرى',
    'fp.current_unique': 'فريدة (صورتك)',
    'fp.current_none': 'لا توجد',
    'fp.clear_title': 'الصور المشتركة/المكررة',
    'fp.clear_hint':
      '{n} مكان يعرض صورة تستخدمها أماكن أخرى أيضاً (مثل صورة واحدة لكل المساجد). هذا يزيل تلك الصور المشتركة فقط، فيعرض كل مكان رسم تصنيفه حتى توجد صورة حقيقية. الصور الفريدة تبقى. يُسجَّل في سجل التدقيق.',
    'fp.clear': 'استبدل الصور المشتركة/المكررة برسم التصنيف',
    'fp.ok_applied': 'طُبّقت الصورة مع نسبتها.',
    'fp.ok_rejected': 'رُفض المرشح.',
    'fp.ok_removed': 'أُزيلت الصورة من المكان.',
    'fp.ok_cleared': '{n} مكان يعرض الآن رسم تصنيفه بدل صورة مشتركة.',
    'fp.err_duplicate': 'هذه الصورة مستخدمة في مكان آخر.',
    'fp.err_gone': 'هذا المرشح لم يعد موجوداً.',
    'fp.err_unsplash_off': 'Unsplash غير مفعّل على هذا الخادم.',
    'fp.err_download': 'تعذّر تنزيل الصورة أو معالجتها: {error}',
  },
}

export default section
