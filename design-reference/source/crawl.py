import asyncio,glob,os
from playwright.async_api import async_playwright
P='/tmp/claude-0/-home-claude/19538b1e-c352-570c-a7be-349f23e2799c/scratchpad/proto'
pages=sorted(os.path.basename(f) for f in glob.glob(P+'/*.html'))
extra={'activity.html':'#water-sports','itinerary.html':'#5-days','package.html':'#honeymoon','place.html':'#locavore','region.html':'#ubud','article.html':'#first-time','policy.html':'#terms','confirmation.html':'#success'}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for lang in ['ar']:
          for w in [390,1440]:
            ctx=await b.new_context(viewport={'width':w,'height':850})
            await ctx.add_init_script(f"try{{localStorage.setItem('bt.lang','\"{lang}\"');localStorage.setItem('bt.user','{{\"name\":\"Sara\",\"email\":\"s@m.com\"}}')}}catch(e){{}}")
            for pg_ in pages:
                pg=await ctx.new_page(); errs=[]
                pg.on('pageerror',lambda e: errs.append(str(e)[:160]))
                await pg.goto('http://localhost:8766/'+pg_+extra.get(pg_,'')); await pg.wait_for_timeout(500)
                ov=await pg.evaluate("""()=>{const W=document.documentElement.clientWidth;const o=[];document.querySelectorAll('body *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&(r.right>W+1||r.left<-1)){let p=e,skip=false;while(p){const cs=getComputedStyle(p);if(['auto','scroll','hidden'].includes(cs.overflowX)&&p!==document.body&&p!==document.documentElement){skip=true;break}if(cs.position==='fixed'){skip=true;break}p=p.parentElement}if(!skip)o.push((e.className||e.tagName).toString().slice(0,40))}});return [document.documentElement.scrollWidth>W, o.slice(0,4)]}""")
                if errs or ov[0]: print(lang,w,pg_,errs,ov)
                await pg.close()
            await ctx.close()
        await b.close()
asyncio.run(main())
