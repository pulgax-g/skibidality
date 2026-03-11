const THREE = window.THREE;
delete window.THREE;

const DEFAULT_CFG = {
    // Aimbot
    aimbotEnabled:       true,
    aimbotKey:           'Mouse2',
    aimbotFov:           90,
    aimbotSensitivity:   1.0,
    aimbotHeightOffset:  9,

    // No-recoil
    noRecoilEnabled:     true,
    noRecoilStrength:    3,

    // ESP
    espEnabled:          true,
    espBoxes:            true,
    espDistance:         true,
    espHealthBar:        true,
    espColor:            '#ff2a2a',
    espTargetColor:      '#00ff88',
    espRainbow:          false,     // rainbow cycling ESP boxes + FOV circle

    // FOV circle
    fovVisible:          true,
    fovColor:            '#05d9e8',

    // Crosshair
    crosshairEnabled:    true,
    crosshairColor:      '#ffffff',

    // Bhop
    bunnyhop:            true,
    bhopKey:             'Space',

    // Killsay
    killsayEnabled:      false,
    killsayMessages:     'gg ez|rekt|skibidality on top|L + ratio|too easy',

    // World
    wireframe:           false,
    rgbWireframe:        false,     // player models cycle RGB colors when wireframe is on
};

// Live config — starts as default, overwritten by autoload
let cfg = Object.assign({}, DEFAULT_CFG);

// ═══════════════════════════════════════════════════════════════════════════════
// SAFE REFS
// ═══════════════════════════════════════════════════════════════════════════════

const _ArrayPush     = Array.prototype.push;
const _ArrayProto    = Array.prototype;
const _setTimeout    = window.setTimeout.bind(window);
const _setInterval   = window.setInterval.bind(window);
const _clearInterval = window.clearInterval.bind(window);
const _rAF           = window.requestAnimationFrame.bind(window);

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG PERSISTENCE  (GM_* with localStorage fallback)
// ═══════════════════════════════════════════════════════════════════════════════

const _store = {
    set(k, v)    { try { GM_setValue(k, v); } catch(_) { localStorage.setItem('skib_'+k, JSON.stringify(v)); } },
    get(k, def)  { try { return GM_getValue(k, def); } catch(_) { const r=localStorage.getItem('skib_'+k); return r!==null?JSON.parse(r):def; } },
    del(k)       { try { GM_deleteValue(k); } catch(_) { localStorage.removeItem('skib_'+k); } },
    list()       { try { return GM_listValues(); } catch(_) {
        return Object.keys(localStorage).filter(k=>k.startsWith('skib_')).map(k=>k.slice(5));
    }},
};

const AUTOLOAD_KEY = '__skib_autoload';

function _saveConfig(name) {
    const data = {};
    for (const k in DEFAULT_CFG) data[k] = cfg[k];
    _store.set('cfg_' + name, JSON.stringify(data));
    _toast('Saved: ' + name);
    _renderConfigList();
}

function _loadConfig(name) {
    const raw = _store.get('cfg_' + name, null);
    if (!raw) { _toast('Not found: ' + name); return; }
    try {
        const data = JSON.parse(raw);
        for (const k in DEFAULT_CFG) if (k in data) cfg[k] = data[k];
        _refreshUI();
        _toast('Loaded: ' + name);
    } catch(_) { _toast('Error loading config'); }
}

function _deleteConfig(name) {
    _store.del('cfg_' + name);
    if (_store.get(AUTOLOAD_KEY,'') === name) _store.del(AUTOLOAD_KEY);
    _toast('Deleted: ' + name);
    _renderConfigList();
}

function _setAutoload(name) {
    const cur = _store.get(AUTOLOAD_KEY, '');
    if (cur === name) { _store.del(AUTOLOAD_KEY); _toast('Autoload cleared'); }
    else              { _store.set(AUTOLOAD_KEY, name); _toast('Autoload: ' + name); }
    _renderConfigList();
}

function _exportConfig() {
    const data = {};
    for (const k in DEFAULT_CFG) data[k] = cfg[k];
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'skibidality_cfg.json';
    a.click();
    _toast('Config exported');
}

function _importConfig() {
    const inp = document.createElement('input');
    inp.type   = 'file';
    inp.accept = '.json';
    inp.onchange = e => {
        const f = e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const data = JSON.parse(ev.target.result);
                for (const k in DEFAULT_CFG) if (k in data) cfg[k] = data[k];
                _refreshUI();
                _toast('Config imported');
            } catch(_) { _toast('Invalid config file'); }
        };
        reader.readAsText(f);
    };
    inp.click();
}

function _listSavedConfigs() {
    return _store.list().filter(k => k.startsWith('cfg_')).map(k => k.slice(4));
}

// ── Autoload on startup ───────────────────────────────────────────────────────
(function() {
    const name = _store.get(AUTOLOAD_KEY, '');
    if (name) {
        const raw = _store.get('cfg_' + name, null);
        if (raw) {
            try {
                const data = JSON.parse(raw);
                for (const k in DEFAULT_CFG) if (k in data) cfg[k] = data[k];
                console.log('[Skibidality] Autoloaded config: ' + name);
            } catch(_) {}
        }
    }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// RAINBOW / RGB — shared hue that advances every frame
// ═══════════════════════════════════════════════════════════════════════════════

let _hue = 0; // 0–360, advances each animate() call

function _rainbowHex(offset) {
    // Returns a CSS hex colour at hue+offset
    const h = (_hue + (offset || 0)) % 360;
    const s = 1, l = 0.55;
    // HSL → RGB
    const a = s * Math.min(l, 1 - l);
    const f = n => { const k=(n+h/30)%12; return l-a*Math.max(-1,Math.min(k-3,9-k,1)); };
    const toHex = v => Math.round(v*255).toString(16).padStart(2,'0');
    return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}

function _rainbowRGB(offset) {
    const hex = _rainbowHex(offset);
    return _hexToRGB(hex);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BHOP
// ═══════════════════════════════════════════════════════════════════════════════

let _bhopHeld = false, _bhopIv = null, _bhopTick = false;

function _bhopFire(type) {
    const code = cfg.bhopKey;
    const key  = code === 'Space' ? ' ' : code.replace('Key','').replace('Digit','');
    const kc   = code === 'Space' ? 32  : key.toUpperCase().charCodeAt(0);
    (document.querySelector('canvas') || document.body).dispatchEvent(
        new KeyboardEvent(type, { code, key, keyCode:kc, which:kc, bubbles:true, cancelable:true })
    );
}
function _bhopStart() {
    if (_bhopIv !== null) return;
    _bhopTick = true; _bhopFire('keydown');
    _bhopIv = _setInterval(() => {
        if (!_bhopHeld || !cfg.bunnyhop) { _bhopStop(); return; }
        _bhopTick = !_bhopTick;
        _bhopFire(_bhopTick ? 'keydown' : 'keyup');
    }, 10);
}
function _bhopStop() { _clearInterval(_bhopIv); _bhopIv = null; _bhopFire('keyup'); }

window.addEventListener('keydown', e => {
    if (!e.isTrusted || e.code !== cfg.bhopKey || e.repeat || !cfg.bunnyhop) return;
    e.preventDefault(); e.stopImmediatePropagation();
    _bhopHeld = true; _bhopStart();
}, true);
window.addEventListener('keyup', e => {
    if (!e.isTrusted || e.code !== cfg.bhopKey) return;
    _bhopHeld = false; _bhopStop();
}, true);

// ═══════════════════════════════════════════════════════════════════════════════
// NO-RECOIL
// ═══════════════════════════════════════════════════════════════════════════════

let _lmbHeld = false;
window.addEventListener('mousedown', e => { if (e.button===0) _lmbHeld=true;  });
window.addEventListener('mouseup',   e => { if (e.button===0) _lmbHeld=false; });

function _applyNoRecoil(myPlayer) {
    if (!cfg.noRecoilEnabled || !_lmbHeld) return;
    const bone = myPlayer.children[0]; if (!bone) return;
    const target = bone.rotation.x + cfg.noRecoilStrength * 0.002;
    bone.rotation.x = _lerp(bone.rotation.x, target, Math.min(1, cfg.aimbotSensitivity));
    if (bone.rotation.x > Math.PI/2) bone.rotation.x = Math.PI/2;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AIMBOT KEY STATE
// ═══════════════════════════════════════════════════════════════════════════════

let _rmbHeld = false, _aimKeyHeld = false;
window.addEventListener('pointerdown', e => { if (e.button===2) _rmbHeld=true;  });
window.addEventListener('pointerup',   e => { if (e.button===2) _rmbHeld=false; });
window.addEventListener('keydown', e => { if (e.code===cfg.aimbotKey) _aimKeyHeld=true;  });
window.addEventListener('keyup',   e => { if (e.code===cfg.aimbotKey) _aimKeyHeld=false; });

function _aimbotActive() {
    if (!cfg.aimbotEnabled) return false;
    switch(cfg.aimbotKey) {
        case 'Mouse2': return _rmbHeld;
        case 'Mouse1': return _lmbHeld;
        case 'Always': return true;
        default:       return _aimKeyHeld;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// KILLSAY — detects kills via enemy count drop, types into game chat
// Strategy: find the chat input by common selectors, use nativeInputValueSetter
// to bypass React controlled-input, dispatch input event, then send Enter.
// A cooldown prevents double-fires on the same kill.
// ═══════════════════════════════════════════════════════════════════════════════

let _lastEnemyCount = 0;
let _killsayCooldown = false;

function _doKillsay() {
    if (!cfg.killsayEnabled || _killsayCooldown) return;
    _killsayCooldown = true;
    _setTimeout(() => { _killsayCooldown = false; }, 1500);

    const msgs = cfg.killsayMessages.split('|').map(s => s.trim()).filter(Boolean);
    if (!msgs.length) return;
    const msg = msgs[Math.floor(Math.random() * msgs.length)];

    _setTimeout(() => {
        // Try common chat selectors
        const chatInput = document.querySelector(
            '#chatInput, input[name="chat"], input[placeholder*="chat" i], ' +
            'input[placeholder*="message" i], .chat-input input, .chatbox input'
        );
        if (!chatInput) return;

        // Focus first (opens the chat field)
        chatInput.focus();

        // Use native setter to bypass React's synthetic value tracking
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        )?.set;

        if (nativeSetter) {
            nativeSetter.call(chatInput, msg);
        } else {
            chatInput.value = msg;
        }

        // Dispatch input event so React/Vue/etc. pick up the new value
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        chatInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Small delay then press Enter
        _setTimeout(() => {
            chatInput.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                bubbles: true, cancelable: true
            }));
            chatInput.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                bubbles: true, cancelable: true
            }));
            // Clear field and blur so we don't steal keyboard focus
            if (nativeSetter) nativeSetter.call(chatInput, '');
            else chatInput.value = '';
            chatInput.blur();
        }, 80);
    }, 150);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENE INJECTION
// ═══════════════════════════════════════════════════════════════════════════════

let _scene;
const _proxied = function(obj) {
    try {
        if (typeof obj==='object' && typeof obj.parent==='object' &&
            obj.parent.type==='Scene' && obj.parent.name==='Main') {
            console.log('[Skibidality] Scene found!');
            _scene = obj.parent;
            _ArrayProto.push = _ArrayPush;
        }
    } catch(_) {}
    return _ArrayPush.apply(this, arguments);
};

// ═══════════════════════════════════════════════════════════════════════════════
// THREE.JS MATERIALS
// ═══════════════════════════════════════════════════════════════════════════════

const _AOT_VERT = `
    attribute vec3 position;
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;
    void main(){
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        gl_Position.z=1.0;
    }
`;
function _hexToRGB(h){ return [parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255]; }
function _makeMat(r,g,b){
    return new THREE.RawShaderMaterial({
        vertexShader:_AOT_VERT,
        fragmentShader:`void main(){gl_FragColor=vec4(${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)},1.0);}`,
        depthTest:false
    });
}
let _matBox        = _makeMat(1,0.16,0.16);
let _matBoxTarget  = _makeMat(0,1,0.53);

const _boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(5,15,5).translate(0,7.5,0));

// ═══════════════════════════════════════════════════════════════════════════════
// 2D OVERLAY CANVAS
// ═══════════════════════════════════════════════════════════════════════════════

const _ov  = document.createElement('canvas');
_ov.id     = 'ski-overlay';
_ov.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99997;';
const _ctx = _ov.getContext('2d');

function _resizeOv(){ _ov.width=window.innerWidth; _ov.height=window.innerHeight; }
window.addEventListener('resize', _resizeOv);

function _w2s(pos,cam){
    const v=pos.clone().project(cam);
    return { x:(v.x*.5+.5)*_ov.width, y:(-v.y*.5+.5)*_ov.height, behind:v.z>=1 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ANIMATE LOOP
// ═══════════════════════════════════════════════════════════════════════════════

const _tV=new THREE.Vector3(), _tV2=new THREE.Vector3(), _tO=new THREE.Object3D();
_tO.rotation.order='YXZ';
let _injectTimer=null;

function _animate(){
    _rAF(_animate);

    if(!_scene && !_injectTimer){
        const el=document.querySelector('#loadingBg');
        if(el && el.style.display==='none'){
            _injectTimer=_setTimeout(()=>{ console.log('[Skibidality] Injected!'); _ArrayProto.push=_proxied; },2000);
        }
    }

    _ctx.clearRect(0,0,_ov.width,_ov.height);
    if(!_scene||!_scene.children) return;

    // Advance rainbow hue (~1°/frame at 60fps = full cycle every 6 seconds)
    _hue = (_hue + 1) % 360;

    const enemies=[]; let myPlayer,camera;
    for(let i=0;i<_scene.children.length;i++){
        const c=_scene.children[i];
        if(c.type==='Object3D'){
            try{
                const cam=c.children[0].children[0];
                if(cam.type==='PerspectiveCamera'){ myPlayer=c; camera=cam; }
                else enemies.push(c);
            }catch(_){}
        } else if(c.material){
            c.material.wireframe = cfg.wireframe || cfg.rgbWireframe;
            if(cfg.rgbWireframe && (cfg.wireframe || cfg.rgbWireframe)){
                const [r,g,b] = _rainbowRGB();
                c.material.color?.setRGB(r,g,b);
            } else if(!cfg.rgbWireframe){
                c.material.color?.setRGB(1,1,1);
            }
        }
    }
    if(!myPlayer||!camera){ _ArrayProto.push=_proxied; return; }

    _applyNoRecoil(myPlayer);
    camera.updateMatrixWorld(true);
    _tO.matrix.copy(myPlayer.matrix).invert();

    const fovHalf=(cfg.aimbotFov/2)*(Math.PI/180);
    let target=null, minDist=Infinity;

    // Killsay: detect enemy count drop (kill happened)
    const curEnemyCount = enemies.filter(en =>
        !(Math.abs(en.position.x-myPlayer.position.x)<0.01 && Math.abs(en.position.z-myPlayer.position.z)<0.01)
    ).length;
    if(_lastEnemyCount>0 && curEnemyCount < _lastEnemyCount) _doKillsay();
    _lastEnemyCount = curEnemyCount;

    for(let i=0;i<enemies.length;i++){
        const en=enemies[i];

        if(Math.abs(en.position.x-myPlayer.position.x)<0.01 && Math.abs(en.position.z-myPlayer.position.z)<0.01){
            if(en._skiBox) en._skiBox.visible=false;
            continue;
        }

        // 3D box
        if(!en._skiBox){
            const b=new THREE.LineSegments(_boxGeo, _matBox.clone());
            b.frustumCulled=false; b.isSkibBox=true;
            en.add(b); en._skiBox=b;
        }

        en.visible         = cfg.espEnabled || en.visible;
        en._skiBox.visible = cfg.espEnabled && cfg.espBoxes;

        const dist=Math.round(myPlayer.position.distanceTo(en.position));

        // FOV
        _tV2.copy(en.position).setY(en.position.y+cfg.aimbotHeightOffset).applyMatrix4(_tO.matrix);
        const angle=Math.atan2(Math.sqrt(_tV2.x*_tV2.x+_tV2.y*_tV2.y),-_tV2.z);
        const inFov=angle<=fovHalf;

        if(cfg.espEnabled) _drawESP(en,camera,dist,inFov,i);

        if(inFov && dist<minDist){ target=en; minDist=dist; }

        if(en._skiBox){
            if(cfg.espRainbow){
                // Each enemy gets a hue offset based on its loop index so they differ
                const [r,g,b] = _rainbowRGB(i * 40);
                en._skiBox.material = _makeMat(r,g,b);
            } else {
                en._skiBox.material = (target===en && cfg.aimbotEnabled) ? _matBoxTarget : _matBox;
            }
        }
    }

    if(cfg.fovVisible&&cfg.aimbotEnabled) _drawFov();
    if(cfg.crosshairEnabled) _drawCrosshair();

    // Aimbot
    if(!_aimbotActive() || !target) return;

    _tV.setScalar(0);
    target.children[0]?.children[0]?.localToWorld(_tV);
    _tV.y=target.position.y+cfg.aimbotHeightOffset;
    _tO.position.copy(myPlayer.position);
    _tO.lookAt(_tV);

    const s=Math.max(0.01,Math.min(1,cfg.aimbotSensitivity));
    myPlayer.children[0].rotation.x = _lerp(myPlayer.children[0].rotation.x, -_tO.rotation.x, s);
    myPlayer.rotation.y              = _lerpAngle(myPlayer.rotation.y, _tO.rotation.y + Math.PI, s);
}

function _lerp(a,b,t){ return a+(b-a)*t; }
function _lerpAngle(a,b,t){
    let d=b-a;
    while(d>Math.PI)  d-=Math.PI*2;
    while(d<-Math.PI) d+=Math.PI*2;
    return a+d*t;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2D ESP
// ═══════════════════════════════════════════════════════════════════════════════

function _drawESP(en,cam,dist,isTarget,idx){
    const feet=_w2s(en.position.clone(),cam);
    const head=_w2s(en.position.clone().setY(en.position.y+15),cam);
    if(feet.behind||head.behind) return;

    const top=Math.min(feet.y,head.y), bottom=Math.max(feet.y,head.y), h=bottom-top;
    if(h<4) return;

    const w=h*0.42, cx=(feet.x+head.x)/2, left=cx-w/2;
    const col = cfg.espRainbow ? _rainbowHex((idx||0)*40) : (isTarget ? cfg.espTargetColor : cfg.espColor);
    const cLen=Math.min(w*0.35,h*0.2,12);

    _ctx.save();
    _ctx.strokeStyle=col; _ctx.shadowColor=col+'88'; _ctx.shadowBlur=6;
    _ctx.lineWidth=isTarget?2:1.5;
    _ctx.beginPath();
    _ctx.moveTo(left,top+cLen);    _ctx.lineTo(left,top);       _ctx.lineTo(left+cLen,top);
    _ctx.moveTo(left+w-cLen,top);  _ctx.lineTo(left+w,top);     _ctx.lineTo(left+w,top+cLen);
    _ctx.moveTo(left,bottom-cLen); _ctx.lineTo(left,bottom);    _ctx.lineTo(left+cLen,bottom);
    _ctx.moveTo(left+w-cLen,bottom);_ctx.lineTo(left+w,bottom); _ctx.lineTo(left+w,bottom-cLen);
    _ctx.stroke();
    _ctx.restore();

    if(cfg.espHealthBar){
        const hp=Math.max(5,Math.min(100,110-dist*0.55)), frac=hp/100;
        const bW=Math.max(3,w*0.11), bX=left-bW-2, fillH=h*frac;
        _ctx.fillStyle='rgba(0,0,0,0.6)'; _ctx.fillRect(bX,top,bW,h);
        _ctx.fillStyle=`rgb(${Math.round(255*(1-frac))},${Math.round(200*frac)},20)`;
        _ctx.fillRect(bX,bottom-fillH,bW,fillH);
        _ctx.strokeStyle='rgba(0,0,0,0.5)'; _ctx.lineWidth=.5; _ctx.strokeRect(bX,top,bW,h);
    }

    if(cfg.espDistance){
        const fs=Math.max(9,Math.min(12,h*0.12));
        _ctx.font=`bold ${fs}px "Share Tech Mono",monospace`;
        _ctx.textAlign='center'; _ctx.textBaseline='top';
        _ctx.fillStyle='rgba(0,0,0,0.65)'; _ctx.fillText(dist+'m',cx+1,bottom+5);
        _ctx.fillStyle=col; _ctx.fillText(dist+'m',cx,bottom+4);
    }

    const fs2=Math.max(8,Math.min(11,h*0.1));
    _ctx.font=`${fs2}px "Share Tech Mono",monospace`;
    _ctx.textAlign='center'; _ctx.textBaseline='bottom';
    _ctx.fillStyle='rgba(0,0,0,0.6)'; _ctx.fillText('ENEMY',cx+1,top-1);
    _ctx.fillStyle='#e0e0ff'; _ctx.fillText('ENEMY',cx,top-2);
}

function _drawFov(){
    const cx=_ov.width/2,cy=_ov.height/2;
    const r=Math.min(cx,cy)*(cfg.aimbotFov/180)*0.88;
    const fovCol = cfg.espRainbow ? _rainbowHex(180) : cfg.fovColor;
    _ctx.save(); _ctx.beginPath(); _ctx.arc(cx,cy,r,0,Math.PI*2);
    _ctx.setLineDash([5,5]); _ctx.strokeStyle=fovCol+'99'; _ctx.lineWidth=1;
    _ctx.shadowColor=fovCol+'44'; _ctx.shadowBlur=5; _ctx.stroke();
    _ctx.setLineDash([]); _ctx.restore();
    _ctx.beginPath(); _ctx.arc(cx,cy,2.5,0,Math.PI*2);
    _ctx.fillStyle=fovCol+'cc'; _ctx.fill();
}

function _drawCrosshair(){
    const cx=_ov.width/2,cy=_ov.height/2,col=cfg.crosshairColor;
    _ctx.save(); _ctx.strokeStyle=col; _ctx.lineWidth=1.5;
    _ctx.shadowColor='rgba(0,0,0,0.9)'; _ctx.shadowBlur=3;
    [[cx-15,cy,cx-5,cy],[cx+5,cy,cx+15,cy],[cx,cy-15,cx,cy-5],[cx,cy+5,cx,cy+15]].forEach(([x1,y1,x2,y2])=>{
        _ctx.beginPath(); _ctx.moveTo(x1,y1); _ctx.lineTo(x2,y2); _ctx.stroke();
    });
    _ctx.beginPath(); _ctx.arc(cx,cy,1.5,0,Math.PI*2);
    _ctx.fillStyle=col; _ctx.fill(); _ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════════
// RIGHT MOUSE
// ═══════════════════════════════════════════════════════════════════════════════

window.addEventListener('pointerdown', e=>{ if(e.button===2) _rmbHeld=true; });
window.addEventListener('pointerup',   e=>{ if(e.button===2) _rmbHeld=false; });

// ═══════════════════════════════════════════════════════════════════════════════
// FATALITY CS2-STYLE INTRO SEQUENCE
// ═══════════════════════════════════════════════════════════════════════════════

function _buildIntro(){
    const el=document.createElement('div');
    el.id='skib-intro-screen';
    el.innerHTML=`
<style>
#skib-intro-screen{
    position:fixed;inset:0;z-index:9999999;background:#000;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    font-family:'Rajdhani',sans-serif;overflow:hidden;
    animation:skib-fade-out 0.5s ease 3.2s forwards;
}
#skib-intro-screen::before{
    content:'';position:absolute;inset:0;
    background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(230,57,70,.04) 2px,rgba(230,57,70,.04) 4px);
    pointer-events:none;
}
.skib-intro-line{
    position:absolute;top:50%;left:0;right:0;height:1px;
    background:linear-gradient(90deg,transparent,#e63946,transparent);
    animation:skib-line-spread 0.6s ease 0.2s both;
    transform:translateY(-50%);
}
@keyframes skib-line-spread{
    from{transform:translateY(-50%) scaleX(0);opacity:0;}
    to{transform:translateY(-50%) scaleX(1);opacity:1;}
}
.skib-intro-panels{
    position:absolute;top:0;left:0;right:0;display:flex;height:100%;
}
.skib-intro-panel{
    flex:1;background:#0a0a0f;transform:scaleY(0);
    animation:skib-panel-in 0.5s ease var(--d) both;
}
@keyframes skib-panel-in{
    from{transform:scaleY(0);} to{transform:scaleY(1);}
}
.skib-intro-logo{
    position:relative;z-index:2;text-align:center;
    animation:skib-logo-in 0.6s cubic-bezier(.22,1,.36,1) 0.7s both;
}
@keyframes skib-logo-in{
    from{opacity:0;transform:scale(1.3) translateY(20px);filter:brightness(3);}
    to{opacity:1;transform:none;filter:none;}
}
.skib-intro-wordmark{
    font-size:72px;font-weight:700;letter-spacing:12px;text-transform:uppercase;
    color:transparent;
    background:linear-gradient(90deg,#e63946,#ff6b6b,#e63946);
    -webkit-background-clip:text;background-clip:text;
    text-shadow:none;line-height:1;
}
.skib-intro-sub{
    font-family:'Share Tech Mono',monospace;font-size:14px;
    letter-spacing:6px;color:#6666aa;margin-top:8px;text-transform:uppercase;
    animation:skib-sub-in 0.5s ease 1.2s both;
}
@keyframes skib-sub-in{ from{opacity:0;letter-spacing:14px;} to{opacity:1;letter-spacing:6px;} }
.skib-intro-version{
    font-family:'Share Tech Mono',monospace;font-size:11px;
    color:#e63946;letter-spacing:3px;margin-top:16px;
    animation:skib-sub-in 0.4s ease 1.4s both;
}
.skib-intro-bar{
    position:absolute;bottom:60px;left:50%;transform:translateX(-50%);
    width:200px;height:2px;background:#1c1c30;
    animation:skib-sub-in 0.4s ease 1.5s both;
}
.skib-intro-bar-fill{
    height:100%;width:0;background:#e63946;
    box-shadow:0 0 8px #e63946;
    animation:skib-bar-fill 1.4s ease 1.6s both;
}
@keyframes skib-bar-fill{ from{width:0;} to{width:100%;} }
.skib-intro-status{
    position:absolute;bottom:38px;left:50%;transform:translateX(-50%);
    font-family:'Share Tech Mono',monospace;font-size:10px;
    color:#44446a;letter-spacing:3px;white-space:nowrap;
    animation:skib-sub-in 0.4s ease 1.5s both;
}
@keyframes skib-fade-out{
    0%{opacity:1;pointer-events:all;}
    100%{opacity:0;pointer-events:none;}
}
.skib-glitch{
    position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;
    animation:skib-glitch-anim 0.12s steps(1) 1.8s 3;
}
@keyframes skib-glitch-anim{
    0%{clip-path:inset(20% 0 60% 0);transform:translate(-4px);}
    33%{clip-path:inset(50% 0 20% 0);transform:translate(4px);}
    66%{clip-path:inset(5% 0 80% 0);transform:translate(-2px);}
    100%{clip-path:none;transform:none;}
}
</style>
<div class="skib-intro-panels">
    <div class="skib-intro-panel" style="--d:0s"></div>
    <div class="skib-intro-panel" style="--d:0.05s"></div>
    <div class="skib-intro-panel" style="--d:0.1s"></div>
    <div class="skib-intro-panel" style="--d:0.15s"></div>
    <div class="skib-intro-panel" style="--d:0.2s"></div>
</div>
<div class="skib-intro-line"></div>
<div class="skib-intro-logo">
    <div class="skib-intro-wordmark">SKIBIDALITY</div>
    <div class="skib-intro-sub">External / HvH / v7.0</div>
    <div class="skib-intro-version">[ BUILD 7.0.0 RELEASE ]</div>
</div>
<div class="skib-intro-bar"><div class="skib-intro-bar-fill"></div></div>
<div class="skib-intro-status">INITIALIZING MODULES...</div>
<div class="skib-glitch"></div>
`;
    document.body.appendChild(el);
    // Remove from DOM after animation
    _setTimeout(()=>el.remove(), 3800);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GUI — CSS
// ═══════════════════════════════════════════════════════════════════════════════

const _CSS=`
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
:root{
    --bg:#08080f; --panel:#0d0d1a; --border:#1c1c30;
    --acc:#e63946; --dim:#6666aa; --white:#e0e0f0;
    --on:#39e67a; --head:#0f0f1e;
}
#skib-root *{box-sizing:border-box;user-select:none;}
#skib-root{font-family:'Rajdhani',sans-serif;}

/* ── Menu ── */
#skib-menu{
    position:fixed;top:70px;left:70px;width:420px;
    background:var(--bg);border:1px solid var(--border);
    box-shadow:0 0 60px rgba(0,0,0,.95),0 0 0 1px rgba(230,57,70,.1) inset;
    z-index:999999;overflow:hidden;
    animation:skib-in .35s cubic-bezier(.22,1,.36,1) both;
}
@keyframes skib-in{from{opacity:0;transform:translateY(-12px) scale(.97)}to{opacity:1;transform:none}}

/* ── Header ── */
#skib-hdr{
    position:relative;height:72px;background:var(--head);
    display:flex;align-items:center;padding:0 18px;gap:14px;
    cursor:grab;border-bottom:1px solid var(--border);overflow:hidden;
}
#skib-hdr::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--acc);box-shadow:0 0 16px rgba(230,57,70,.5);}
#skib-hdr::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,var(--acc) 0%,transparent 65%);}
#skib-logo{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:26px;letter-spacing:4px;text-transform:uppercase;color:var(--white);line-height:1;}
#skib-logo span{color:var(--acc);text-shadow:0 0 14px rgba(230,57,70,.6);}
#skib-sub{font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--dim);letter-spacing:2px;margin-top:3px;}
#skib-close{position:absolute;right:14px;top:50%;transform:translateY(-50%);width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--dim);font-size:20px;border-radius:2px;transition:color .15s,background .15s;}
#skib-close:hover{color:var(--acc);background:rgba(230,57,70,.12);}

/* ── Tabs ── */
#skib-tabs{display:flex;background:var(--head);border-bottom:1px solid var(--border);}
.skib-tab{flex:1;padding:10px 0;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:var(--dim);text-align:center;cursor:pointer;position:relative;transition:color .15s;}
.skib-tab::after{content:'';position:absolute;bottom:0;left:15%;right:15%;height:2px;background:var(--acc);transform:scaleX(0);transition:transform .2s;}
.skib-tab:hover{color:var(--white);}
.skib-tab.active{color:var(--white);}
.skib-tab.active::after{transform:scaleX(1);}

/* ── Content ── */
#skib-content{padding:10px 0 8px;max-height:560px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#1c1c30 transparent;}
#skib-content::-webkit-scrollbar{width:3px;}
#skib-content::-webkit-scrollbar-thumb{background:var(--border);}
.skib-panel{display:none;} .skib-panel.active{display:block;}
.skib-sec{padding:10px 16px 5px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--dim);font-family:'Share Tech Mono',monospace;}

/* ── Toggle Row ── */
.skib-row{display:flex;align-items:center;justify-content:space-between;padding:9px 16px;cursor:pointer;transition:background .12s;position:relative;}
.skib-row::before{content:'';position:absolute;left:0;top:0;bottom:0;width:0;background:var(--acc);transition:width .12s;}
.skib-row:hover{background:rgba(255,255,255,.03);} .skib-row:hover::before{width:2px;}
.skib-row-label{font-size:15px;font-weight:600;color:var(--white);letter-spacing:.5px;}
.skib-row-key{font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--dim);margin-left:7px;}
.skib-toggle{position:relative;width:42px;height:21px;border-radius:11px;background:#1e1e35;border:1px solid #2a2a45;transition:all .2s;flex-shrink:0;}
.skib-toggle::after{content:'';position:absolute;left:3px;top:3px;width:13px;height:13px;border-radius:50%;background:var(--dim);transition:transform .2s,background .2s;}
.skib-toggle.on{background:rgba(57,230,122,.15);border-color:var(--on);}
.skib-toggle.on::after{transform:translateX(21px);background:var(--on);box-shadow:0 0 6px rgba(57,230,122,.6);}

/* ── Slider Row ── */
.skib-slider-row{display:flex;flex-direction:column;gap:7px;padding:9px 16px;transition:background .12s;}
.skib-slider-row:hover{background:rgba(255,255,255,.02);}
.skib-slider-top{display:flex;justify-content:space-between;align-items:center;}
.skib-slider-label{font-size:15px;font-weight:600;color:var(--white);letter-spacing:.5px;}
.skib-slider-val{font-size:14px;font-family:'Share Tech Mono',monospace;color:var(--acc);min-width:54px;text-align:right;}
input[type=range].skib-range{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:0;outline:none;cursor:pointer;background:linear-gradient(90deg,var(--acc) var(--pct,50%),#1e1e2e var(--pct,50%));}
input[type=range].skib-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:15px;height:15px;border-radius:2px;background:var(--acc);box-shadow:0 0 8px rgba(230,57,70,.6);cursor:pointer;}

/* ── Color Row ── */
.skib-color-row{display:flex;align-items:center;justify-content:space-between;padding:9px 16px;transition:background .12s;}
.skib-color-row:hover{background:rgba(255,255,255,.02);}
.skib-color-label{font-size:15px;font-weight:600;color:var(--white);}
.skib-color-wrap{display:flex;align-items:center;gap:8px;}
.skib-color-hex{font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--dim);text-transform:uppercase;}
input[type=color].skib-color{width:32px;height:24px;border:1px solid var(--border);background:none;padding:2px;cursor:pointer;border-radius:2px;}

/* ── Keybind Row ── */
.skib-bind-row{display:flex;align-items:center;justify-content:space-between;padding:9px 16px;transition:background .12s;}
.skib-bind-row:hover{background:rgba(255,255,255,.02);}
.skib-bind-label{font-size:15px;font-weight:600;color:var(--white);}
.skib-bind-btn{font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--acc);background:#14142a;border:1px solid var(--border);padding:5px 14px;cursor:pointer;letter-spacing:1px;min-width:90px;text-align:center;transition:background .15s;}
.skib-bind-btn:hover{background:#1e1e3e;}
.skib-bind-btn.listening{color:#ffdd57;border-color:#ffdd57;animation:skib-blink .5s infinite;}
@keyframes skib-blink{0%,100%{opacity:1}50%{opacity:.35}}

/* ── Preset buttons ── */
.skib-preset-btn{flex:1;text-align:center;padding:5px 0;font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:1px;color:var(--dim);background:#14142a;border:1px solid var(--border);cursor:pointer;transition:all .15s;text-transform:uppercase;}
.skib-preset-btn:hover{background:#1e1e3e;color:var(--white);}
.skib-preset-btn.active-preset{background:rgba(230,57,70,.15);border-color:var(--acc);color:var(--acc);}

/* ── Textarea row ── */
.skib-textarea-row{padding:8px 16px;}
.skib-textarea-label{font-size:13px;font-weight:600;color:var(--dim);margin-bottom:5px;display:block;font-family:'Share Tech Mono',monospace;letter-spacing:1px;}
textarea.skib-textarea{width:100%;background:#0d0d1a;border:1px solid var(--border);color:var(--white);font-family:'Share Tech Mono',monospace;font-size:11px;padding:6px 8px;resize:vertical;min-height:58px;outline:none;transition:border-color .15s;user-select:text;}
textarea.skib-textarea:focus{border-color:var(--acc);}

/* ── Config panel ── */
.skib-cfg-name-row{display:flex;gap:6px;padding:8px 16px;}
input.skib-cfg-name{flex:1;background:#0d0d1a;border:1px solid var(--border);color:var(--white);font-family:'Share Tech Mono',monospace;font-size:12px;padding:5px 8px;outline:none;transition:border-color .15s;user-select:text;}
input.skib-cfg-name:focus{border-color:var(--acc);}
.skib-cfg-btn{font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--white);background:#14142a;border:1px solid var(--border);padding:5px 10px;cursor:pointer;white-space:nowrap;transition:all .15s;letter-spacing:.5px;}
.skib-cfg-btn:hover{background:#1e1e3e;border-color:var(--acc);color:var(--acc);}
.skib-cfg-btn.danger:hover{border-color:#e63946;color:#e63946;}
.skib-cfg-io-row{display:flex;gap:6px;padding:4px 16px 8px;}
.skib-cfg-list{padding:0 16px 8px;}
.skib-cfg-entry{display:flex;align-items:center;gap:6px;padding:5px 8px;background:#0d0d1a;border:1px solid var(--border);margin-bottom:4px;transition:border-color .15s;}
.skib-cfg-entry:hover{border-color:#2a2a45;}
.skib-cfg-entry-name{flex:1;font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--white);}
.skib-cfg-entry-auto{font-size:9px;font-family:'Share Tech Mono',monospace;color:var(--acc);letter-spacing:1px;margin-left:2px;}
.skib-cfg-entry button{font-family:'Share Tech Mono',monospace;font-size:10px;padding:3px 7px;background:transparent;border:1px solid var(--border);color:var(--dim);cursor:pointer;transition:all .15s;letter-spacing:.5px;}
.skib-cfg-entry button:hover{border-color:var(--acc);color:var(--acc);}
.skib-cfg-empty{font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--dim);text-align:center;padding:12px 0;}

/* ── Divider ── */
.skib-div{height:1px;background:var(--border);margin:6px 16px;}

/* ── Footer ── */
#skib-footer{padding:7px 16px 10px;font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--dim);letter-spacing:1px;display:flex;justify-content:space-between;border-top:1px solid var(--border);}
#skib-footer span{color:var(--acc);}

/* ── Toast ── */
#skib-toast{position:fixed;bottom:22px;left:22px;background:var(--panel);border:1px solid var(--border);border-left:3px solid var(--acc);color:var(--white);font-family:'Share Tech Mono',monospace;font-size:13px;letter-spacing:1px;padding:10px 18px;z-index:9999999;pointer-events:none;opacity:0;transform:translateY(10px);transition:opacity .25s,transform .25s;box-shadow:0 4px 22px rgba(0,0,0,.75);}

/* ── Watermark ── */
#skib-wm{position:fixed;top:10px;right:14px;font-family:'Share Tech Mono',monospace;font-size:12px;letter-spacing:2px;color:rgba(230,57,70,.45);z-index:999998;pointer-events:none;text-transform:uppercase;}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// GUI — BUILD DOM
// ═══════════════════════════════════════════════════════════════════════════════

function _kLabel(c){
    if(!c||c==='Always') return 'ALWAYS';
    const m={'Mouse1':'MOUSE1','Mouse2':'MOUSE2','Mouse3':'MOUSE3','Space':'SPACE'};
    return m[c]||(c.replace('Key','').replace('Digit',''));
}

const _root=document.createElement('div'); _root.id='skib-root';
const _styleEl=document.createElement('style'); _styleEl.textContent=_CSS; _root.appendChild(_styleEl);
const _toastEl=document.createElement('div'); _toastEl.id='skib-toast'; _root.appendChild(_toastEl);
const _wmEl=document.createElement('div'); _wmEl.id='skib-wm'; _wmEl.textContent='SKIBIDALITY v7.0'; _root.appendChild(_wmEl);

const _menuEl=document.createElement('div'); _menuEl.id='skib-menu';
_menuEl.innerHTML=`
<div id="skib-hdr">
    <div><div id="skib-logo">SKIBID<span>ALITY</span></div><div id="skib-sub">EXTERNAL / HVH / v7.0</div></div>
    <div id="skib-close">✕</div>
</div>
<div id="skib-tabs">
    <div class="skib-tab active" data-tab="aimbot">AIMBOT</div>
    <div class="skib-tab" data-tab="visuals">VISUALS</div>
    <div class="skib-tab" data-tab="misc">MISC</div>
    <div class="skib-tab" data-tab="config">CONFIG</div>
</div>
<div id="skib-content">

<!-- ══ AIMBOT ══ -->
<div class="skib-panel active" data-panel="aimbot">
    <div class="skib-sec">// Targeting</div>
    <div class="skib-row" data-key="aimbotEnabled"><div><span class="skib-row-label">Aimbot</span></div><div class="skib-toggle" id="toggle-aimbotEnabled"></div></div>
    <div class="skib-bind-row"><span class="skib-bind-label">Aimbot Key</span><div class="skib-bind-btn" id="bind-aimbotKey">${_kLabel(cfg.aimbotKey)}</div></div>

    <div class="skib-div"></div>
    <div class="skib-sec">// FOV</div>
    <div class="skib-slider-row">
        <div class="skib-slider-top"><span class="skib-slider-label">FOV Radius</span><span class="skib-slider-val" id="val-aimbotFov">${cfg.aimbotFov}°</span></div>
        <input type="range" class="skib-range" id="slider-aimbotFov" min="1" max="180" value="${cfg.aimbotFov}">
    </div>
    <div class="skib-row" data-key="fovVisible"><div><span class="skib-row-label">Show FOV Circle</span></div><div class="skib-toggle" id="toggle-fovVisible"></div></div>
    <div class="skib-color-row"><span class="skib-color-label">FOV Color</span><div class="skib-color-wrap"><span class="skib-color-hex" id="hex-fovColor">${cfg.fovColor.toUpperCase()}</span><input type="color" class="skib-color" id="color-fovColor" value="${cfg.fovColor}"></div></div>

    <div class="skib-div"></div>
    <div class="skib-sec">// Aim Config</div>
    <div class="skib-slider-row">
        <div class="skib-slider-top"><span class="skib-slider-label">Sensitivity</span><span class="skib-slider-val" id="val-aimbotSensitivity">1.00x</span></div>
        <input type="range" class="skib-range" id="slider-aimbotSensitivity" min="1" max="100" value="100">
    </div>
    <div class="skib-slider-row">
        <div class="skib-slider-top"><span class="skib-slider-label">Aim Height</span><span class="skib-slider-val" id="val-aimbotHeightOffset">${cfg.aimbotHeightOffset}</span></div>
        <div style="display:flex;gap:6px;margin-bottom:5px;">
            <div class="skib-preset-btn" id="preset-head" data-h="9">HEAD (9)</div>
            <div class="skib-preset-btn" id="preset-torso" data-h="6">TORSO (6)</div>
        </div>
        <input type="range" class="skib-range" id="slider-aimbotHeightOffset" min="0" max="15" value="${cfg.aimbotHeightOffset}">
    </div>

    <div class="skib-div"></div>
    <div class="skib-sec">// No Recoil</div>
    <div class="skib-row" data-key="noRecoilEnabled"><div><span class="skib-row-label">No Recoil</span></div><div class="skib-toggle" id="toggle-noRecoilEnabled"></div></div>
    <div class="skib-slider-row">
        <div class="skib-slider-top"><span class="skib-slider-label">Recoil Strength</span><span class="skib-slider-val" id="val-noRecoilStrength">${cfg.noRecoilStrength}</span></div>
        <input type="range" class="skib-range" id="slider-noRecoilStrength" min="1" max="20" value="${cfg.noRecoilStrength}">
    </div>
</div>

<!-- ══ VISUALS ══ -->
<div class="skib-panel" data-panel="visuals">
    <div class="skib-sec">// ESP</div>
    <div class="skib-row" data-key="espEnabled"><div><span class="skib-row-label">ESP</span></div><div class="skib-toggle" id="toggle-espEnabled"></div></div>
    <div class="skib-row" data-key="espRainbow"><div><span class="skib-row-label">Rainbow ESP + FOV</span></div><div class="skib-toggle" id="toggle-espRainbow"></div></div>
    <div class="skib-row" data-key="espBoxes"><div><span class="skib-row-label">Boxes</span></div><div class="skib-toggle" id="toggle-espBoxes"></div></div>
    <div class="skib-row" data-key="espDistance"><div><span class="skib-row-label">Distance</span></div><div class="skib-toggle" id="toggle-espDistance"></div></div>
    <div class="skib-row" data-key="espHealthBar"><div><span class="skib-row-label">Health Bar</span></div><div class="skib-toggle" id="toggle-espHealthBar"></div></div>

    <div class="skib-div"></div>
    <div class="skib-sec">// ESP Colors</div>
    <div class="skib-color-row"><span class="skib-color-label">Enemy</span><div class="skib-color-wrap"><span class="skib-color-hex" id="hex-espColor">${cfg.espColor.toUpperCase()}</span><input type="color" class="skib-color" id="color-espColor" value="${cfg.espColor}"></div></div>
    <div class="skib-color-row"><span class="skib-color-label">Target</span><div class="skib-color-wrap"><span class="skib-color-hex" id="hex-espTargetColor">${cfg.espTargetColor.toUpperCase()}</span><input type="color" class="skib-color" id="color-espTargetColor" value="${cfg.espTargetColor}"></div></div>

    <div class="skib-div"></div>
    <div class="skib-sec">// Crosshair</div>
    <div class="skib-row" data-key="crosshairEnabled"><div><span class="skib-row-label">Crosshair</span></div><div class="skib-toggle" id="toggle-crosshairEnabled"></div></div>
    <div class="skib-color-row"><span class="skib-color-label">Color</span><div class="skib-color-wrap"><span class="skib-color-hex" id="hex-crosshairColor">${cfg.crosshairColor.toUpperCase()}</span><input type="color" class="skib-color" id="color-crosshairColor" value="${cfg.crosshairColor}"></div></div>

    <div class="skib-div"></div>
    <div class="skib-sec">// World</div>
    <div class="skib-row" data-key="wireframe"><div><span class="skib-row-label">Wireframe</span></div><div class="skib-toggle" id="toggle-wireframe"></div></div>
    <div class="skib-row" data-key="rgbWireframe"><div><span class="skib-row-label">RGB Wireframe</span></div><div class="skib-toggle" id="toggle-rgbWireframe"></div></div>
</div>

<!-- ══ MISC ══ -->
<div class="skib-panel" data-panel="misc">
    <div class="skib-sec">// Bunny Hop</div>
    <div class="skib-row" data-key="bunnyhop"><div><span class="skib-row-label">Bunny Hop</span></div><div class="skib-toggle" id="toggle-bunnyhop"></div></div>
    <div class="skib-bind-row"><span class="skib-bind-label">Bhop Key</span><div class="skib-bind-btn" id="bind-bhopKey">${_kLabel(cfg.bhopKey)}</div></div>

    <div class="skib-div"></div>
    <div class="skib-sec">// Killsay</div>
    <div class="skib-row" data-key="killsayEnabled"><div><span class="skib-row-label">Killsay</span></div><div class="skib-toggle" id="toggle-killsayEnabled"></div></div>
    <div class="skib-textarea-row">
        <label class="skib-textarea-label">Messages (pipe-separated)</label>
        <textarea class="skib-textarea" id="textarea-killsayMessages" placeholder="gg ez|rekt|skibidality">${cfg.killsayMessages}</textarea>
    </div>

    <div class="skib-div"></div>
    <div class="skib-sec">// Info</div>
    <div class="skib-row" style="cursor:default;pointer-events:none;opacity:.4;"><span class="skib-row-label" style="font-size:13px;">[INSERT] show / hide menu</span></div>
</div>

<!-- ══ CONFIG ══ -->
<div class="skib-panel" data-panel="config">
    <div class="skib-sec">// Save Config</div>
    <div class="skib-cfg-name-row">
        <input class="skib-cfg-name" id="cfg-name-input" type="text" placeholder="config name..." maxlength="32">
        <button class="skib-cfg-btn" id="cfg-save-btn">SAVE</button>
    </div>

    <div class="skib-sec">// Saved Configs</div>
    <div class="skib-cfg-list" id="skib-cfg-list"></div>

    <div class="skib-sec">// Import / Export</div>
    <div class="skib-cfg-io-row">
        <button class="skib-cfg-btn" id="cfg-export-btn">EXPORT .JSON</button>
        <button class="skib-cfg-btn" id="cfg-import-btn">IMPORT .JSON</button>
    </div>

    <div class="skib-sec" style="color:#44446a;font-size:9px;">
        // Click AUTOLOAD on a config to auto-apply it on next page load
    </div>
</div>

</div><!-- #skib-content -->
<div id="skib-footer"><span>skibidality.gg</span><span>hvh v7</span></div>
`;
_root.appendChild(_menuEl);

// ═══════════════════════════════════════════════════════════════════════════════
// INJECT
// ═══════════════════════════════════════════════════════════════════════════════

function _injectUI(){
    document.body.appendChild(_root);
    document.body.appendChild(_ov);
    _resizeOv();
    _buildIntro();
    _initMenu();
    _refreshToggles();
}

if(document.body) _injectUI();
else window.addEventListener('DOMContentLoaded', _injectUI);

// ═══════════════════════════════════════════════════════════════════════════════
// MENU INIT
// ═══════════════════════════════════════════════════════════════════════════════

function _initMenu(){
    _menuEl.querySelector('#skib-close').addEventListener('click',()=>{ _menuEl.style.display='none'; });

    // Tabs
    _menuEl.querySelectorAll('.skib-tab').forEach(tab=>{
        tab.addEventListener('click',()=>{
            _menuEl.querySelectorAll('.skib-tab').forEach(t=>t.classList.remove('active'));
            _menuEl.querySelectorAll('.skib-panel').forEach(p=>p.classList.remove('active'));
            tab.classList.add('active');
            _menuEl.querySelector(`.skib-panel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
        });
    });

    // Toggle rows
    _menuEl.addEventListener('click',e=>{
        const row=e.target.closest('.skib-row[data-key]');
        if(row) _toggleBool(row.dataset.key);
    });

    // Preset buttons
    function _syncPresets(){
        document.getElementById('preset-head') ?.classList.toggle('active-preset',cfg.aimbotHeightOffset===9);
        document.getElementById('preset-torso')?.classList.toggle('active-preset',cfg.aimbotHeightOffset===6);
    }
    document.querySelectorAll('.skib-preset-btn').forEach(btn=>{
        btn.addEventListener('click',()=>{
            const h=+btn.dataset.h;
            cfg.aimbotHeightOffset=h;
            const sl=document.getElementById('slider-aimbotHeightOffset');
            const dv=document.getElementById('val-aimbotHeightOffset');
            if(sl){ sl.value=h; sl.style.setProperty('--pct',(h/15*100).toFixed(1)+'%'); }
            if(dv) dv.textContent=h;
            _syncPresets();
        });
    });
    _syncPresets();

    // Sliders
    _setupSlider('aimbotFov',1,180,v=>v+'°',v=>+v);
    _setupSlider('aimbotSensitivity',1,100,v=>(v/100).toFixed(2)+'x',v=>+(v/100).toFixed(2));
    _setupSlider('aimbotHeightOffset',0,15,v=>v,v=>+v,()=>_syncPresets());
    _setupSlider('noRecoilStrength',1,20,v=>v,v=>+v);

    // Colors
    _setupColor('espColor',       (r,g,b)=>{ _matBox=_makeMat(r,g,b); });
    _setupColor('espTargetColor', (r,g,b)=>{ _matBoxTarget=_makeMat(r,g,b); });
    _setupColor('fovColor',       ()=>{});
    _setupColor('crosshairColor', ()=>{});

    // Keybinds
    _setupBind('aimbotKey');
    _setupBind('bhopKey');

    // Killsay textarea
    const ksTa=document.getElementById('textarea-killsayMessages');
    if(ksTa){ ksTa.addEventListener('input',()=>{ cfg.killsayMessages=ksTa.value; }); }

    // Config panel
    document.getElementById('cfg-save-btn').addEventListener('click',()=>{
        const n=document.getElementById('cfg-name-input').value.trim();
        if(!n){ _toast('Enter a config name'); return; }
        _saveConfig(n);
        document.getElementById('cfg-name-input').value='';
    });
    document.getElementById('cfg-export-btn').addEventListener('click',_exportConfig);
    document.getElementById('cfg-import-btn').addEventListener('click',_importConfig);
    _renderConfigList();

    // Drag
    const hdr=_menuEl.querySelector('#skib-hdr');
    let _drag={on:false,ox:0,oy:0};
    hdr.addEventListener('mousedown',e=>{ _drag.on=true; _drag.ox=e.clientX-_menuEl.offsetLeft; _drag.oy=e.clientY-_menuEl.offsetTop; hdr.style.cursor='grabbing'; e.preventDefault(); });
    window.addEventListener('mousemove',e=>{ if(!_drag.on) return; _menuEl.style.left=Math.max(0,Math.min(window.innerWidth-_menuEl.offsetWidth,e.clientX-_drag.ox))+'px'; _menuEl.style.top=Math.max(0,Math.min(window.innerHeight-_menuEl.offsetHeight,e.clientY-_drag.oy))+'px'; });
    window.addEventListener('mouseup',()=>{ _drag.on=false; hdr.style.cursor='grab'; });
}

// ── Config list renderer ──────────────────────────────────────────────────────
function _renderConfigList(){
    const list=document.getElementById('skib-cfg-list');
    if(!list) return;
    const configs=_listSavedConfigs();
    const autoload=_store.get(AUTOLOAD_KEY,'');
    if(!configs.length){ list.innerHTML='<div class="skib-cfg-empty">No saved configs</div>'; return; }
    list.innerHTML=configs.map(name=>`
<div class="skib-cfg-entry" data-cfg="${name}">
    <span class="skib-cfg-entry-name">${name}${autoload===name?'<span class="skib-cfg-entry-auto"> ★AUTO</span>':''}</span>
    <button data-action="load"  data-cfg="${name}">LOAD</button>
    <button data-action="auto"  data-cfg="${name}">${autoload===name?'★ AUTO':'AUTOLOAD'}</button>
    <button data-action="del"   data-cfg="${name}" class="danger">DEL</button>
</div>`).join('');
    list.querySelectorAll('button[data-action]').forEach(btn=>{
        btn.addEventListener('click',e=>{
            e.stopPropagation();
            const n=btn.dataset.cfg;
            if(btn.dataset.action==='load') _loadConfig(n);
            if(btn.dataset.action==='auto') _setAutoload(n);
            if(btn.dataset.action==='del')  _deleteConfig(n);
        });
    });
}

// ── Slider helper ────────────────────────────────────────────────────────────
function _setupSlider(key,sMin,sMax,displayFn,valueFn,onChangeCb){
    const slider=document.getElementById('slider-'+key);
    const display=document.getElementById('val-'+key);
    if(!slider||!display) return;
    let best=sMin;
    for(let v=sMin;v<=sMax;v++) if(Math.abs(valueFn(v)-cfg[key])<Math.abs(valueFn(best)-cfg[key])) best=v;
    slider.value=best; display.textContent=displayFn(best);
    slider.style.setProperty('--pct',((best-sMin)/(sMax-sMin)*100).toFixed(1)+'%');
    slider.addEventListener('input',e=>{
        const v=+e.target.value;
        cfg[key]=valueFn(v); display.textContent=displayFn(v);
        slider.style.setProperty('--pct',((v-sMin)/(sMax-sMin)*100).toFixed(1)+'%');
        if(onChangeCb) onChangeCb(v);
    });
}

// ── Color helper ─────────────────────────────────────────────────────────────
function _setupColor(key,onChangeCb){
    const picker=document.getElementById('color-'+key);
    const hexEl=document.getElementById('hex-'+key);
    if(!picker||!hexEl) return;
    picker.addEventListener('input',e=>{
        cfg[key]=e.target.value; hexEl.textContent=e.target.value.toUpperCase();
        const [r,g,b]=_hexToRGB(cfg[key]); onChangeCb(r,g,b);
    });
}

// ── Keybind helper ────────────────────────────────────────────────────────────
let _listeningFor=null;
function _setupBind(cfgKey){
    const btn=document.getElementById('bind-'+cfgKey);
    if(!btn) return;
    btn.addEventListener('click',()=>{
        if(_listeningFor){ const p=document.getElementById('bind-'+_listeningFor); if(p) p.classList.remove('listening'); }
        _listeningFor=cfgKey; btn.classList.add('listening'); btn.textContent='...';
    });
}
window.addEventListener('keydown',e=>{
    if(!_listeningFor) return;
    e.preventDefault(); e.stopImmediatePropagation();
    cfg[_listeningFor]=e.code;
    const btn=document.getElementById('bind-'+_listeningFor);
    if(btn){ btn.textContent=_kLabel(e.code); btn.classList.remove('listening'); }
    _listeningFor=null;
},true);
window.addEventListener('mousedown',e=>{
    if(!_listeningFor) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const code=['Mouse1','Mouse2','Mouse3'][e.button]||('Mouse'+e.button);
    cfg[_listeningFor]=code;
    const btn=document.getElementById('bind-'+_listeningFor);
    if(btn){ btn.textContent=_kLabel(code); btn.classList.remove('listening'); }
    _listeningFor=null;
},true);

// ── Bool toggle ───────────────────────────────────────────────────────────────
function _toggleBool(key){
    cfg[key]=!cfg[key]; _refreshToggles();
    _toast(key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase())+': '+(cfg[key]?'ON':'OFF'));
}

function _refreshToggles(){
    ['aimbotEnabled','noRecoilEnabled',
     'fovVisible','espEnabled','espRainbow','espBoxes','espDistance','espHealthBar',
     'crosshairEnabled','wireframe','rgbWireframe','bunnyhop','killsayEnabled'].forEach(k=>{
        const el=document.getElementById('toggle-'+k);
        if(el) el.className='skib-toggle'+(cfg[k]?' on':'');
    });
}

// Full UI refresh (after config load)
function _refreshUI(){
    _refreshToggles();
    // Sliders
    ['aimbotFov','aimbotSensitivity','aimbotHeightOffset','noRecoilStrength'].forEach(k=>{
        const sl=document.getElementById('slider-'+k); if(sl) sl.dispatchEvent(new Event('_manual'));
    });
    // Colors
    ['espColor','espTargetColor','fovColor','crosshairColor'].forEach(k=>{
        const p=document.getElementById('color-'+k);
        const h=document.getElementById('hex-'+k);
        if(p){ p.value=cfg[k]; } if(h) h.textContent=cfg[k].toUpperCase();
    });
    // Keybinds
    ['aimbotKey','bhopKey'].forEach(k=>{
        const b=document.getElementById('bind-'+k); if(b) b.textContent=_kLabel(cfg[k]);
    });
    // Killsay textarea
    const ta=document.getElementById('textarea-killsayMessages');
    if(ta) ta.value=cfg.killsayMessages;
    // Rebuild materials
    { const [r,g,b]=_hexToRGB(cfg.espColor);       _matBox=_makeMat(r,g,b); }
    { const [r,g,b]=_hexToRGB(cfg.espTargetColor);  _matBoxTarget=_makeMat(r,g,b); }
}

// ── Insert key ────────────────────────────────────────────────────────────────
window.addEventListener('keyup',e=>{
    if(_listeningFor) return;
    if(document.activeElement?.tagName==='INPUT'||document.activeElement?.tagName==='TEXTAREA') return;
    if(e.code==='Insert') _menuEl.style.display=_menuEl.style.display==='none'?'':'none';
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════════

let _toastTimer;
function _toast(msg){
    _toastEl.textContent=msg; _toastEl.style.opacity='1'; _toastEl.style.transform='translateY(0)';
    clearTimeout(_toastTimer);
    _toastTimer=setTimeout(()=>{ _toastEl.style.opacity='0'; _toastEl.style.transform='translateY(10px)'; },2200);
}

// ═══════════════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════════════

_animate();
