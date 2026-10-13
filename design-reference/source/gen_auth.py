S='/tmp/claude-0/-home-claude/19538b1e-c352-570c-a7be-349f23e2799c/scratchpad'
CSS='''<style>
.auth { display: grid; min-height: calc(100vh - var(--hdr-h)); }
@media (min-width: 960px) { .auth { grid-template-columns: 1fr 1fr; } }
.auth-img { position: relative; display: none; overflow: hidden; }
.auth-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.auth-img::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(19,48,26,.8)); }
.auth-img blockquote { position: absolute; z-index: 1; bottom: 40px; inset-inline: 40px; margin: 0; color: #fff; font-size: 22px; font-weight: 700; line-height: 1.5; }
@media (min-width: 960px) { .auth-img { display: block; } }
.auth-form { display: grid; place-items: center; padding: 40px 16px 72px; }
.auth-form form { width: min(100%, 420px); display: flex; flex-direction: column; gap: 16px; }
.or { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 13px; } .or::before, .or::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.soc-btn { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 48px; border-radius: 99px; border: 1.5px solid var(--line); background: var(--white); font-weight: 700; color: var(--ink); }
.pw { position: relative; } .pw button { position: absolute; inset-inline-end: 6px; top: 50%; transform: translateY(-50%); border: 0; background: transparent; padding: 8px; color: var(--muted); }
.meter { height: 6px; border-radius: 6px; background: var(--ivory-3); overflow: hidden; } .meter i { display: block; height: 100%; width: 0; transition: width .3s, background .3s; }
</style>'''
def page(name, title, img, quote, body, js):
    open(f'{S}/src/{name}.html','w').write(f'''<!--title: Bali Trips — {title}|page: {name}|section: account|nofooter: 1|attrs: data-notabbar-->
{CSS}
<main id="main" class="auth"><div class="auth-form">{body}</div><div class="auth-img" aria-hidden="true"><img src="assets/img/{img}.jpg" alt=""><blockquote>{quote}</blockquote></div></main>
<script>
BT.boot();
(function () {{
const {{ L, toast, Auth, icon }} = BT;
const v = (id) => document.getElementById(id).value.trim();
const bad = (id, b) => {{ const f = document.getElementById(id).closest(".field"); f.classList.toggle("has-error", b); return b; }};
document.querySelectorAll(".pw button").forEach(b => b.onclick = () => {{ const i = b.previousElementSibling; i.type = i.type === "password" ? "text" : "password"; b.setAttribute("aria-label", i.type === "password" ? L("إظهار كلمة المرور", "Show password") : L("إخفاء كلمة المرور", "Hide password")); }});
{js}
}})();
</script>
''')
EYE='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
G='<button type="button" class="soc-btn" id="g"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.6a4.8 4.8 0 0 1-2.1 3.1v2.6h3.4c2-1.8 3.1-4.5 3.1-7.6Z"/><path fill="#34A853" d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.7v2.7A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.2 13.6a6 6 0 0 1 0-3.9V7H2.7a10 10 0 0 0 0 9.3l3.5-2.7Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.9.5 4 1.5l3-3A10 10 0 0 0 2.7 7l3.5 2.7C7 7.7 9.3 5.9 12 5.9Z"/></svg><span data-en="Continue with Google">المتابعة باستخدام Google</span></button><button type="button" class="soc-btn" id="ap"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1-2.8-4.2ZM14 5.1c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z"/></svg><span data-en="Continue with Apple">المتابعة باستخدام Apple</span></button>'
ALERT='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5"/></svg>'
page('login','تسجيل الدخول','penida-cove','<span data-en="Your bookings, files and saved places — in one place.">حجوزاتك وملفاتك وأماكنك المحفوظة — في مكان واحد.</span>',
f'''<form id="f" novalidate><div class="stack" style="gap:6px"><h1 class="h2" data-en="Welcome back">أهلًا بعودتك</h1><p class="muted" data-en="Log in to see your bookings and itineraries.">سجّل الدخول لترى حجوزاتك وجداولك.</p></div>
<div class="alert alert-err" id="fail" hidden>{ALERT}<span data-en="Email or password is incorrect. Try again or reset your password.">البريد أو كلمة المرور غير صحيحة. حاول مجددًا أو استعد كلمة المرور.</span></div>
{G}<div class="or" data-en="or with email">أو بالبريد</div>
<div class="field"><label for="em" data-en="Email">البريد الإلكتروني</label><input class="input" id="em" type="email" dir="ltr" autocomplete="email"><span class="err" data-en="Enter a valid email.">أدخل بريدًا صحيحًا.</span></div>
<div class="field"><div class="row between"><label for="pw" data-en="Password">كلمة المرور</label><a class="link" href="forgot.html" style="font-size:13px" data-en="Forgot it?">نسيتها؟</a></div><div class="pw"><input class="input" id="pw" type="password" autocomplete="current-password" dir="ltr"><button type="button" aria-label="إظهار كلمة المرور" data-en-aria="Show password">{EYE}</button></div><span class="err" data-en="Enter your password.">أدخل كلمة المرور.</span></div>
<label class="row" style="gap:8px;font-size:14px"><input type="checkbox" checked style="accent-color:var(--forest);width:18px;height:18px"> <span data-en="Keep me signed in">تذكرني</span></label>
<button class="btn btn-primary btn-lg" type="submit" data-en="Log in">تسجيل الدخول</button>
<p class="center muted" style="font-size:14px"><span data-en="New to Bali Trips?">جديد في Bali Trips؟</span> <a class="link" href="register.html" data-en="Create an account">أنشئ حسابًا</a></p>
<small class="muted center" data-en="Prototype: any email works; the password 'wrong' shows the error state.">في النموذج: أي بريد يعمل، وكلمة المرور wrong تعرض حالة الخطأ.</small></form>''',
r'''const go = () => location.href = location.hash === "#checkout" ? "checkout.html" : "account.html";
document.getElementById("g").onclick = document.getElementById("ap").onclick = () => { Auth.login({ name: "Sara", email: "sara@mail.com" }); go(); };
document.getElementById("f").onsubmit = (e) => { e.preventDefault(); const b1 = bad("em", !/^\S+@\S+\.\S+$/.test(v("em"))), b2 = bad("pw", !v("pw")); if (b1 || b2) return;
  const btn = e.target.querySelector("[type=submit]"); btn.classList.add("is-loading"); setTimeout(() => { btn.classList.remove("is-loading"); if (v("pw") === "wrong") { document.getElementById("fail").hidden = false; return; } Auth.login({ name: v("em").split("@")[0], email: v("em") }); go(); }, 800); };''')
page('register','إنشاء حساب','travelers-women','<span data-en="Save places, track bookings and keep your files — all from your phone.">احفظ الأماكن، وتابع حجوزاتك، واحتفظ بملفاتك — من جوالك.</span>',
f'''<form id="f" novalidate><div class="stack" style="gap:6px"><h1 class="h2" data-en="Create your account">أنشئ حسابك</h1><p class="muted" data-en="Free, and takes less than a minute.">مجاني ويأخذ أقل من دقيقة.</p></div>{G}<div class="or" data-en="or with email">أو بالبريد</div>
<div class="field"><label for="nm" data-en="Full name">الاسم الكامل</label><input class="input" id="nm" autocomplete="name"><span class="err" data-en="Enter your name.">اكتب اسمك.</span></div>
<div class="field"><label for="em" data-en="Email">البريد الإلكتروني</label><input class="input" id="em" type="email" dir="ltr" autocomplete="email"><span class="err" data-en="Enter a valid email.">أدخل بريدًا صحيحًا.</span></div>
<div class="field"><label for="pw" data-en="Password">كلمة المرور</label><div class="pw"><input class="input" id="pw" type="password" dir="ltr" autocomplete="new-password"><button type="button" aria-label="إظهار كلمة المرور" data-en-aria="Show password">{EYE}</button></div><div class="meter"><i id="mt"></i></div><span class="hint" data-en="At least 8 characters, with a number.">٨ أحرف على الأقل، منها رقم.</span><span class="err" data-en="Use at least 8 characters including a number.">استخدم ٨ أحرف على الأقل منها رقم.</span></div>
<label class="check"><input type="checkbox" id="ag"><span><span data-en="I agree to the">أوافق على</span> <a class="link" href="policy.html#terms" data-en="Terms">الشروط</a> <span data-en="and">و</span> <a class="link" href="policy.html#privacy" data-en="Privacy policy">سياسة الخصوصية</a></span></label>
<button class="btn btn-primary btn-lg" type="submit" data-en="Create account">إنشاء الحساب</button>
<p class="center muted" style="font-size:14px"><span data-en="Already have an account?">لديك حساب؟</span> <a class="link" href="login.html" data-en="Log in">سجّل الدخول</a></p></form>''',
r'''document.getElementById("g").onclick = document.getElementById("ap").onclick = () => { Auth.login({ name: "Sara", email: "sara@mail.com" }); location.href = "account.html"; };
document.getElementById("pw").oninput = (e) => { const p = e.target.value; const s = (p.length >= 8) + /\d/.test(p) + /[A-Z]/.test(p) + /[^\w]/.test(p); const m = document.getElementById("mt"); m.style.width = s * 25 + "%"; m.style.background = ["#B3261E", "#E07E00", "#9A5B00", "#1F7A3A", "#1F7A3A"][s]; };
document.getElementById("f").onsubmit = (e) => { e.preventDefault(); const a = bad("nm", v("nm").length < 2), b = bad("em", !/^\S+@\S+\.\S+$/.test(v("em"))), c = bad("pw", v("pw").length < 8 || !/\d/.test(v("pw")));
  if (!document.getElementById("ag").checked) { toast(L("وافق على الشروط للمتابعة.", "Accept the terms to continue."), { err: true }); return; } if (a || b || c) return;
  Auth.login({ name: v("nm"), email: v("em") }); toast(L("أُنشئ حسابك. أرسلنا رابط تأكيد إلى بريدك.", "Account created. We sent a confirmation link to your email.")); setTimeout(() => location.href = "account.html", 900); };''')
page('forgot','استعادة كلمة المرور','sunset','<span data-en="We will get you back in.">سنعيدك إلى حسابك بخطوات قليلة.</span>',
'''<form id="f" novalidate><div class="stack" style="gap:6px"><h1 class="h2" data-en="Reset your password">استعادة كلمة المرور</h1><p class="muted" data-en="Enter your email and we will send you a reset link.">أدخل بريدك وسنرسل لك رابط إعادة التعيين.</p></div>
<div class="field"><label for="em" data-en="Email">البريد الإلكتروني</label><input class="input" id="em" type="email" dir="ltr" autocomplete="email"><span class="err" data-en="Enter a valid email.">أدخل بريدًا صحيحًا.</span></div>
<button class="btn btn-primary btn-lg" type="submit" id="sb" data-en="Send reset link">أرسل الرابط</button>
<div class="alert alert-ok" id="ok" hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg><span><b data-en="Check your inbox">تحقق من بريدك</b><span data-en="If an account exists for this email, a link valid for 30 minutes is on its way.">إذا كان هناك حساب بهذا البريد، فقد أرسلنا رابطًا صالحًا لمدة ٣٠ دقيقة.</span></span></div>
<button type="button" class="btn btn-ghost" id="again" hidden>—</button>
<a class="link" href="login.html" style="align-self:center" data-en="Back to log in">العودة لتسجيل الدخول</a></form>''',
r'''document.getElementById("f").onsubmit = (e) => { e.preventDefault(); if (bad("em", !/^\S+@\S+\.\S+$/.test(v("em")))) return; const b = document.getElementById("sb"); b.classList.add("is-loading");
  setTimeout(() => { b.hidden = true; document.getElementById("ok").hidden = false; const a = document.getElementById("again"); a.hidden = false; a.disabled = true; let n = 60; a.textContent = L(`إعادة الإرسال بعد ${n} ث`, `Resend in ${n}s`); const t = setInterval(() => { n--; a.textContent = L(`إعادة الإرسال بعد ${n} ث`, `Resend in ${n}s`); if (!n) { clearInterval(t); a.disabled = false; a.textContent = L("إعادة الإرسال", "Resend"); } }, 1000); }, 800); };''')
print('ok')
