'use strict';
const $ = (s, e = document) => e.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const today = () => new Date().toLocaleDateString('sv');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
};
const bytesToB64 = s => { const b = new TextEncoder().encode(s); let t = ''; b.forEach(x => t += String.fromCharCode(x)); return btoa(t); };
const b64ToStr = s => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));
// iPhone uygulaması (WKWebView) içindeyken native tarafa mesaj gönderir; tarayıcıda hiçbir şey yapmaz.
const nativeMsg = (type, extra) => { try { window.webkit?.messageHandlers?.native?.postMessage({ type, ...extra }); } catch { } };

/* ---------- Kas grupları ve renkleri ---------- */
const MUSCLES = {
  'Göğüs': '#ff5468', 'Bacak ve kalça': '#ff8a3d', 'Omuz': '#ffd23f', 'Arka kol': '#8be04e',
  'Ön bacak': '#2dd4b4', 'Karın': '#3cc8f0', 'Sırt': '#5a8cff', 'Arka bacak': '#a47cff',
  'Ön kol': '#e46bff', 'Tüm vücut': '#ff6fae', 'Kardiyo': '#94a3b8'
};
const hslHex = (h, s, l) => {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
};
function mcolor(m) {
  if (MUSCLES[m]) return MUSCLES[m];
  if (!m) return MUSCLES['Kardiyo'];
  let h = 0; for (const c of m) h = (h * 31 + c.charCodeAt(0)) % 360;
  return hslHex(h, 70, 62);
}
function mstyle(m) {
  const c = mcolor(m), [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  return `--mc:${c};--mcs:rgba(${r},${g},${b},.16);--mcm:rgba(${r},${g},${b},.4)`;
}
const mchip = m => m ? `<span class="mchip" style="${mstyle(m)}"><i></i>${esc(m)}</span>` : '';
const INFER = [
  [/leg press/i, 'Bacak ve kalça'], [/leg curl|hamstring/i, 'Arka bacak'], [/leg extension|quad/i, 'Ön bacak'],
  [/tricep/i, 'Arka kol'], [/bicep|preacher|curl/i, 'Ön kol'], [/chest|bench|push-?up|fly/i, 'Göğüs'],
  [/pulldown|pull-?up|row/i, 'Sırt'], [/shoulder|overhead|lateral raise/i, 'Omuz'],
  [/crunch|abdominal|plank/i, 'Karın'], [/farmer/i, 'Tüm vücut'], [/ko[sş]u|[ıiI]s[ıi]nma|kardiyo|treadmill|bike/i, 'Kardiyo']
];
const inferMuscle = name => (INFER.find(([re]) => re.test(name)) || [, ''])[1];

/* ---------- Örnek program ---------- */
const SAMPLE = () => ({
  name: 'Programım',
  days: [
    {
      id: uid(), name: 'Gün 1 – İtiş', ex: [
        { id: uid(), name: 'Bench Press', sets: 4, reps: '8-10', rest: 90, note: 'Kürek kemiklerini sık, bar göğse insin.', media: null },
        { id: uid(), name: 'Omuz Press', sets: 3, reps: '10', rest: 75, note: '', media: null },
        { id: uid(), name: 'Triceps Pushdown', sets: 3, reps: '12', rest: 60, note: '', media: null }
      ]
    },
    {
      id: uid(), name: 'Gün 2 – Çekiş', ex: [
        { id: uid(), name: 'Lat Pulldown', sets: 4, reps: '10', rest: 75, note: '', media: null },
        { id: uid(), name: 'Barbell Row', sets: 3, reps: '8-10', rest: 90, note: 'Sırtı düz tut.', media: null }
      ]
    }
  ]
});

let prog = store.get('prog', null) || SAMPLE();
if (prog.days.some(d => d.ex.some(e => e.muscle == null))) {
  prog.days.forEach(d => d.ex.forEach(e => { if (e.muscle == null) e.muscle = inferMuscle(e.name); }));
  store.set('prog', prog);
}
let done = store.get('done:' + today(), {});
let edit = store.get('edit', false);
const saveProg = () => store.set('prog', prog);
const saveDone = () => store.set('done:' + today(), done);
// Kilo geçmişi: hareket adına göre {tarih: kg}; program yeniden içe aktarılsa da korunur.
const wt = store.get('wt', {});
const lastKg = name => { const h = wt[name] || {}, t = today(); const ds = Object.keys(h).filter(d => d < t).sort(); return ds.length ? { d: ds[ds.length - 1], kg: h[ds[ds.length - 1]] } : null; };
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

/* ---------- Telefondan yüklenen medya (IndexedDB) ---------- */
const dbp = new Promise((res, rej) => {
  try {
    const r = indexedDB.open('fit', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('media');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  } catch (e) { rej(e); }
});
const idb = async (mode, fn) => {
  const d = await dbp;
  return new Promise((res, rej) => {
    const t = d.transaction('media', mode);
    const rq = fn(t.objectStore('media'));
    t.oncomplete = () => res(rq && rq.result);
    t.onerror = () => rej(t.error);
  });
};
const putMedia = (id, blob) => idb('readwrite', s => s.put(blob, id));
const getMedia = id => idb('readonly', s => s.get(id));
const delMedia = id => idb('readwrite', s => s.delete(id)).catch(() => { });
try { navigator.storage?.persist?.(); } catch { }

function mediaHTML(m) {
  const ph = `<div class="media ph"><span>🏋️</span><small>Görsel yok</small></div>`;
  if (!m) return ph;
  if (m.type === 'idb') return `<div class="media" data-idb="${esc(m.value)}"></div>`;
  const u = m.value || '';
  if (!/^https?:\/\//i.test(u)) return ph;
  const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/);
  if (yt) return `<div class="media"><iframe src="https://www.youtube.com/embed/${yt[1]}?rel=0&playsinline=1&loop=1&playlist=${yt[1]}" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>`;
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u)) return `<div class="media"><video src="${esc(u)}" autoplay loop muted playsinline controls></video></div>`;
  return `<div class="media"><img src="${esc(u)}" alt=""></div>`;
}
async function hydrate() {
  for (const el of document.querySelectorAll('[data-idb]')) {
    try {
      const blob = await getMedia(el.dataset.idb);
      if (!blob) { el.classList.add('ph'); el.innerHTML = '<small>Dosya bulunamadı</small>'; continue; }
      const url = URL.createObjectURL(blob);
      el.innerHTML = (blob.type || '').startsWith('video')
        ? `<video src="${url}" autoplay loop muted playsinline controls></video>`
        : `<img src="${url}" alt="">`;
    } catch { el.classList.add('ph'); el.innerHTML = '<small>Yüklenemedi</small>'; }
  }
}

/* ---------- Yardımcılar ---------- */
const app = $('#app');
const go = p => { location.hash = '#' + p; };
const findDay = id => prog.days.find(d => d.id === id);
function setBar(title, back, right = '') {
  $('#bar').innerHTML = (back ? `<a class="back" href="${back}" aria-label="Geri">‹</a>` : '') + `<h1>${esc(title)}</h1>` + right;
}
const editBtn = () => `<button class="chip ${edit ? 'on' : ''}" data-act="edit">${edit ? 'Bitti' : 'Düzenle'}</button>`;
function dayStats(d) {
  const t = d.ex.reduce((a, e) => a + e.sets, 0);
  const n = d.ex.reduce((a, e) => a + Math.min(done[e.id] || 0, e.sets), 0);
  return { t, n };
}
function mediaOf(e) {
  const m = e.media ?? e.video ?? e.gif ?? null;
  const u = typeof m === 'string' ? m : (m && m.type === 'url' ? m.value : null);
  return u && /^https?:\/\//i.test(u) ? { type: 'url', value: u } : null;
}
// {swap:{"Hareket adı":[yeni hareketler]}} — programdaki o isimli hareketi, yenileriyle değiştirir (diğer hareket ve videolar korunur).
async function applySwap(map) {
  let n = 0;
  for (const d of prog.days) {
    const out = [];
    for (const e of d.ex) {
      const rep = map[e.name];
      if (!rep) { out.push(e); continue; }
      if (e.media?.type === 'idb') await delMedia(e.media.value);
      out.push(...normalize({ days: [{ ex: rep }] }).days[0].ex); n++;
    }
    d.ex = out;
  }
  saveProg(); return n;
}
function normalize(p) {
  if (!p || !Array.isArray(p.days)) throw new Error('bad');
  return {
    name: String(p.name || 'Programım').slice(0, 60),
    days: p.days.map(d => ({
      id: uid(), name: String(d.name || 'Gün').slice(0, 60),
      ex: (Array.isArray(d.ex) ? d.ex : (Array.isArray(d.exercises) ? d.exercises : [])).map(e => ({
        id: uid(), name: String(e.name || 'Hareket').slice(0, 80),
        sets: Math.min(20, Math.max(1, parseInt(e.sets) || 3)),
        reps: String(e.reps ?? '10').slice(0, 20),
        rest: Math.min(600, Math.max(0, parseInt(e.rest) || 0)),
        note: String(e.note || '').slice(0, 500),
        muscle: e.muscle == null ? inferMuscle(String(e.name || '')) : String(e.muscle).slice(0, 30),
        media: mediaOf(e)
      }))
    }))
  };
}
const exportable = () => ({
  name: prog.name,
  days: prog.days.map(d => ({ name: d.name, ex: d.ex.map(e => ({ name: e.name, sets: e.sets, reps: e.reps, rest: e.rest, note: e.note, muscle: e.muscle || '', media: e.media && e.media.type === 'url' ? e.media.value : null })) }))
});
async function replaceProgram(np) {
  for (const d of prog.days) for (const e of d.ex) if (e.media?.type === 'idb') await delMedia(e.media.value);
  prog = np; done = {}; saveProg(); saveDone();
}

/* ---------- Görünümler ---------- */
function home() {
  setBar(prog.name, null, editBtn());
  const list = prog.days.map((d, i) => {
    const s = dayStats(d);
    const pct = s.t ? Math.round(s.n / s.t * 100) : 0;
    const ms = [...new Set(d.ex.map(e => e.muscle).filter(m => m && m !== 'Kardiyo'))];
    return `<div class="row"><a class="card day" href="#/day/${d.id}">
      <div class="dayhead"><b>${esc(d.name)}</b><span class="chev">›</span></div>
      <div class="chips">${ms.map(mchip).join('')}</div>
      <div class="meta"><span>${d.ex.length} hareket</span>${s.t ? `<span>${s.n}/${s.t} set</span>` : ''}</div>
      <div class="bar"><i style="width:${pct}%"></i></div></a>${edit ? `<div class="tools"><a class="chip" href="#/edit-day/${d.id}">Adı değiştir</a><button class="chip" data-act="mvday" data-i="${i}" data-d="-1">↑</button><button class="chip" data-act="mvday" data-i="${i}" data-d="1">↓</button><button class="chip del" data-act="delday" data-id="${d.id}">Sil</button></div>` : ''}</div>`;
  }).join('');
  app.innerHTML = (list || '<p class="empty">Henüz gün yok.</p>')
    + (edit ? `<button class="btn" data-act="addday">+ Gün ekle</button><a class="btn sec" href="#/edit-day/_prog">Program adını değiştir</a>` : '')
    + `<a class="card ghost" href="#/videos"><div><b>Videoları yükle</b><small>Telefondaki videolar, internetsiz oynar</small></div><span class="chev">›</span></a>`
    + `<a class="card ghost" href="#/share"><div><b>Paylaş / İçe aktar</b><small>Antrenörden gelen programı buraya yükle</small></div><span class="chev">›</span></a>`;
}

function dayView(id) {
  const d = findDay(id); if (!d) return go('/');
  setBar(d.name, '#/', editBtn());
  const s = dayStats(d), pct = s.t ? Math.round(s.n / s.t * 100) : 0;
  const ms = [...new Set(d.ex.map(e => e.muscle).filter(Boolean))];
  const head = d.ex.length ? `<section class="summary"><div class="sumtop"><b>${s.n}<small> / ${s.t} set</small></b><span>%${pct}</span></div><div class="bar big"><i style="width:${pct}%"></i></div><div class="chips">${ms.map(mchip).join('')}</div></section>` : '';
  const list = d.ex.map((e, i) => {
    const n = Math.min(done[e.id] || 0, e.sets), full = n >= e.sets;
    return `<div class="row"><a class="card ex ${full ? 'full' : ''}" style="${mstyle(e.muscle)}" href="#/ex/${d.id}/${i}"><span class="num">${full ? '✓' : i + 1}</span><div><b>${esc(e.name)}</b><small>${e.muscle ? `<em>${esc(e.muscle)}</em> · ` : ''}${e.sets} set × ${esc(e.reps)}</small></div><span class="count">${n}/${e.sets}</span></a>${edit ? `<div class="tools"><a class="chip" href="#/edit-ex/${d.id}/${i}">Düzenle</a><button class="chip" data-act="mvex" data-did="${d.id}" data-i="${i}" data-d="-1">↑</button><button class="chip" data-act="mvex" data-did="${d.id}" data-i="${i}" data-d="1">↓</button><button class="chip del" data-act="delex" data-did="${d.id}" data-i="${i}">Sil</button></div>` : ''}</div>`;
  }).join('');
  app.innerHTML = head + (list || '<p class="empty">Bu günde hareket yok.</p>')
    + (edit ? `<a class="btn" href="#/edit-ex/${d.id}/new">+ Hareket ekle</a>` : '');
}

let cur = null;
function exView(did, i) {
  const d = findDay(did); if (!d) return go('/');
  i = +i; const e = d.ex[i]; if (!e) return go('/day/' + did);
  cur = { did, i };
  setBar(d.name, '#/day/' + did, `<span class="pos">${i + 1} / ${d.ex.length}</span>`);
  document.body.classList.add('has-nav');
  const n = done[e.id] || 0;
  app.innerHTML = `<div class="stage" style="${mstyle(e.muscle)}">
    <div class="mediawrap">${mediaHTML(e.media)}</div>
    <div class="head">${mchip(e.muscle)}<h2>${esc(e.name)}</h2></div>
    <div class="stats"><div><b>${e.sets}</b><span>SET</span></div><div><b>${esc(e.reps)}</b><span>TEKRAR</span></div>${e.rest ? `<div><b>${e.rest}<small>sn</small></b><span>DİNLENME</span></div>` : ''}</div>
    ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}
    <label class="kg"><span>${(() => { const l = lastKg(e.name); return l ? `Son: <b>${esc(l.kg)} kg</b> · ${fmtDate(l.d)}` : 'İlk kez — kaç kg?'; })()}</span><input id="kg" type="text" inputmode="decimal" placeholder="Bugün kg" value="${esc((wt[e.name] || {})[today()] ?? '')}"></label>
    <div class="sets">${Array.from({ length: e.sets }, (_, k) => `<button class="set ${k < n ? 'on' : ''}" data-act="set" data-k="${k}" aria-label="Set ${k + 1}"><span>${k + 1}</span></button>`).join('')}</div></div>
  <nav class="bottomnav">${i > 0 ? `<a class="btn sec" href="#/ex/${did}/${i - 1}">‹ Önceki</a>` : '<span></span>'}${i < d.ex.length - 1 ? `<a class="btn" href="#/ex/${did}/${i + 1}">Sonraki ›</a>` : `<a class="btn" href="#/day/${did}">Bitir ✓</a>`}</nav>`;
  hydrate(); wake();
}

function editDay(id) {
  const isProg = id === '_prog';
  const d = isProg ? null : findDay(id);
  if (!isProg && !d) return go('/');
  setBar(isProg ? 'Program adı' : 'Gün adı', '#/');
  app.innerHTML = `<form class="form"><label>Ad<input name="name" value="${esc(isProg ? prog.name : d.name)}" required></label><button class="btn">Kaydet</button></form>`;
  $('form').onsubmit = ev => {
    ev.preventDefault();
    const v = String(new FormData(ev.target).get('name')).trim();
    if (v) { if (isProg) prog.name = v; else d.name = v; saveProg(); }
    go(isProg ? '/' : '/day/' + id);
  };
  if (!isProg && d.name === 'Yeni gün') $('input').select();
}

function editEx(did, idx) {
  const d = findDay(did); if (!d) return go('/');
  const isNew = idx === 'new';
  const e = isNew ? { id: uid(), name: '', sets: 3, reps: '10', rest: 60, note: '', muscle: '', media: null } : d.ex[+idx];
  if (!e) return go('/day/' + did);
  setBar(isNew ? 'Hareket ekle' : 'Hareketi düzenle', '#/day/' + did);
  app.innerHTML = `<form class="form">
    <label>Hareket adı<input name="name" value="${esc(e.name)}" required></label>
    <label>Kas grubu<input name="muscle" list="muscles" value="${esc(e.muscle || '')}" placeholder="Göğüs, Sırt, Omuz…"></label>
    <datalist id="muscles">${Object.keys(MUSCLES).map(m => `<option value="${m}">`).join('')}</datalist>
    <div class="two">
      <label>Set<input name="sets" type="number" min="1" max="20" inputmode="numeric" value="${e.sets}" required></label>
      <label>Tekrar<input name="reps" value="${esc(e.reps)}" required placeholder="10 / 8-12 / 30 sn"></label>
    </div>
    <label>Dinlenme (sn)<input name="rest" type="number" min="0" max="600" inputmode="numeric" value="${e.rest}"></label>
    <label>Not / ipucu<textarea name="note" rows="3">${esc(e.note)}</textarea></label>
    <label>Video / GIF / YouTube bağlantısı<input name="url" inputmode="url" placeholder="https://…" value="${e.media && e.media.type === 'url' ? esc(e.media.value) : ''}"></label>
    <label>…veya telefondan dosya seç (internetsiz de çalışır)<input name="file" type="file" accept="video/*,image/*"></label>
    ${e.media ? `<label class="chk"><input type="checkbox" name="rm"> Mevcut görseli kaldır</label>` : ''}
    <button class="btn">Kaydet</button></form>`;
  $('form').onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    e.name = String(f.get('name')).trim();
    e.muscle = String(f.get('muscle')).trim().slice(0, 30);
    e.sets = Math.min(20, Math.max(1, parseInt(f.get('sets')) || 1));
    e.reps = String(f.get('reps')).trim();
    e.rest = Math.min(600, Math.max(0, parseInt(f.get('rest')) || 0));
    e.note = String(f.get('note')).trim();
    const file = f.get('file'), url = String(f.get('url')).trim();
    const wasIdb = e.media?.type === 'idb' ? e.media.value : null;
    try {
      if (file && file.size) { if (wasIdb) await delMedia(wasIdb); await putMedia(e.id, file); e.media = { type: 'idb', value: e.id }; }
      else if (f.get('rm')) { if (wasIdb) await delMedia(wasIdb); e.media = null; }
      else if (/^https?:\/\//i.test(url)) { if (wasIdb) await delMedia(wasIdb); e.media = { type: 'url', value: url }; }
      else if (!url && e.media?.type === 'url') e.media = null;
    } catch { alert('Dosya kaydedilemedi (depolama dolu olabilir).'); return; }
    if (isNew) d.ex.push(e);
    saveProg(); go('/day/' + did);
  };
}

function shareView() {
  setBar('Paylaş / İçe aktar', '#/');
  const json = JSON.stringify(exportable(), null, 1);
  app.innerHTML = `
  <section class="panel"><h3>Programı gönder</h3>
    <p class="mut">Bağlantıyı açan kişi programı kendi uygulamasına yükleyebilir. Telefondan yüklenen videolar dahil edilmez; bağlantı/YouTube videoları dahildir.</p>
    <button class="btn" data-act="sharelink">Bağlantıyı paylaş / kopyala</button></section>
  <section class="panel"><h3>Antrenörden gelen program</h3>
    <p class="mut">Gelen bağlantıyı veya program metnini (JSON) yapıştır.</p>
    <textarea id="imp" rows="6" placeholder="https://…#import=…   veya   { &quot;days&quot;: [...] }"></textarea>
    <button class="btn" data-act="import">İçe aktar</button></section>
  <section class="panel"><h3>Program metni (JSON)</h3>
    <textarea id="exp" rows="8" readonly>${esc(json)}</textarea>
    <button class="btn sec" data-act="copyjson">Kopyala</button></section>
  <section class="panel"><button class="btn danger" data-act="reset">Örnek programa dön</button></section>`;
}

/* ---------- Toplu video yükleme (sadece bu cihazda saklanır) ---------- */
const plain = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function matchEx(fileName) {
  const f = plain(fileName.replace(/\.[^.]+$/, '').replace(/^\s*\d+\s*[-_.)]*\s*/, ''));
  if (f.length < 3) return null;
  const all = prog.days.flatMap(d => d.ex);
  return all.find(e => plain(e.name) === f) || all.find(e => { const n = plain(e.name); return n.includes(f) || f.includes(n); }) || null;
}
function bulkView() {
  setBar('Videoları yükle', '#/');
  app.innerHTML = `<section class="panel"><h3>Videoları toplu yükle</h3>
    <p class="mut">Dosya adındaki hareket adına göre eşleşir (örn. "01 - Leg Press.mp4"). Videolar sadece bu telefonda saklanır ve internetsiz oynar. Hareketin mevcut videosunun/bağlantısının yerine geçer.</p>
    <label>Video dosyaları<input id="bulk" type="file" accept="video/*" multiple></label>
    <div id="bulkout" class="mut"></div></section>`;
  $('#bulk').onchange = async ev => {
    const out = $('#bulkout'), files = [...ev.target.files], lines = [];
    let ok = 0;
    for (const f of files) {
      const e = matchEx(f.name);
      if (!e) lines.push(`⚠️ Eşleşmedi: ${esc(f.name)}`);
      else {
        try { await putMedia(e.id, f); e.media = { type: 'idb', value: e.id }; ok++; lines.push(`✅ ${esc(e.name)}`); }
        catch { lines.push(`❌ Kaydedilemedi: ${esc(f.name)} (depolama dolu olabilir)`); }
      }
      out.innerHTML = lines.join('<br>') + `<br>${ok}/${files.length}…`;
    }
    saveProg();
    out.innerHTML = lines.join('<br>') + `<br><b>${ok}/${files.length} video yüklendi.</b>`;
  };
}

/* ---------- Dinlenme sayacı, ekran uyanık, ses ---------- */
let restEnd = 0, restTimer = null, ac = null, wl = null;
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function beep() {
  try { const o = ac.createOscillator(); o.connect(ac.destination); o.frequency.value = 880; o.start(); o.stop(ac.currentTime + 0.3); } catch { }
}
function startRest(sec) {
  if (!sec) return;
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch { }
  restEnd = Date.now() + sec * 1000;
  nativeMsg('rest', { seconds: sec });
  const el = $('#rest'); el.hidden = false; el.className = '';
  el.innerHTML = `<span>Dinlenme</span><b id="rt"></b><button data-act="plus">+15</button><button data-act="skip">Geç</button>`;
  clearInterval(restTimer); restTimer = setInterval(tick, 250); tick();
}
function tick() {
  const el = $('#rest'), left = Math.ceil((restEnd - Date.now()) / 1000);
  if (left > 0) { const t = $('#rt'); if (t) t.textContent = fmt(left); return; }
  clearInterval(restTimer); restTimer = null;
  el.className = 'go'; el.innerHTML = `<span>Hazır! Sıradaki sete 💪</span><button data-act="skip">Tamam</button>`;
  beep(); nativeMsg('haptic'); try { navigator.vibrate?.([250, 100, 250]); } catch { }
  setTimeout(() => { if (!restTimer && Date.now() >= restEnd) el.hidden = true; }, 5000);
}
async function wake() { try { if ('wakeLock' in navigator && !wl) { wl = await navigator.wakeLock.request('screen'); wl.onrelease = () => { wl = null; }; } } catch { } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && location.hash.startsWith('#/ex/')) wake(); });

/* ---------- Tıklama işlemleri ---------- */
const swap = (a, i, d) => { const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; };
document.addEventListener('input', ev => {
  if (ev.target.id !== 'kg' || !cur) return;
  const e = findDay(cur.did)?.ex[cur.i]; if (!e) return;
  const v = ev.target.value.replace(',', '.').trim(), h = wt[e.name] || (wt[e.name] = {});
  if (v) h[today()] = v; else delete h[today()];
  store.set('wt', wt);
});
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, D = b.dataset;
  if (a === 'edit') { edit = !edit; store.set('edit', edit); route(); }
  else if (a === 'addday') { const d = { id: uid(), name: 'Yeni gün', ex: [] }; prog.days.push(d); saveProg(); go('/edit-day/' + d.id); }
  else if (a === 'mvday') { swap(prog.days, +D.i, +D.d); saveProg(); route(); }
  else if (a === 'delday') {
    const d = findDay(D.id);
    if (d && confirm(`"${d.name}" günü silinsin mi?`)) { for (const e of d.ex) if (e.media?.type === 'idb') await delMedia(e.media.value); prog.days = prog.days.filter(x => x.id !== D.id); saveProg(); route(); }
  }
  else if (a === 'mvex') { swap(findDay(D.did).ex, +D.i, +D.d); saveProg(); route(); }
  else if (a === 'delex') {
    const d = findDay(D.did), e = d.ex[+D.i];
    if (e && confirm(`"${e.name}" silinsin mi?`)) { if (e.media?.type === 'idb') await delMedia(e.media.value); d.ex.splice(+D.i, 1); saveProg(); route(); }
  }
  else if (a === 'set') {
    const e = findDay(cur.did).ex[cur.i], k = +D.k, n = done[e.id] || 0;
    if (k < n) done[e.id] = k; else { done[e.id] = k + 1; if (k + 1 < e.sets) startRest(e.rest); }
    saveDone();
    document.querySelectorAll('.set').forEach((s, idx) => s.classList.toggle('on', idx < done[e.id]));
  }
  else if (a === 'skip') { clearInterval(restTimer); restTimer = null; restEnd = 0; $('#rest').hidden = true; nativeMsg('cancelRest'); }
  else if (a === 'plus') { restEnd += 15000; if (!restTimer) startRest(15); else nativeMsg('rest', { seconds: (restEnd - Date.now()) / 1000 }); tick(); }
  else if (a === 'sharelink') {
    const base = location.protocol.startsWith('http') ? location.origin + location.pathname : 'https://2-run.github.io/Antrenman/';
    const link = base + '#import=' + bytesToB64(JSON.stringify(exportable()));
    try { if (navigator.share) { await navigator.share({ title: prog.name, text: 'Antrenman programı', url: link }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(link); alert('Bağlantı kopyalandı.'); } catch { prompt('Bağlantıyı kopyala:', link); }
  }
  else if (a === 'copyjson') { try { await navigator.clipboard.writeText($('#exp').value); alert('Kopyalandı.'); } catch { $('#exp').select(); } }
  else if (a === 'import') {
    let t = $('#imp').value.trim(); if (!t) return;
    try {
      let add = false;
      const j = t.indexOf('#add='); if (j >= 0) { t = t.slice(j + 5); add = true; }
      const i = t.indexOf('#import='); if (i >= 0) t = t.slice(i + 8);
      const raw = t.startsWith('{') ? JSON.parse(t) : JSON.parse(b64ToStr(decodeURIComponent(t)));
      if (raw.swap) { const n = await applySwap(raw.swap); alert(n ? n + ' hareket değiştirildi.' : 'Değiştirilecek hareket programında bulunamadı.'); return go('/'); }
      if (raw.append) add = true;
      const np = normalize(raw);
      if (add) { prog.days = prog.days.filter(x => !np.days.some(y => y.name === x.name)).concat(np.days); saveProg(); alert(np.days.length + ' gün programına eklendi.'); return go('/'); }
      if (!confirm('Mevcut programın yerine bu program yüklensin mi?')) return;
      await replaceProgram(np); alert('Program yüklendi.'); go('/');
    } catch { alert('Program okunamadı. Bağlantı veya metin eksik/bozuk olabilir.'); }
  }
  else if (a === 'reset') { if (confirm('Programın silinip örnek programa dönülsün mü?')) { await replaceProgram(SAMPLE()); go('/'); } }
});

/* ---------- Yönlendirme ---------- */
const VIEWS = { home, day: p => dayView(p[1]), ex: p => exView(p[1], p[2]), 'edit-day': p => editDay(p[1]), 'edit-ex': p => editEx(p[1], p[2]), share: shareView, videos: bulkView };
function route() {
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  document.body.classList.remove('has-nav');
  if (p[0] !== 'ex' && wl) { try { wl.release(); } catch { } wl = null; }
  (VIEWS[p[0] || 'home'] || home)(p);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// Yalnızca iPhone uygulamasında: pakete konmuş seed/ klasörü varsa (özel program + videolar) bir kez uygular.
async function seedNative() {
  const have = store.get('seedv', 0);
  if (location.protocol !== 'workout:') return;
  try {
    const r = await fetch('seed/seed.json'); if (!r.ok) return;
    const seed = await r.json(), ver = seed.version || 1;
    if (have >= ver) return;
    if (have < 1) {
      if (!store.get('prog', null)) prog = normalize(seed.program); else await applySwap(seed.swap || {});
      for (const d of prog.days) for (const e of d.ex) {
        const f = seed.videos?.[e.name];
        if (f && e.media?.type !== 'idb') { const b = await (await fetch(f)).blob(); await putMedia(e.id, b); e.media = { type: 'idb', value: e.id }; }
      }
    }
    if (seed.reps) for (const d of prog.days) for (const e of d.ex) if (seed.reps[e.name]) e.reps = seed.reps[e.name];
    saveProg(); store.set('seedv', ver);
  } catch { }
}

(async function boot() {
  await seedNative();
  if (location.hash.startsWith('#add=')) {
    try {
      const np = normalize(JSON.parse(b64ToStr(decodeURIComponent(location.hash.slice(5)))));
      const n = np.days.reduce((a, d) => a + d.ex.length, 0);
      if (confirm(`${np.days.length} gün, ${n} hareket programına eklensin mi?\nMevcut programın korunur.`)) { prog.days = prog.days.filter(x => !np.days.some(y => y.name === x.name)).concat(np.days); saveProg(); }
    } catch { alert('Gelen bağlantı okunamadı.'); }
    history.replaceState(null, '', location.pathname);
    location.hash = '#/';
  }
  if (location.hash.startsWith('#import=')) {
    try {
      const np = normalize(JSON.parse(b64ToStr(decodeURIComponent(location.hash.slice(8)))));
      const n = np.days.reduce((a, d) => a + d.ex.length, 0);
      if (confirm(`"${np.name}" programı (${np.days.length} gün, ${n} hareket) yüklensin mi?\nMevcut programın yerine geçer.`)) await replaceProgram(np);
    } catch { alert('Gelen program bağlantısı okunamadı.'); }
    history.replaceState(null, '', location.pathname);
    location.hash = '#/';
  }
  route();
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
