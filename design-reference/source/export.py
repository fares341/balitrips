import asyncio, json, os, sys
from playwright.async_api import async_playwright
S='/tmp/claude-0/-home-claude/19538b1e-c352-570c-a7be-349f23e2799c/scratchpad'
OUT=S+'/screens'
item={"type":"activity","ref":"water-sports","title":{"ar":"باقة الرياضات المائية في نوسا دوا","en":"Nusa Dua Water Sports"},"img":"penida-cove","date":"2026-10-24","time":"09:00","people":2,"state":{"pkg":"plus","date":"2026-10-24","time":"09:00","people":2,"addons":{"photo":1},"driver":True},"lines":[{"l":{"ar":"الباقة الشاملة × شخصان","en":"All-in × 2"},"v":158},{"l":{"ar":"تصوير فوتوغرافي","en":"Photo package"},"v":25},{"l":{"ar":"سائق — سيارة عادية (يوم)","en":"Driver — Standard car (1 day)"},"v":55}],"total":238,"meta":{"region":"uluwatu","durH":3,"provider":"Provider A","needsProvider":True},"key":"k1"}
iti={"type":"itinerary","ref":"5-days","title":{"ar":"بالي الأساسية في ٥ أيام","en":"Essential Bali in 5 Days"},"img":"rice-walk","lines":[{"l":{"ar":"ملف جدول 5 أيام (PDF)","en":"5-day itinerary file (PDF)"},"v":59}],"total":59,"meta":{"days":5},"key":"k2"}
plc={"type":"place","ref":"tegallalang","title":{"ar":"مدرجات تيغالالانغ","en":"Tegallalang Rice Terraces"},"img":"rice-walk","lines":[],"total":0,"meta":{"region":"ubud"},"key":"k3"}
trip=[item,iti,plc]
order={"id":"BT-2026-1088","date":"2026-10-13T20:00:00Z","items":[item,iti],"total":297,"method":"card","state":"success","customer":{"name":"Sara Ahmed","email":"sara@mail.com","phone":"+966 512345678"}}
SC=[
 ("00-project-hub","index.html",None,False),("01-home","home.html",None,False),("02-services","services.html",None,False),
 ("03-map","map.html",None,False),("03b-map-region-ubud","map.html#region-ubud",None,False),("03c-map-place-card","map.html#place-tegallalang",None,False),("03d-map-3d","map.html","3d",False),
 ("04-place-detail","place.html#locavore",None,False),("05-activities","activities.html",None,False),("06-activity-detail","activity.html#water-sports",None,False),
 ("07-itineraries","itineraries.html",None,False),("08-itinerary-detail","itinerary.html#5-days",None,False),("09-packages","packages.html",None,False),("10-package-detail","package.html#honeymoon",None,False),
 ("12-custom-trip","custom-trip.html",None,False),("13-explore","explore.html",None,False),("14-region","region.html#ubud",None,False),
 ("15-my-trip","my-trip.html",None,True),("15b-my-trip-empty","my-trip.html",None,False),("16-checkout","checkout.html",None,True),("16b-checkout-payment","checkout.html#pay",None,True),
 ("17-confirmation-success","confirmation.html#success",None,True),("17b-payment-failed","confirmation.html#failed",None,True),("17c-payment-processing","confirmation.html#processing",None,True),("17d-awaiting-transfer","confirmation.html#transfer",None,True),
 ("18-account","account.html#overview",None,True),("18b-account-bookings","account.html#bookings",None,True),("18c-booking-detail","account.html#booking/BT-2026-1042/water-sports",None,True),("18d-account-files","account.html#files",None,True),("18e-account-notifications","account.html#notifications",None,True),
 ("19-login","login.html",None,False),("19b-register","register.html",None,False),("19c-forgot-password","forgot.html",None,False),
 ("20-search","search.html","search",False),("20b-search-no-results","search.html","nores",False),("21-articles","articles.html",None,False),("22-article","article.html#first-time",None,False),
 ("23-about","about.html",None,False),("24-contact","contact.html",None,False),("25-faq","faq.html",None,False),("26-help","help.html",None,False),("27-policy","policy.html#cancellation",None,False),
 ("28-404","404.html",None,False),("29-ui-states","states.html",None,False),
 ("30-admin-overview","admin.html",None,False),("30b-admin-bookings","admin.html#bookings",None,False),("30c-admin-booking-drawer","admin.html#bookings","bkdrawer",False),("30d-admin-activities","admin.html#activities",None,False),("30e-admin-activity-editor","admin.html#editor/water-sports",None,False),
 ("30f-admin-addons","admin.html#addons",None,False),("30g-admin-map","admin.html#map","mapclick",False),("30h-admin-settings","admin.html#settings",None,False),("30i-admin-payments","admin.html#payments",None,False),
 ("31-design-system","design-system.html",None,False),("32-developer-handoff","handoff.html",None,False),
]
CSS=".hv-pl-in b{transform:none!important;opacity:1!important;transition:none!important}.hv-bali,.hv-sub .w,.hv-lede,.hv-search,.hv-link{animation:none!important;opacity:1!important;transform:none!important;clip-path:none!important}.hv-bali::after{width:64px!important;animation:none!important}.svc .ncard,.hero-h .w,.hero-h .l1{opacity:1!important;transform:none!important;animation:none!important;filter:none!important}.hero-h em::after{transform:none!important;animation:none!important}.rv{animation:none!important;opacity:1!important;transform:none!important}.proto-pill{display:none!important}.toasts{display:none!important}.tabbar{position:absolute!important}body{position:relative}.arch img{animation:none!important}"
async def run(lang, w, h, dpr, folder, only=None):
    os.makedirs(f'{OUT}/{folder}', exist_ok=True)
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for name,url,act,fixt in SC:
            if only and not any(name.startswith(o) for o in only): continue
            ctx=await b.new_context(viewport={'width':w,'height':h}, device_scale_factor=dpr)
            init={"bt.lang":lang,"bt.adminLang":lang,"bt.user":{"name":"Sara","email":"sara@mail.com"} if fixt or name.startswith(('18',)) else None}
            if fixt: init.update({"bt.trip":trip,"bt.lastOrder":order,"bt.ckForm":{"name":"Sara Ahmed","email":"sara@mail.com","phone":"512345678","agree":True}})
            js="try{"+"".join(f"localStorage.setItem({json.dumps(k)},{json.dumps(json.dumps(v))});" for k,v in init.items())+"}catch(e){}"
            await ctx.add_init_script(js)
            pg=await ctx.new_page()
            await pg.goto('http://localhost:8766/'+url); await pg.wait_for_timeout(700)
            await pg.add_style_tag(content=CSS)
            await pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i=>i.loading='eager')")
            if act=='3d': await pg.click('#v3d'); await pg.wait_for_timeout(1200)
            if act=='search': await pg.fill('#q','أوبود' if lang=='ar' else 'Ubud'); await pg.press('#q','Enter'); await pg.wait_for_timeout(500)
            if act=='nores': await pg.fill('#q','xyz'); await pg.press('#q','Enter'); await pg.wait_for_timeout(500)
            if act=='bkdrawer': await pg.click('[data-bk="BT-2026-1088"]'); await pg.wait_for_timeout(700)
            if act=='mapclick': await pg.mouse.click(int(w*0.45) if w>1000 else 200, 420); await pg.wait_for_timeout(400)
            await pg.evaluate("async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){scrollTo(0,y);await new Promise(r=>setTimeout(r,60))}scrollTo(0,0)}")
            await pg.wait_for_timeout(700)
            full = not url.startswith('map.html') and act!='bkdrawer'
            await pg.screenshot(path=f'{OUT}/{folder}/{name}.jpg', full_page=full, type='jpeg', quality=80)
            await ctx.close()
        await b.close()
async def main():
    mode=sys.argv[1]
    if mode=='desk': await run('ar',1440,900,1,'ar-desktop-1440')
    if mode=='mob': await run('ar',390,844,2,'ar-mobile-390')
    if mode=='tab': await run('ar',768,1024,1,'ar-tablet-768',['01','03-','06','11','15-','16-','30-'])
    if mode=='en': await run('en',1440,900,1,'en-desktop-1440',['01','03-','05','06','15-','16-','30-','30e'])
    if mode=='enm': await run('en',390,844,2,'en-mobile-390',['01','03-','06','15-','16-'])
asyncio.run(main())
