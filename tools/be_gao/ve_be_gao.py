# Bé Gạo pixel (linh vật Gieo Gieo) — vẽ từng ô, xuất bảng sprite cho app khách (index.html).
#   python3 tools/be_gao/ve_be_gao.py  → be_gao_sheet.png + in ra data-URI để dán vào khối [BÉ GẠO] trong index.html
from PIL import Image
import math
W,H=40,46
PAL={'w':(255,246,220),'s':(236,220,178),'S':(214,193,146),'h':(255,255,255),'o':(92,74,58),
 'b':(32,64,200),'B':(18,36,130),'e':(24,40,140),'l':(255,255,255),'p':(247,168,160),'m':(70,45,40),
 'y':(255,214,40),'Y':(222,160,0),'r':(244,140,30),'k':(0,0,0)}
def frame(bob=0, lf=(0,0), rf=(0,0), arm=0, blink=False, happy=False):
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
        put(ax,ay+bob,'w')
    for (ax,ay) in [(33,29-arm),(34,29-arm),(35,29-arm),(33,30-arm),(34,30-arm),(35,30-arm),(34,28-arm),(34,31-arm)]:
        put(ax,ay+bob,'w')
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
    # viền tự động
    out=[row[:] for row in g]
    for y in range(H):
        for x in range(W):
            if g[y][x] is None:
                nb=[g[y+dy][x+dx] for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)) if 0<=x+dx<W and 0<=y+dy<H and g[y+dy][x+dx] is not None]
                if nb:
                    out[y][x]='B' if any(c in 'bB' for c in nb) and not any(c in 'wsSh' for c in nb) else ('Y' if all(c in 'yYrk' for c in nb) else 'o')
    return out
def img(g,scale=8,bg=None):
    im=Image.new('RGBA',(W,H),(0,0,0,0) if bg is None else bg+(255,))
    px=im.load()
    for y in range(H):
        for x in range(W):
            c=g[y][x]
            if c: px[x,y]=PAL[c]+(255,)
    return im.resize((W*scale,H*scale),Image.NEAREST)
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
if __name__=='__main__':
    import base64, io, os, sys
    out=os.path.dirname(os.path.abspath(__file__))
    sh=sheet(); sh.save(os.path.join(out,'be_gao_sheet.png'), optimize=True)
    b=io.BytesIO(); sh.save(b,'PNG',optimize=True)
    print('data:image/png;base64,'+base64.b64encode(b.getvalue()).decode())
