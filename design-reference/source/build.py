import re,os,sys,glob
S=os.path.dirname(os.path.abspath(__file__)); out=S+'/proto'
HEAD='''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Tajawal:wght@400;500;700&display=swap">
<link rel="stylesheet" href="{base}assets/bt.css">
{css}
</head>
<body data-page="{page}" data-section="{section}"{attrs}>
<div id="hdr"></div>
'''
for f in sorted(glob.glob(S+'/src/*.html')):
    s=open(f).read()
    m=re.match(r'<!--(.*?)-->\s*',s,re.S); meta=dict(kv.split(':',1) for kv in m.group(1).split('|')); meta={k.strip():v.strip() for k,v in meta.items()}
    s=s[m.end():]
    css=''; cm=re.match(r'(<style>.*?</style>)\s*',s,re.S)
    if cm: css=cm.group(1); s=s[cm.end():]
    js=''; jm=re.search(r'(<script>.*</script>)\s*$',s,re.S)
    if jm: js=jm.group(1); s=s[:jm.start()]
    extra=''.join(f'<script src="assets/{x}.js"></script>\n' for x in meta.get('scripts','').split(',') if x)
    attrs=''.join(f' {a}' for a in meta.get('attrs','').split(',') if a)
    html=HEAD.format(title=meta['title'],page=meta.get('page',''),section=meta.get('section',meta.get('page','')),css=css,attrs=attrs,base='')
    html+=s.rstrip()+'\n'+('' if meta.get('nofooter') else '<div id="ftr"></div>\n')
    html+='<script src="assets/data.js"></script>\n<script src="assets/bt.js"></script>\n'+extra+js+'\n</body>\n</html>\n'
    name=os.path.basename(f); open(out+'/'+name,'w').write(html); print('built',name)
