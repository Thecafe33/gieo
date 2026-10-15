# Bé Gạo pixel (linh vật Gieo Gieo) — vẽ từng ô, xuất bảng sprite cho app khách (index.html).
#   python3 tools/be_gao/ve_be_gao.py  → be_gao_sheet.png + in ra data-URI để dán vào khối [BÉ GẠO] trong index.html
#   Bản Tết 2027 (Đinh Mùi): tframe() — Bé Gạo DÊ (sừng vàng, tai cụp, râu, khăn đỏ đô viền vàng, lì xì, giày đỏ đô)
#   Bản Giáng sinh: xframe() — Bé Gạo thành CÂY THÔNG nhỏ (3 tầng lá, mặt Bé Gạo, sao phát sáng, giày xanh), khung 40×50
from PIL import Image
import math
W,H=40,46
PAL={'w':(255,246,220),'s':(236,220,178),'S':(214,193,146),'h':(255,255,255),'o':(92,74,58),
 'b':(32,64,200),'B':(18,36,130),'e':(24,40,140),'l':(255,255,255),'p':(247,168,160),'m':(70,45,40),
 'y':(255,214,40),'Y':(222,160,0),'r':(244,140,30),'k':(0,0,0),
 'g':(52,150,84),'G':(26,100,56),'q':(104,190,118),'R':(222,44,64),'L':(255,236,140,120),'u':(255,250,200)}
def frame(bob=0, lf=(0,0), rf=(0,0), arm=0, blink=False, happy=False, xmas=False, tet=False):
    g=[[None]*W for _ in range(H)]
    def put(x,y,c):
        if 0<=x<W and 0<=y<H: g[y][x]=c
    ROWS={6:(20,23),7:(18,25),8:(17,26),9:(16,27),10:(15,27),11:(14,28),12:(13,28),13:(12,29),14:(12,29),15:(11,29),
      16:(10,30),17:(10,30),18:(9,30),19:(9,31),20:(8,31),21:(8,31),22:(8,31),23:(7,31),24:(7,32),25:(7,32),26:(7,32),
      27:(7,32),28:(7,32),29:(7,32),30:(7,32),31:(7,32),32:(8,32),33:(8,31),34:(8,31),35:(9,30),36:(10,29),37:(11,28),38:(13,26)}
    tipx,tipy=21.5,6+bob
    def inbody(x,y):
        r=ROWS.get(y-bob)
        return bool(r) and r[0]<=x<=r[1]
    # arms (behind body edge)
    for (ax,ay) in [(4,29+arm),(5,29+arm),(6,29+arm),(4,30+arm),(5,30+arm),(6,30+arm),(5,28+arm),(5,31+arm)]:
        put(ax,ay+bob,'g' if xmas else 'w')
    for (ax,ay) in [(33,29-arm),(34,29-arm),(35,29-arm),(33,30-arm),(34,30-arm),(35,30-arm),(34,28-arm),(34,31-arm)]:
        put(ax,ay+bob,'g' if xmas else 'w')
    # feet
    for fx0,(dx,dy) in [(11,lf),(22,rf)]:
        for x in range(fx0+dx,fx0+dx+6):
            for y in range(38+dy,41+dy):
                if (x in (fx0+dx,fx0+dx+5)) and y==38+dy: continue
                put(x,y,'b')
        for x in range(fx0+dx+1,fx0+dx+5): put(x,40+dy,'B')
    # body
    body=set()
    for y in range(H):
        for x in range(W):
            if inbody(x,y): body.add((x,y)); put(x,y,'w')
    for (x,y) in body:
        if (x+2,y+1) not in body or (x+1,y+2) not in body: put(x,y,'s')
        if (x+1,y+1) not in body and (x+1,y) not in body: put(x,y,'S')
    # highlight top-left
    for (x,y) in [(13,15+bob),(14,14+bob),(12,17+bob),(12,16+bob),(15,13+bob)]:
        if (x,y) in body: put(x,y,'h')
    # crease (rãnh hạt gạo) bên phải từ chóp xuống
    for (x,y) in [(23,10),(24,11),(24,12),(25,13),(25,14),(26,15),(26,16),(26,17),(27,18),(27,19),(27,20)]:
        if (x,y+bob) in body: put(x,y+bob,'s')
    # mặt
    ey=20+bob
    for ex in (14,24):
        if happy:   # mắt cười ^ ^
            put(ex-1,ey+2,'e'); put(ex,ey+1,'e'); put(ex+1,ey+1,'e'); put(ex+2,ey+2,'e')
        elif blink:
            put(ex,ey+2,'e'); put(ex+1,ey+2,'e')
        else:
            for dy in range(4):
                for dx in range(2): put(ex+dx,ey+dy,'e')
            put(ex,ey,'l')
    for (x,y) in [(18,ey+3),(19,ey+4),(20,ey+4),(21,ey+3)]: put(x,y,'m')
    for (x,y) in [(10,ey+5),(11,ey+5),(12,ey+5),(11,ey+6),(12,ey+6),(26,ey+5),(27,ey+5),(28,ey+5),(26,ey+6),(27,ey+6)]:
        if g[y][x] in ('w','s'): put(x,y,'p')
    if tet:
        # TẾT 2027 — năm Đinh Mùi: Bé Gạo DÊ. Sừng vàng cong, tai dê cụp, râu dê, khăn đỏ đô viền vàng, bao lì xì.
        HORN=[(17,11),(16,11),(16,10),(15,10),(15,9),(14,9),(14,8),(13,8),(13,7),(12,7),(12,6),(11,6),(10,6),(10,7),(9,7),(9,8)]
        DARK=[(16,11),(15,10),(14,9),(13,8),(12,7),(10,7),(9,8)]
        for (x,y) in HORN: put(x,y+bob,'y'); put(43-x,y+bob,'y')        # sừng trái + phải (đối xứng quanh chóp)
        for (x,y) in DARK: put(x,y+bob,'Y'); put(43-x,y+bob,'Y')
        for (x,y) in [(6,15),(7,15),(8,15),(9,14),(10,14),(11,14),(7,16),(8,16),(9,16),(10,15),(11,15)]:
            if (x,y+bob) not in body: put(x,y+bob,'w')              # tai trái cụp ngang
        for (x,y) in [(8,15),(9,15)]: put(x,y+bob,'p')
        for (x,y) in [(32,15),(33,15),(34,15),(31,14),(30,14),(32,16),(33,16),(31,16),(30,15),(31,15)]:
            if (x,y+bob) not in body: put(x,y+bob,'w')              # tai phải
        for (x,y) in [(31,15),(32,15)]: put(x,y+bob,'p')
        for (x,y,c) in [(19,26,'h'),(20,26,'h'),(19,27,'h'),(20,27,'h'),(20,28,'h'),(18,26,'S'),(21,26,'S'),(21,27,'S'),(19,28,'S'),(21,28,'S'),(20,29,'S')]:
            put(x,y+bob,c)                                             # râu dê
        for (x,y) in body:                                             # khăn đỏ đô ngang cổ + viền vàng
            yy=y-bob
            if yy in (29,30) and not (19<=x<=21 and yy<=29): put(x,y,'D')
            if yy==31: put(x,y,'y')
        for (x,y) in [(12,29),(16,30),(24,29),(28,30)]: put(x,y+bob,'y')  # chấm vàng trên khăn
        for (x,y,c) in [(9,31,'D'),(10,31,'D'),(9,32,'D'),(10,32,'D'),(9,33,'D'),(10,33,'E'),(9,34,'y'),(10,34,'y')]:
            put(x,y+bob,c)                                             # đuôi khăn
        for x in range(33,38):                                         # bao lì xì trên tay phải
            for y in range(28,35): put(x,y+bob-arm,'R')
        for x in range(33,38): put(x,28+bob-arm,'E'); put(x,30+bob-arm,'y')
        for (x,y) in [(35,32),(35,33)]: put(x,y+bob-arm,'y')
    elif not xmas:
        # dây đeo chéo (vai trái → hông phải)
        for i in range(0,17):
            x=8+i; y=int(round(27+bob+i*0.36))
            if (x,y) in body: put(x,y,'b')
            if (x,y+1) in body: put(x,y+1,'b')
        # túi
        bx,by=24,32+bob
        for x in range(bx,bx+8):
            for y in range(by,by+6): put(x,y,'b')
        for x in range(bx,bx+8): put(x,by+5,'B')
        for y in range(by,by+6): put(bx+7,y,'B')
        for x in range(bx+1,bx+7): put(x,by+2,'B')  # nắp túi
        put(bx+3,by+3,'y'); put(bx+4,by+3,'y'); put(bx+3,by+2,'y'); put(bx+4,by+2,'y'); put(bx+4,by+3,'Y')
        # vịt kẹp tóc
        dx0,dy0=21,5+bob
        DUCK=["..yy...",
              ".yyyy..",
              "ryky..y",
              ".yyyyyy",
              ".yyyyY.",
              "bbbbbb."]
        for j,row in enumerate(DUCK):
            for i,c in enumerate(row):
                if c!='.': put(dx0+i,dy0-3+j,c)
    else:
        # ÁO LEN CÂY THÔNG: thân dưới mặt là cây thông 3 tầng (mép răng cưa), dây kim tuyến, quả châu
        Z=[0,1,2,1]
        for (x,y) in body:
            if y-bob>=28+Z[x%4]: put(x,y,'G' if g[y][x] in ('s','S') else 'g')
        for x in range(4,36):            # mép tầng lá bên trong (răng cưa đậm)
            for t in (32,36):
                y=t+Z[x%4]+bob
                if (x,y) in body and g[y][x]=='g': put(x,y,'G')
        for i in range(0,19):            # dây kim tuyến vàng chéo, liền mạch
            x=9+i; y=int(round(30+bob+i*0.28))
            if (x,y) in body and g[y][x] in ('g','G'): put(x,y,'y')
        for (x,y,c) in [(14,34,'R'),(25,34,'u'),(20,31,'R'),(11,38,'u'),(18,38,'R'),(27,38,'R')]:
            if (x,y+bob) in body: put(x,y+bob,c)
    # viền tự động
    out=[row[:] for row in g]
    for y in range(H):
        for x in range(W):
            if g[y][x] is None:
                nb=[g[y+dy][x+dx] for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)) if 0<=x+dx<W and 0<=y+dy<H and g[y+dy][x+dx] is not None]
                if nb:
                    out[y][x]='B' if any(c in 'bB' for c in nb) and not any(c in 'wsSh' for c in nb) else ('Y' if all(c in 'yYrkuL' for c in nb) else ('E' if all(c in 'DERyY' for c in nb) else 'o'))
    return out
PAD=4   # (giữ tên cũ) bản Giáng sinh cao hơn bản thường 4 ô: H+PAD = 50
PAL.update({'O':(20,66,40),'n':(122,78,44),'N':(88,54,30),'D':(128,18,42),'E':(84,10,26)})
def xframe(bob=0, lf=(0,0), rf=(0,0), arm=0, blink=False, happy=False):
    """Bé Gạo GIÁNG SINH = một cây thông nhỏ biết đi: 3 tầng lá, mặt Bé Gạo, sao phát sáng, quả châu, giày xanh."""
    HH=H+PAD; g=[[None]*W for _ in range(HH)]
    def put(x,y,c):
        if 0<=x<W and 0<=y<HH: g[y][x]=c
    cx=19.5; body=set()
    TIERS=[(9,19,1.5,8.5),(16,29,4.5,13.5),(24,41,7.5,17.5)]   # (trên, dưới, nửa rộng trên, nửa rộng dưới)
    def tier(y0,y1,w0,w1,mark):
        cells=set()
        for y in range(y0,y1+1):
            t=(y-y0)/(y1-y0); hw=w0+(w1-w0)*t**0.85
            if y>=y1-1: hw-= (2.2 if y==y1 else 0.8)          # bo tròn 2 góc đáy tầng
            for x in range(W):
                if abs(x+.5-cx)<=hw: cells.add((x,y+bob))
        return cells
    # tầng dưới vẽ trước, tầng trên phủ lên (mép "váy" lá của tầng trên đè xuống tầng dưới)
    tiers=[tier(*t,i) for i,t in enumerate(TIERS)]
    for i in (2,1,0):
        for (x,y) in tiers[i]:
            put(x,y,'g'); body.add((x,y))
        for (x,y) in tiers[i]:                                 # bóng phải + sáng trái
            if (x+2,y) not in tiers[i]: put(x,y,'G')
            elif (x-2,y) not in tiers[i] and y-bob<TIERS[i][1]-1: put(x,y,'q')
        if i<2:                                                # bóng đổ dưới mép tầng trên
            for (x,y) in tiers[i]:
                if (x,y+1) not in tiers[i] and (x,y+1) in tiers[i+1]: put(x,y+1,'G')
    # tuyết đọng trên mép mỗi tầng (bên trái)
    for (x,y) in [(14,19),(15,19),(16,20),(9,29),(10,29),(11,30),(6,41),(7,41),(8,40),(26,29),(27,30),(30,41),(31,40)]:
        if (x,y+bob) in body: put(x,y+bob,'h')
    # tay = nhánh lá nhỏ hai bên tầng dưới
    for (ax,ay) in [(3,34+arm),(4,34+arm),(5,34+arm),(3,33+arm),(4,33+arm),(4,35+arm),(2,34+arm)]:
        if (ax,ay+bob) not in body: put(ax,ay+bob,'g')
    for (ax,ay) in [(36,34-arm),(35,34-arm),(34,34-arm),(36,33-arm),(35,33-arm),(35,35-arm),(37,34-arm)]:
        if (ax,ay+bob) not in body: put(ax,ay+bob,'G')
    # gốc cây + giày xanh
    for x in range(17,23):
        for y in (42,43): put(x,y+bob,'n' if x<21 else 'N')
    for fx0,(dx,dy) in [(11,lf),(23,rf)]:
        for x in range(fx0+dx,fx0+dx+6):
            for y in range(43+dy,46+dy):
                if (x in (fx0+dx,fx0+dx+5)) and y==43+dy: continue
                put(x,y,'b')
        for x in range(fx0+dx+1,fx0+dx+5): put(x,45+dy,'B')
    # MẶT (tầng dưới, phần trên)
    ey=31+bob
    for ex in (14,24):
        if happy:
            put(ex-1,ey+2,'e'); put(ex,ey+1,'e'); put(ex+1,ey+1,'e'); put(ex+2,ey+2,'e')
        elif blink:
            put(ex,ey+2,'e'); put(ex+1,ey+2,'e')
        else:
            for dy in range(4):
                for dx in range(2): put(ex+dx,ey+dy,'e')
            put(ex,ey,'l')
    for (x,y) in [(18,ey+3),(19,ey+4),(20,ey+4),(21,ey+3)]: put(x,y,'m')
    for (x,y) in [(10,ey+5),(11,ey+5),(12,ey+5),(11,ey+6),(27,ey+5),(28,ey+5),(29,ey+5),(28,ey+6)]: put(x,y,'p')
    # dây kim tuyến + quả châu (tránh vùng mặt)
    for i in range(0,13):
        x=13+i; y=int(round(13+bob+i*0.42))
        if (x,y) in body: put(x,y,'y')
    for i in range(0,19):
        x=10+i; y=int(round(22+bob+i*0.36))
        if (x,y) in body: put(x,y,'y')
    for (x,y,c) in [(18,12,'R'),(15,16,'u'),(23,17,'R'),(12,24,'R'),(21,23,'u'),(27,23,'R'),(16,26,'y'),
                    (8,37,'R'),(14,39,'u'),(20,38,'R'),(26,39,'y'),(31,37,'R')]:
        if (x,y+bob) in body: put(x,y+bob,c)
    # viền: xanh đậm quanh lá, nâu đậm quanh gốc, xanh đậm quanh giày
    out=[r[:] for r in g]
    for y in range(HH):
        for x in range(W):
            if g[y][x] is None:
                nb=[g[y+dy][x+dx] for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)) if 0<=x+dx<W and 0<=y+dy<HH and g[y+dy][x+dx] is not None]
                if nb:
                    out[y][x]='B' if all(c in 'bB' for c in nb) else ('N' if all(c in 'nNbB' for c in nb) else 'O')
    g=out
    # NGÔI SAO trên ngọn + quầng sáng
    STAR=["...y...",
          "..yuy..",
          "yyyuyyy",
          ".yuuuy.",
          "..yyy..",
          ".yy.yy.",
          ".y...y."]
    sx,sy=17,3+bob
    star=set()
    for j,row in enumerate(STAR):
        for i,c in enumerate(row):
            if c!='.': g[sy+j][sx+i]=c; star.add((sx+i,sy+j))
    ring=set()
    for (x,y) in star:
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            if (x+dx,y+dy) not in star and 0<=y+dy<HH: ring.add((x+dx,y+dy))
    for (x,y) in ring:
        if g[y][x] in (None,'O'): g[y][x]='Y'
    for (x,y) in list(ring):
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
            X,Y=x+dx,y+dy
            if 0<=Y<HH and 0<=X<W and g[Y][X] is None: g[Y][X]='L'
    return g
def img(g,scale=8,bg=None):
    Hh=len(g)
    im=Image.new('RGBA',(W,Hh),(0,0,0,0) if bg is None else bg+(255,))
    px=im.load()
    for y in range(Hh):
        for x in range(W):
            c=g[y][x]
            if c: px[x,y]=PAL[c] if len(PAL[c])==4 else PAL[c]+(255,)
    return im.resize((W*scale,Hh*scale),Image.NEAREST)
def walk():
    # 4 khung đi: chân trước nhấc / đặt, thân nhún 1px, tay đánh
    return [frame(bob=0, lf=(-1,-1), rf=(1,0), arm=1), frame(bob=1, lf=(0,0), rf=(0,0), arm=0),
            frame(bob=0, lf=(-1,0), rf=(1,-1), arm=-1), frame(bob=1, lf=(0,0), rf=(0,0), arm=0)]
def sheet():
    """Bảng sprite dùng trong app: 0 đứng · 1 nhắm mắt · 2–5 đi bộ · 6 cười"""
    fr=[frame(), frame(blink=True)] + walk() + [frame(happy=True, arm=1)]
    im=Image.new('RGBA',(W*len(fr),H),(0,0,0,0))
    for i,f in enumerate(fr): im.paste(img(f,1),(i*W,0))
    return im
def tframe(**kw):
    """Bé Gạo TẾT (dê): giày đỏ đô thay xanh"""
    g=frame(tet=True, **kw)
    return [[{'b':'D','B':'E'}.get(c,c) for c in row] for row in g]
def tsheet():
    T=tframe
    fr=[T(), T(blink=True), T(bob=0, lf=(-1,-1), rf=(1,0), arm=1), T(bob=1), T(bob=0, lf=(-1,0), rf=(1,-1), arm=-1), T(bob=1), T(happy=True, arm=1)]
    im=Image.new('RGBA',(W*len(fr),H),(0,0,0,0))
    for i,f in enumerate(fr): im.paste(img(f,1),(i*W,0))
    return im
def xsheet():
    """Bảng sprite Giáng sinh (cây thông), cùng thứ tự khung với sheet(): 40×50 mỗi khung"""
    X=xframe
    fr=[X(), X(blink=True), X(bob=0, lf=(-1,-1), rf=(1,0), arm=1), X(bob=1), X(bob=0, lf=(-1,0), rf=(1,-1), arm=-1), X(bob=1), X(happy=True, arm=1)]
    im=Image.new('RGBA',(W*len(fr),H+PAD),(0,0,0,0))
    for i,f in enumerate(fr): im.paste(img(f,1),(i*W,0))
    return im
if __name__=='__main__':
    import base64, io, os, sys
    out=os.path.dirname(os.path.abspath(__file__))
    xsheet().save(os.path.join(out,'be_gao_giangsinh_sheet.png'), optimize=True)   # tools/tao_ban_giangsinh.js đọc file này
    sh=sheet(); sh.save(os.path.join(out,'be_gao_sheet.png'), optimize=True)
    b=io.BytesIO(); sh.save(b,'PNG',optimize=True)
    print('data:image/png;base64,'+base64.b64encode(b.getvalue()).decode())
