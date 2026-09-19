#!/usr/bin/env node
/**
 * Сборщик сайта izyatka.ru
 *
 * Берёт каталог из <script id="catalog"> в index.html и собирает готовый сайт в папку _site:
 *   - /lot/<id>/            страница каждой позиции (фото, характеристики, разметка Product)
 *   - /katalog/<раздел>/    страница каждой категории
 *   - /sitemap.xml, /robots.txt, /404.html, /favicon.ico
 *   - index.html            копия вашего с исправленной шапкой, title, разметкой и ссылками на разделы
 *
 * Исходный index.html НЕ изменяется: Claude по-прежнему просто добавляет карточку и фото в каталог.
 * Запуск:  node build.mjs            (Node 18+, без зависимостей)
 *          node build.mjs --out dist
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argOut = process.argv.indexOf('--out');
const OUT = path.resolve(ROOT, argOut > -1 ? process.argv[argOut + 1] : '_site');

// ───────────────────────── настройки ─────────────────────────
const DEFAULTS = {
  siteUrl: 'https://izyatka.ru',
  siteName: 'Изъятка',
  homeTitle: 'Изъятая техника лизинговых компаний — каталог с ценами | Изъятка',
  tgChannel: 'https://t.me/izyatka_lizing',
  tgManager: 'https://t.me/vse_v_lizing',
  metrikaId: null,            // номер счётчика Яндекс Метрики, например 12345678
  yandexVerification: null,   // содержимое мета-тега подтверждения из Яндекс Вебмастера
  phone: null,                // "+7 900 000-00-00"
  email: null,
  legalName: null,            // «ООО Ромашка» или «ИП Иванов И. И.»
  inn: null,
  address: null,
  privacyUrl: null            // ссылка на политику обработки персональных данных
};
let CFG = { ...DEFAULTS };
const cfgPath = path.join(ROOT, 'site.config.json');
if (fs.existsSync(cfgPath)) CFG = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) };
const BASE = CFG.siteUrl.replace(/\/$/, '');

// Тексты разделов. Слаг для новой категории строится автоматически.
const CATEGORIES = {
  'Спецтехника': {
    slug: 'spectehnika',
    h1: 'Изъятая спецтехника из лизинга',
    title: 'Изъятая спецтехника из лизинга — каталог и цены',
    intro: 'Спецтехника, которую лизинговые компании забрали у прежних лизингополучателей. Цена указана для покупки в лизинг, у части позиций возможна скидка после осмотра.'
  },
  'Легковые': {
    slug: 'legkovye',
    h1: 'Изъятые легковые автомобили из лизинга',
    title: 'Изъятые легковые автомобили из лизинга — каталог и цены',
    intro: 'Легковые автомобили, изъятые лизинговыми компаниями. Пришлём дополнительные фото и документы, посчитаем платёж и поможем оформить сделку.'
  },
  'Грузовики': {
    slug: 'gruzoviki',
    h1: 'Изъятые грузовики и тягачи из лизинга',
    title: 'Изъятые грузовики, тягачи и самосвалы из лизинга — каталог и цены',
    intro: 'Седельные тягачи, самосвалы и другие грузовики, изъятые лизинговыми компаниями. Аванс и срок подберём под ваш оборот.'
  },
  'Прицепы': {
    slug: 'pritsepy',
    h1: 'Изъятые прицепы и полуприцепы из лизинга',
    title: 'Изъятые прицепы и полуприцепы из лизинга — каталог и цены',
    intro: 'Полуприцепы и прицепы, которые лизинговые компании забрали у прежних лизингополучателей.'
  },
  'Сельхозтехника': {
    slug: 'selhoztehnika',
    h1: 'Изъятая сельхозтехника из лизинга',
    title: 'Изъятая сельхозтехника из лизинга — каталог и цены',
    intro: 'Тракторы, комбайны и другая сельскохозяйственная техника, изъятая лизинговыми компаниями.'
  },
  'Оборудование': {
    slug: 'oborudovanie',
    h1: 'Изъятое оборудование из лизинга',
    title: 'Изъятое оборудование из лизинга — каталог и цены',
    intro: 'Промышленное и производственное оборудование, изъятое лизинговыми компаниями.'
  },
  'Автобусы': {
    slug: 'avtobusy',
    h1: 'Изъятые автобусы из лизинга',
    title: 'Изъятые автобусы из лизинга — каталог и цены',
    intro: 'Автобусы, изъятые лизинговыми компаниями. Отвечаем на вопросы по состоянию, документам и оформлению.'
  }
};

// ───────────────────────── утилиты ─────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const isNum = (n) => typeof n === 'number' && isFinite(n);
const rub = (n) => (isNum(n) ? n.toLocaleString('ru-RU') + ' ₽' : String(n));
const cityShort = (c) => String(c || '').split(',')[0].trim();
const ruDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('.') : '');
const url = (p) => BASE + p;

const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
const slugify = (s) => String(s).toLowerCase().split('').map((ch) => TR[ch] ?? ch).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'razdel';

const warnings = [];
const warn = (m) => { warnings.push(m); console.warn('  ! ' + m); };
const write = (rel, data) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};

// размеры JPEG (чтобы страница не «прыгала» при загрузке фото)
const dimCache = new Map();
function jpegSize(rel) {
  if (dimCache.has(rel)) return dimCache.get(rel);
  let res = null;
  try {
    const fd = fs.openSync(path.join(ROOT, rel), 'r');
    const buf = Buffer.alloc(131072);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    let i = 2;
    while (i + 9 < n) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        res = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        break;
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  } catch { /* нет файла или не JPEG */ }
  dimCache.set(rel, res);
  return res;
}

// ───────────────────────── чтение исходника ─────────────────────────
const srcPath = path.join(ROOT, 'index.html');
const SRC = fs.readFileSync(srcPath, 'utf8');
const catMatch = SRC.match(/<script id="catalog"[^>]*>([\s\S]*?)<\/script>/);
if (!catMatch) { console.error('Не найден <script id="catalog"> в index.html'); process.exit(1); }
let DATA;
try { DATA = JSON.parse(catMatch[1]); } catch (e) { console.error('Каталог в index.html — невалидный JSON: ' + e.message); process.exit(1); }
if (!Array.isArray(DATA) || !DATA.length) { console.error('Каталог пуст'); process.exit(1); }

// проверка и нормализация позиций
const seen = new Set();
const LOTS = [];
for (const d of DATA) {
  if (!d || !d.id || !d.title || !d.category) { warn('Пропущена позиция без id/title/category: ' + JSON.stringify(d).slice(0, 80)); continue; }
  if (!/^[A-Za-z0-9._-]+$/.test(d.id)) { warn('Странный id, пропущена: ' + d.id); continue; }
  if (seen.has(d.id)) { warn('Повторяющийся id, вторая позиция пропущена: ' + d.id); continue; }
  seen.add(d.id);
  const photos = [];
  for (let i = 1; i <= (d.photos || 0); i++) {
    const rel = `images/${d.id}-${i}.jpg`;
    if (fs.existsSync(path.join(ROOT, rel))) photos.push({ src: '/' + rel, ...(jpegSize(rel) || {}) });
    else warn(`Нет файла фото: ${rel}`);
  }
  LOTS.push({ ...d, photoList: photos, path: `/lot/${d.id}/` });
}

// title страниц позиций: до ~90 знаков и уникальный (одинаковые машины различаем пробегом или ценой)
function shortTitle(l) {
  const city = cityShort(l.city);
  const y = l.year ? `, ${l.year}` : '';
  const cands = [
    `Купить ${l.title}${y} б/у — из лизинга${city ? ', ' + city : ''}`,
    `Купить ${l.title}${y} б/у — из лизинга`,
    `${l.title}${y} — из лизинга`
  ];
  return cands.find((c) => c.length <= 90) || cands[cands.length - 1];
}
{
  const groups = new Map();
  for (const l of LOTS) {
    l.seoTitle = shortTitle(l);
    if (!groups.has(l.seoTitle)) groups.set(l.seoTitle, []);
    groups.get(l.seoTitle).push(l);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const keys = [(l) => l.mileage, (l) => (isNum(l.price) ? rub(l.price) : null)];
    let done = false;
    for (const k of keys) {
      const vals = g.map(k);
      if (vals.every(Boolean) && new Set(vals).size === g.length) { g.forEach((l, i) => { l.seoTitle += ` (${vals[i]})`; }); done = true; break; }
    }
    if (!done) g.forEach((l, i) => { l.seoTitle += ` №${i + 1}`; });
  }
}

// разделы
const catNames = [...new Set(LOTS.map((l) => l.category))];
const CATS = catNames.map((name) => {
  const conf = CATEGORIES[name] || {};
  const lots = LOTS.filter((l) => l.category === name).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return {
    name,
    slug: conf.slug || slugify(name),
    h1: conf.h1 || `${name} из лизинга`,
    title: conf.title || `${name} из лизинга — каталог и цены`,
    intro: conf.intro || `Позиции категории «${name}», изъятые лизинговыми компаниями.`,
    path: `/katalog/${conf.slug || slugify(name)}/`,
    lots
  };
}).sort((a, b) => b.lots.length - a.lots.length);
const catOf = (lot) => CATS.find((c) => c.name === lot.category);

// ───────────────────────── общие куски страниц ─────────────────────────
const STYLE = (SRC.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
const FONTS = (SRC.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com[^"]+)"/) || [, 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=PT+Sans:ital,wght@0,400;0,700;1,400&display=swap'])[1];
const abs = (html) => html.replace(/href="#"/g, 'href="/"').replace(/href="#/g, 'href="/#').replace(/src="images\//g, 'src="/images/');
const HEADER = abs((SRC.match(/<header class="top">[\s\S]*?<\/header>/) || [, `<header class="top"><div class="wrap top-in"><a class="brand" href="/"><b>${esc(CFG.siteName)}</b></a></div></header>`])[0]);
const FOOTER = (SRC.match(/<footer>[\s\S]*?<\/footer>/) || [, '<footer><div class="wrap foot"><div><b>Изъятка</b></div></div></footer>'])[0];

const EXTRA_CSS = `
/* ——— страницы, собранные build.mjs ——— */
a.card{text-decoration:none;color:inherit;display:flex;flex-direction:column}
.ph img{position:relative;z-index:1}
.crumbs{display:flex;flex-wrap:wrap;gap:.35rem .5rem;padding:1.1rem 0 .4rem;font-size:.88rem;color:var(--muted)}
.crumbs a{color:var(--muted);text-decoration:none}.crumbs a:hover{color:var(--accent)}
.crumbs li{list-style:none;display:inline}.crumbs ol{display:flex;flex-wrap:wrap;gap:.35rem .5rem;margin:0;padding:0}
.crumbs li+li::before{content:"›";margin-right:.5rem}
.lot-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,1fr);gap:2rem;padding:.6rem 0 2.5rem;align-items:start}
@media(max-width:860px){.lot-grid{grid-template-columns:1fr}}
.lot-gal{display:grid;gap:.6rem}
.lot-gal a{display:block;border:1px solid var(--line);border-radius:3px;overflow:hidden;background:var(--surface-2)}
.lot-gal img{width:100%;height:auto}
.lot-gal .thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.6rem}
.lot-info h1{font-size:clamp(1.7rem,4.2vw,2.4rem);line-height:1.1;text-transform:uppercase}
.lot-info .price{font-size:2rem;margin:1rem 0 .3rem}
.spec-list{display:grid;grid-template-columns:max-content 1fr;gap:.45rem 1.2rem;margin:1.2rem 0;padding:1rem 0;border-block:1px solid var(--line)}
.spec-list dt{color:var(--muted)}.spec-list dd{margin:0}
.spec-list a{color:var(--accent)}
.lot-text p{margin:.7rem 0;max-width:62ch}
.lot-cta{display:flex;gap:.6rem;flex-wrap:wrap;margin:1.2rem 0}
.related{padding:1rem 0 3rem}.related h2,.cat-list h2{font-size:1.6rem;text-transform:uppercase;margin-bottom:1.1rem}
.cat-hero{padding:1.2rem 0 1.6rem;border-bottom:1px solid var(--line)}
.cat-hero h1{font-size:clamp(1.9rem,5vw,3rem);line-height:1.05;text-transform:uppercase}
.cat-hero p{max-width:64ch;color:var(--muted);margin:1rem 0 0}
.cat-stats{display:flex;flex-wrap:wrap;gap:.4rem 1.6rem;margin-top:1.1rem;font-size:.95rem}
.cat-stats b{font-family:Oswald,sans-serif;font-weight:500}
.cat-list{padding:1.6rem 0 3rem}
.cat-nav{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 1.4rem;padding:0;list-style:none}
.cat-nav a{display:inline-block;padding:.4rem .8rem;border:1px solid var(--line);border-radius:var(--r);text-decoration:none;font-size:.92rem}
.cat-nav a:hover,.cat-nav a[aria-current]{border-color:var(--accent);color:var(--accent)}
.seo-links{padding:clamp(2rem,4vw,3rem) 0;border-top:1px solid var(--line)}
.seo-links h2{font-size:1.5rem;text-transform:uppercase;margin-bottom:.9rem}
.seo-links h3{font-size:1.1rem;margin:1.4rem 0 .6rem}
.seo-links ul{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:.5rem}
.seo-links li a{display:inline-block;padding:.4rem .8rem;border:1px solid var(--line);border-radius:var(--r);text-decoration:none;font-size:.92rem}
.seo-links li a:hover{border-color:var(--accent);color:var(--accent)}
.legal{margin-top:.6rem;font-size:.85rem;color:var(--muted)}
.notfound{padding:4rem 0;text-align:center}.notfound h1{font-size:3rem}
.doc{padding:1.6rem 0 3rem;max-width:820px}.doc h1{font-size:clamp(1.7rem,4.2vw,2.4rem);line-height:1.1;text-transform:uppercase}
.doc h2{font-size:1.25rem;margin:2rem 0 .6rem}.doc p,.doc li{margin:.6rem 0;line-height:1.6}.doc ul{padding-left:1.3rem}.doc a{color:var(--accent)}.doc-date{color:var(--muted);font-size:.9rem;margin-top:.6rem}
`;

const faviconHead = fs.existsSync(path.join(ROOT, 'images/logo-mark.png'))
  ? `<link rel="icon" type="image/png" href="/images/logo-mark.png">\n<link rel="icon" href="/favicon.ico" sizes="any">\n<link rel="apple-touch-icon" href="/images/logo-mark.png">`
  : '';

const verifyMeta = CFG.yandexVerification ? `<meta name="yandex-verification" content="${esc(CFG.yandexVerification)}">` : '';

const metrikaHead = CFG.metrikaId ? `<script>
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
ym(${Number(CFG.metrikaId)},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/${Number(CFG.metrikaId)}" style="position:absolute;left:-9999px" alt=""></div></noscript>` : '';

// цели: клик по Telegram (tg_click), открытие карточки в окне (open_card), успешная заявка (lead_form, на spasibo.html)
const goalsScript = (extra = '') => CFG.metrikaId ? `<script>
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest('a[href^="https://t.me/"]');if(a&&window.ym)ym(${Number(CFG.metrikaId)},"reachGoal","tg_click");${extra}});
</script>` : '';

const legalLine = () => {
  const parts = [CFG.legalName, CFG.inn && `ИНН ${CFG.inn}`, CFG.address, CFG.phone, CFG.email].filter(Boolean);
  const priv = CFG.privacyUrl ? ` · <a href="${esc(CFG.privacyUrl)}">Политика обработки персональных данных</a>` : '';
  return parts.length || priv ? `<div class="wrap legal">${esc(parts.join(' · '))}${priv}</div>` : '';
};

const orgLd = () => jsonLd({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: CFG.siteName,
  url: BASE + '/',
  logo: BASE + '/images/logo-mark.png',
  sameAs: [CFG.tgChannel, CFG.tgManager],
  ...(CFG.legalName ? { legalName: CFG.legalName } : {}),
  ...(CFG.phone ? { telephone: CFG.phone } : {}),
  ...(CFG.email ? { email: CFG.email } : {})
});

function page({ title, description, path: p, ogImage, ogType = 'website', body, ld = [], robots }) {
  const canonical = url(p);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
${robots ? `<meta name="robots" content="${robots}">\n` : ''}<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(CFG.siteName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage || BASE + '/og.jpg'}">
<meta name="twitter:card" content="summary_large_image">
${verifyMeta}
${faviconHead}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/assets/site.css">
${ld.join('\n')}
${metrikaHead}
</head>
<body>
${HEADER}
${body}
${FOOTER}
${legalLine()}
${goalsScript()}
</body>
</html>
`;
}

const crumbs = (items) => {
  const li = items.map((it, i) => (it.href ? `<li><a href="${it.href}">${esc(it.name)}</a></li>` : `<li aria-current="page">${esc(it.name)}</li>`)).join('');
  return `<nav class="crumbs" aria-label="Хлебные крошки"><ol>${li}</ol></nav>`;
};
const crumbsLd = (items) => jsonLd({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: url(it.href || it.self) }))
});

function cardHtml(l) {
  const saving = isNum(l.priceCash) && isNum(l.price) ? l.priceCash - l.price : 0;
  const first = l.photoList[0];
  return `<a class="card" href="${l.path}">
  <div class="ph">${l.tag && l.tag !== 'Изъятая' ? `<span class="tag tag-new">${esc(l.tag)}</span>` : '<span class="tag">Изъятая</span>'}
    ${first ? `<img src="${first.src}" alt="${esc(l.title)}" loading="lazy" decoding="async">` : `<div class="fallback">${esc(l.category)}</div>`}
  </div>
  <div class="card-b">
    <h3>${esc(l.title)}</h3>
    <div class="price num">${rub(l.price)}${isNum(l.price) ? '<small>в лизинг, с НДС</small>' : ''}</div>
    ${saving > 0 ? `<div class="saving num">На ${rub(saving)} дешевле прямой покупки</div>` : ''}
    <div class="specs">${l.year ? `<span>${l.year} г.</span>` : ''}${l.mileage ? `<span class="num">${esc(l.mileage)}</span>` : ''}${l.city ? `<span>${esc(l.city)}</span>` : ''}</div>
  </div>
</a>`;
}

// ───────────────────────── уникальные описания позиций ─────────────────────────
// Тексты в каталоге у большинства позиций одинаковые по шаблону (один хвост про «изъятую технику»).
// Чтобы страницы не считались дублями, при сборке шаблонный хвост убирается, а вместо него добавляется
// блок, собранный из реальных полей позиции (год, пробег/наработка, цена, город) и сравнения с каталогом.
// index.html и каталог не меняются.
const NOW_YEAR = new Date().getFullYear();
const hashStr = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = (arr, id, salt) => arr[hashStr(id + '|' + salt) % arr.length];

const KINDS = [
  { key: 'tractor', re: /тягач/i, label: 'седельные тягачи', name: 'Седельный тягач' },
  { key: 'dump', re: /самосвал/i, label: 'самосвалы', name: 'Самосвал' },
  { key: 'trailer', re: /прицеп/i, label: 'полуприцепы и прицепы', name: 'Полуприцеп' },
  { key: 'bus', re: /автобус|микроавтобус/i, label: 'автобусы и микроавтобусы', name: 'Автобус' },
  { key: 'crane', re: /кран|автовышк|подъ[её]мник|гидроподъ[её]мник/i, label: 'краны и подъёмники', name: 'Кран или подъёмник' },
  { key: 'excavator', re: /экскаватор|гидроножниц|трубоукладчик/i, label: 'экскаваторы', name: 'Экскаватор' },
  { key: 'loader', re: /погрузчик/i, label: 'погрузчики', name: 'Погрузчик' },
  { key: 'roadm', re: /бульдозер|каток|грейдер|дорожная|бетон/i, label: 'дорожная и строительная техника', name: 'Строительная техника' },
  { key: 'forest', re: /харвестер|форвардер|лесной/i, label: 'лесная техника', name: 'Лесная техника' },
  { key: 'agri', re: /трактор|жатка|бункер|комбайн|сеялк|опрыскиват/i, label: 'сельхозтехника', name: 'Сельхозтехника' },
  { key: 'moto', re: /мотоцикл|квадроцикл|polaris|вездеход/i, label: 'мототехника и вездеходы', name: 'Мототехника' },
  { key: 'body', re: /рефрижератор|фургон|бортов|тентован|шторн|зерновоз|эвакуатор|манипулятор|цистерн|ломовоз|мусоровоз/i, label: 'грузовики с надстройкой', name: 'Грузовик' }
];
const CAT_KIND = {
  'Оборудование': { key: 'equip', label: 'оборудование', name: 'Оборудование' },
  'Легковые': { key: 'car', label: 'легковые автомобили', name: 'Автомобиль' },
  'Грузовики': { key: 'truck', label: 'грузовые автомобили', name: 'Грузовик' },
  'Автобусы': { key: 'bus', label: 'автобусы и микроавтобусы', name: 'Автобус' },
  'Прицепы': { key: 'trailer', label: 'полуприцепы и прицепы', name: 'Полуприцеп' },
  'Сельхозтехника': { key: 'agri', label: 'сельхозтехника', name: 'Сельхозтехника' },
  'Спецтехника': { key: 'special', label: 'спецтехника', name: 'Спецтехника' }
};
function kindOf(l) {
  if (l._kind) return l._kind;
  let k;
  if (l.category === 'Оборудование') k = CAT_KIND['Оборудование'];
  else if (l.category === 'Легковые') k = KINDS.find((x) => x.key === 'moto' && x.re.test(l.title)) || (/микроавтобус|пикап/i.test(l.title) ? { key: 'car', label: 'микроавтобусы и пикапы', name: 'Автомобиль' } : CAT_KIND['Легковые']);
  else k = KINDS.find((x) => x.re.test(l.title)) || CAT_KIND[l.category] || { key: 'other', label: 'техника', name: 'Техника' };
  return (l._kind = k);
}

// рекомендации по осмотру — по 3 варианта на вид техники (выбирается по id позиции)
const ADVICE = {
  tractor: [
    'При осмотре тягача проверьте состояние двигателя и коробки на холодную, износ шин по осям, люфты седельно-сцепного устройства и целостность рамы вокруг него.',
    'Для седельного тягача главное — история эксплуатации: под какими полуприцепами работал, как обслуживался, нет ли следов ремонта рамы. Посмотрите также тормозную систему и состояние сцепления.',
    'У тягача такого класса ресурс определяют трансмиссия и сцепное устройство. Запросите записи о ТО, проверьте пневмосистему и осмотрите кабину на предмет следов аварий.'
  ],
  dump: [
    'У самосвала осматривайте кузов и гидроцилиндр подъёма: трещины по сварке, деформации бортов и течи масла показывают, насколько тяжёлой была работа.',
    'Для самосвала важны рама, подвеска и износ кузова — по ним видно, работала машина в карьере или на обычном щебне. Проверьте также работу подъёма кузова под нагрузкой.',
    'Проверьте гидравлику подъёма, состояние днища и бортов кузова, люфты подвески и тормоза. Следы сварки на раме и кузове — повод уточнить историю ремонтов.'
  ],
  trailer: [
    'У полуприцепа проверьте раму, оси и ступичные подшипники, тормозные камеры, шины и шкворень. Для шторных и бортовых моделей — целостность тента, стоек и механизма фиксации.',
    'При осмотре полуприцепа смотрите на геометрию рамы и сварные швы, состояние осей, подвески и опорного устройства. Отдельно уточните комплектность: тент, борта, коники, запасное колесо.',
    'Главное у прицепной техники — рама, оси и тормоза. Проверьте износ шин, работу опор и электрику, а для рефрижераторов и цистерн — состояние надстройки и документов на неё.'
  ],
  bus: [
    'Автобус лучше осматривать вместе с механиком: двигатель, коробка, состояние кузова и порогов, работа дверей и отопления салона, износ сидений.',
    'У пассажирской техники важны не только двигатель и трансмиссия, но и состояние салона, дверей и тормозной системы. Уточните, на каких маршрутах машина работала.',
    'Проверьте кузов на коррозию, работу дверных механизмов, отопитель и тормоза, а также наличие всех документов для регистрации и допуска к перевозкам.'
  ],
  crane: [
    'У кранов и подъёмников проверяют гидравлику, состояние стрелы и сварных узлов, работу ограничителей грузоподъёмности и наличие документов на технический осмотр.',
    'Осматривая подъёмную технику, уделите внимание стреле и опорам, гидроцилиндрам, износу тросов и блоков. Уточните наработку и дату последнего технического освидетельствования.',
    'Для подъёмного оборудования критичны безопасность и документы: паспорт, записи об освидетельствовании, исправность приборов безопасности. Гидравлику проверьте под нагрузкой.'
  ],
  excavator: [
    'У экскаватора смотрите наработку в моточасах, износ ходовой (гусениц, катков, звёздочек), течи гидравлики, состояние ковша и зубьев, люфты пальцев стрелы.',
    'Основной показатель износа экскаватора — моточасы и состояние гидравлики. Проверьте работу на всех режимах, люфты в шарнирах стрелы и рукояти, цвет и запах масла.',
    'Осмотрите ходовую часть, ковш и навесное, послушайте гидронасосы, проверьте течи по цилиндрам. Стоимость ремонта ходовой заметно влияет на итоговую цену техники.'
  ],
  loader: [
    'У погрузчика проверьте моточасы, состояние навесного оборудования, гидроцилиндры, шины и трансмиссию: под нагрузкой не должно быть рывков и пробуксовок.',
    'Погрузчики работают на износ, поэтому смотрят на наработку, износ ковша или вил, шарниры рамы, гидравлику и тормоза. Проверьте работу под нагрузкой.',
    'Обратите внимание на шарнирно-сочленённую раму, износ ковша или вил, работу гидросистемы и состояние шин. Уточните, в каких условиях использовался погрузчик.'
  ],
  roadm: [
    'У дорожной и строительной техники важны моточасы, состояние рабочих органов (ножа, вальцов, ковша), гидравлика и ходовая часть. Проверьте работу под нагрузкой.',
    'Проверьте наработку, износ рабочего органа, течи в гидросистеме и состояние ходовой. Для катков — вальцы и вибратор, для бульдозеров — отвал, ножи и гусеницы.',
    'Смотрите на рабочий орган и ходовую: по износу видно, какой была нагрузка. Запросите записи о регламентных работах и данные о наработке.'
  ],
  forest: [
    'Лесная техника работает в тяжёлых условиях: проверьте наработку, гидравлику манипулятора, состояние шасси и защитных элементов, износ гусениц или шин.',
    'Для харвестеров и форвардеров ключевые узлы — манипулятор, головка или коник, гидронасосы и ходовая. Уточните наработку и историю сервисных работ.',
    'Осматривая лесную технику, проверяйте манипулятор на люфты и течи, работу гидравлики и состояние ходовой. Наработка в моточасах покажет реальный износ.'
  ],
  agri: [
    'У сельхозтехники смотрите наработку в моточасах, состояние гидравлики, ВОМ и навесных устройств, а также следы ремонтов на раме и трансмиссии.',
    'Для трактора и навесной техники важна наработка, работа гидравлики и трансмиссии. Уточните, какие орудия комплектуются, и проверьте их износ.',
    'Проверьте моточасы, состояние двигателя после запуска на холодную, гидравлику и ВОМ. Для навесной техники — износ рабочих органов и комплектность.'
  ],
  moto: [
    'У мототехники и вездеходов проверьте пробег или наработку, состояние ходовой, рамы и трансмиссии, а также наличие регистрационных документов.',
    'Для такой техники важны состояние рамы, подвески и трансмиссии. Уточните, как эксплуатировалась машина, и проверьте комплектность.',
    'Осмотрите раму и подвеску, послушайте двигатель на холодную, проверьте документы и комплектность. По износу резины и элементов управления видно интенсивность использования.'
  ],
  body: [
    'У грузовика с надстройкой проверьте не только двигатель и раму, но и саму надстройку: кузов или фургон, механизмы, холодильную или гидравлическую установку.',
    'Для специализированного грузовика важны состояние надстройки и её оборудования. Проверьте герметичность, механизмы, ворота и борта, работу навесных агрегатов.',
    'Осмотрите шасси и надстройку отдельно: у шасси — двигатель, коробка, рама и шины, у надстройки — герметичность, замки, навесное оборудование и его документы.'
  ],
  truck: [
    'При осмотре грузовика проверьте двигатель и коробку на холодную, состояние рамы, шин и тормозной системы, а также историю обслуживания.',
    'У грузовика ключевое — рама, подвеска и трансмиссия. Запросите записи о ТО, осмотрите кузов или платформу на следы аварий и коррозию.',
    'Оцените состояние кабины, рамы и тормозов, проверьте пробег по документам и износ шин. Историю ремонтов лучше уточнить у менеджера до осмотра.'
  ],
  car: [
    'Автомобиль лучше осматривать при дневном свете: проверьте геометрию кузова и толщину лакокрасочного покрытия, историю обслуживания и работу электроники.',
    'Перед покупкой сверьте VIN, комплектацию и историю обслуживания, проверьте работу мультимедиа, подвески и тормозов на тест-драйве.',
    'Обратите внимание на состояние салона, ходовой и лакокрасочного покрытия, а также на записи о ТО. Машина из лизинга обычно обслуживалась у дилера.'
  ],
  equip: [
    'Для оборудования проверьте год ввода в эксплуатацию, наработку, комплектность и наличие паспорта. Уточните условия демонтажа и перевозки: они влияют на итоговую стоимость.',
    'Стационарное и промышленное оборудование лучше смотреть в работе: наработка, состояние рабочих узлов, износ расходных элементов и полный комплект документации.',
    'Проверьте комплектность, техническую документацию и сервисную историю. Отдельно посчитайте демонтаж, транспортировку и пусконаладочные работы на новом месте.'
  ],
  special: [
    'У специальной техники смотрят на наработку, состояние рабочего оборудования и гидравлики, а также на шасси и ходовую. Запросите сервисные записи.',
    'Осмотрите шасси и навесное оборудование раздельно, проверьте гидравлику под нагрузкой и уточните наработку в моточасах и история эксплуатации.',
    'Для спецтехники важны наработка, комплектность рабочего оборудования и исправность приборов безопасности. Документы на надстройку лучше проверить до выезда на осмотр.'
  ],
  other: [
    'Перед покупкой осмотрите технику вместе с механиком, сверьте документы и уточните историю эксплуатации и обслуживания.',
    'Проверьте состояние основных узлов, комплектность и наличие документов. Историю обслуживания лучше запросить заранее.',
    'Уточните наработку или пробег, посмотрите машину в работе и сверьте комплектность с описанием.'
  ]
};
const CLOSING = [
  'Позиция изъята лизинговой компанией и продаётся через нас: помогаем с выбором аванса и срока лизинга, а при покупке за наличные — с документами.',
  'Техника вернулась к лизингодателю и теперь продаётся. Можно купить в лизинг с авансом от нас или оплатить сразу — условия рассчитаем под вашу задачу.',
  'Перед вами предложение лизингодателя по изъятой технике: оформление, расчёт аванса и графика платежей берём на себя. Напишите — уточним наличие и условия.'
];

const parseNum = (s) => { const d = String(s || '').replace(/[^\d]/g, ''); return d ? Number(d) : null; };
const yrs = (n) => `${n} ${plural(n, ['год', 'года', 'лет'])}`;
const thousands = (n) => (n >= 1000 ? `${Math.round(n / 1000).toLocaleString('ru-RU')} тыс.` : String(n));

// статистика по каталогу для сравнения цены: сначала среди того же вида техники, иначе — в разделе
const COMPARE_KINDS = new Set(['tractor', 'dump', 'trailer', 'excavator', 'loader', 'truck']); // однородные виды, где сравнение цен имеет смысл
function peersOf(l) {
  const k = kindOf(l);
  if (!COMPARE_KINDS.has(k.key)) return [];
  return LOTS.filter((x) => x.id !== l.id && kindOf(x).key === k.key && isNum(x.price));
}

function uniqueBlock(l) {
  const k = kindOf(l);
  const paras = [];
  const facts = [];

  // возраст, пробег, наработка
  const y = Number(l.year);
  const age = isNum(y) && y > 1990 ? Math.max(0, NOW_YEAR - y) : null;
  const val = parseNum(l.mileage);
  const isHours = /м[./]?\s?ч|моточас/i.test(String(l.mileage || ''));
  if (age !== null) {
    let s = age === 0 ? `Год выпуска — ${y}, техника практически новая.` : `Год выпуска — ${y}: технике ${yrs(age)}.`;
    if (val && !isHours) {
      const per = age > 0 ? Math.round(val / age) : null;
      s += ` Заявленный пробег — ${l.mileage}${per ? `, это около ${thousands(per)} км в год` : ''}.`;
      if (per) {
        const heavy = ['tractor', 'dump', 'truck', 'body', 'bus'].includes(k.key);
        const lo = heavy ? 60000 : 12000, hi = heavy ? 150000 : 30000;
        s += per < lo ? ' Это заметно ниже средней интенсивности эксплуатации для такого типа техники.' : per > hi ? ' Это выше средней интенсивности, поэтому состояние узлов стоит проверить особенно внимательно.' : ' Это близко к обычной интенсивности эксплуатации для такого типа техники.';
      }
    } else if (val && isHours) {
      s += ` Наработка — ${l.mileage}${age > 0 ? `, в среднем около ${Math.round(val / age).toLocaleString('ru-RU')} моточасов в год` : ''}.`;
    }
    facts.push(s);
  } else if (val) {
    facts.push(`${isHours ? 'Наработка' : 'Пробег'} — ${l.mileage}.`);
  }
  if (l.engine) facts.push(`Двигатель и трансмиссия: ${esc(l.engine)}.`);
  if (facts.length) paras.push(facts.join(' '));

  // цена и положение в каталоге
  if (isNum(l.price)) {
    let s = pick([
      `Цена в лизинг — ${rub(l.price)} с НДС.`,
      `Стоимость при покупке в лизинг составляет ${rub(l.price)} с НДС.`,
      `Лизинговая цена — ${rub(l.price)}, НДС включён.`
    ], l.id, 'price');
    if (isNum(l.priceCash) && l.priceCash > l.price) s += ` Прямая покупка обойдётся в ${rub(l.priceCash)}, то есть дороже на ${rub(l.priceCash - l.price)}.`;
    const peers = peersOf(l);
    if (peers.length >= 4) {
      const cheaper = peers.filter((x) => x.price > l.price).length;
      const pc = Math.round((cheaper / peers.length) * 100);
      const scope = kindOf(l).label;
      s += pc >= 50 ? ` Дешевле, чем ${pc}% похожих позиций каталога (${scope}, ${peers.length + 1} шт.).` : ` Дороже, чем ${100 - pc}% похожих позиций каталога (${scope}, ${peers.length + 1} шт.).`;
    }
    if (/скидк/i.test(String(l.text || '')) && !/скидк/i.test(ownText(l))) s += pick([' Продавец готов обсуждать цену по итогам осмотра.', ' Возможна скидка: её размер обсуждается после осмотра.', ' После осмотра цену можно обсудить.'], l.id, 'disc');
    paras.push(s);
  }

  // место
  const cityFull = String(l.city || '').replace(/[.\s]+$/, '').replace(/\bобл$/, 'обл.');
  if (l.city) paras.push(pick([
    `Техника находится в регионе: ${esc(cityFull)}. Осмотр и передача — там; договориться о просмотре можно через Telegram или форму заявки.`,
    `Местонахождение — ${esc(cityFull)}. Приехать на осмотр можно по предварительной договорённости: напишите менеджеру, и мы согласуем время.`,
    `Место осмотра: ${esc(cityFull)}. Перед поездкой уточните у менеджера наличие и удобное время.`
  ], l.id, 'city'));

  paras.push(pick(ADVICE[k.key] || ADVICE.other, l.id, 'adv'));

  // похожие предложения (ближайшие по цене того же вида)
  const sim = LOTS.filter((x) => x.id !== l.id && kindOf(x).key === k.key).sort((a, b) => Math.abs((a.price || 0) - (l.price || 0)) - Math.abs((b.price || 0) - (l.price || 0))).slice(0, 3);
  if (sim.length) paras.push(`Похожие предложения: ${sim.map((x) => `<a href="${x.path}">${esc(x.title)}${x.year ? ', ' + x.year : ''}</a>${isNum(x.price) ? ' — ' + rub(x.price) : ''}`).join('; ')}.`);

  paras.push(pick(CLOSING, l.id, 'close'));
  return paras;
}

// текст позиции: собственный текст из каталога без шаблонного хвоста + сгенерированный блок
const TAIL_RE = /\n*Изъятая техника лизинговой компании\.\s*\n*Быстро оформлю в лизинг, аванс и срок подберу под Ваш оборот\.\s*$/;
function ownText(l) {
  let own = String(l.text || '').replace(TAIL_RE, '');
  own = own.replace(/\s*(?:Возможна скидка после осмотра|Скидка после осмотра)\.(?=\s|$)/g, '').replace(/^\s*(?:Возможна скидка после осмотра|Скидка после осмотра)\.\s*$/gm, '');
  return own.replace(/\n{3,}/g, '\n\n').trim();
}
function lotTextParts(l) {
  const own = ownText(l);
  const ownHtml = own ? own.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : '';
  const gen = uniqueBlock(l);
  const genHtml = gen.map((p) => `<p>${p}</p>`).join('');
  const unesc = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const plain = unesc((own ? esc(own) : '') + ' ' + gen.join(' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  return { html: ownHtml + genHtml, plain };
}

// ───────────────────────── страница позиции ─────────────────────────
function lotPage(l) {
  const cat = catOf(l);
  const h1 = `${l.title}${l.year ? ' ' + l.year : ''}`;
  const city = cityShort(l.city);
  const title = l.seoTitle;
  const saving = isNum(l.priceCash) && isNum(l.price) ? l.priceCash - l.price : 0;
  const txt = lotTextParts(l);
  const isHrs = /м[./]?\s?ч|моточас/i.test(String(l.mileage || ''));
  const description = `Купить ${h1} б/у${l.mileage ? `, ${isHrs ? 'наработка' : 'пробег'} ${l.mileage}` : ''}${l.city ? `, ${cityShort(l.city)}` : ''}. ${isNum(l.price) ? `Цена — ${rub(l.price)} с НДС${saving > 0 ? `, на ${rub(saving)} дешевле, чем при покупке за наличные` : ' в лизинг'}.` : 'Цена по запросу.'} Из лизинга: фото, условия осмотра, аванс и срок под вашу задачу.`;

  const img = (p, i, eager) => `<a href="${p.src}" target="_blank" rel="noopener"><img src="${p.src}" alt="${esc(l.title)} — фото ${i + 1}"${p.w ? ` width="${p.w}" height="${p.h}"` : ''}${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}></a>`;
  const gallery = l.photoList.length
    ? `<div class="lot-gal">${img(l.photoList[0], 0, true)}${l.photoList.length > 1 ? `<div class="thumbs">${l.photoList.slice(1).map((p, i) => img(p, i + 1, false)).join('')}</div>` : ''}</div>`
    : `<div class="lot-gal"><div class="ph"><div class="fallback">${esc(l.category)}</div></div></div>`;

  const specs = [
    ['Категория', `<a href="${cat.path}">${esc(l.category)}</a>`],
    l.year && ['Год выпуска', esc(l.year)],
    l.mileage && ['Пробег', esc(l.mileage)],
    l.engine && ['Двигатель', esc(l.engine)],
    l.city && ['Город', esc(l.city)],
    isNum(l.priceCash) && ['Цена при прямой покупке', rub(l.priceCash)],
    l.date && ['Добавлено', ruDate(l.date)]
  ].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');


  // «Похожие»: соседи по разделу (по кругу), чтобы у каждой позиции были входящие ссылки
  const list = cat.lots;
  const idx = list.findIndex((x) => x.id === l.id);
  const related = [];
  const kk = kindOf(l).key;
  const ordered = [];
  for (let k = 1; k < list.length; k++) ordered.push(list[(idx + k) % list.length]);
  for (const x of [...ordered.filter((x) => kindOf(x).key === kk), ...ordered.filter((x) => kindOf(x).key !== kk)]) { if (related.length < 6) related.push(x); }

  const crumbItems = [{ name: 'Главная', href: '/' }, { name: cat.name, href: cat.path }, { name: h1, self: l.path }];
  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: h1,
    sku: l.id,
    category: l.category,
    description: txt.plain || description,
    ...(l.photoList.length ? { image: l.photoList.map((p) => BASE + p.src) } : {}),
    itemCondition: 'https://schema.org/UsedCondition',
    ...(isNum(l.price) ? { offers: { '@type': 'Offer', url: url(l.path), priceCurrency: 'RUB', price: l.price, availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/UsedCondition' } } : {})
  };

  const body = `<main>
<div class="wrap">
${crumbs(crumbItems.map((c) => (c.self ? { name: c.name } : c)))}
<div class="lot-grid">
${gallery}
<div class="lot-info">
<h1>${esc(h1)}</h1>
<div class="price num">${rub(l.price)}${isNum(l.price) ? '<small>в лизинг, с НДС</small>' : ''}</div>
${saving > 0 ? `<div class="saving num">На ${rub(saving)} дешевле прямой покупки</div>` : ''}
<dl class="spec-list">${specs}</dl>
<div class="lot-cta"><a class="btn" href="${esc(CFG.tgManager)}" target="_blank" rel="noopener">Написать в Telegram</a><a class="btn ghost" href="/#zayavka">Оставить заявку</a></div>
<div class="lot-text">${txt.html}</div>
</div>
</div>
${related.length ? `<section class="related"><h2>Ещё в разделе «${esc(cat.name)}»</h2><div class="grid">${related.map(cardHtml).join('')}</div></section>` : ''}
</div>
</main>`;

  return page({ title, description, path: l.path, ogImage: l.photoList[0] ? BASE + l.photoList[0].src : undefined, ogType: 'product', body, ld: [jsonLd(product), crumbsLd(crumbItems)] });
}

// ───────────────────────── страница раздела ─────────────────────────
function catPage(c) {
  const prices = c.lots.map((l) => l.price).filter(isNum);
  const cities = new Set(c.lots.map((l) => cityShort(l.city)).filter(Boolean));
  const stat = [
    `<span><b>${c.lots.length}</b> ${plural(c.lots.length, ['позиция', 'позиции', 'позиций'])}</span>`,
    prices.length ? `<span>цены от <b>${rub(Math.min(...prices))}</b> до <b>${rub(Math.max(...prices))}</b></span>` : '',
    cities.size > 1 ? `<span><b>${cities.size}</b> ${plural(cities.size, ['город', 'города', 'городов'])}</span>` : ''
  ].filter(Boolean).join('');
  const crumbItems = [{ name: 'Главная', href: '/' }, { name: c.name, self: c.path }];
  const nav = `<ul class="cat-nav">${CATS.map((x) => `<li><a href="${x.path}"${x.slug === c.slug ? ' aria-current="page"' : ''}>${esc(x.name)} (${x.lots.length})</a></li>`).join('')}</ul>`;
  const description = `${c.intro} В каталоге ${c.lots.length} ${plural(c.lots.length, ['позиция', 'позиции', 'позиций'])}${prices.length ? `, цены от ${rub(Math.min(...prices))}` : ''}.`;
  const body = `<main>
<div class="wrap">
${crumbs(crumbItems.map((x) => (x.self ? { name: x.name } : x)))}
<section class="cat-hero"><h1>${esc(c.h1)}</h1><p>${esc(c.intro)}</p><div class="cat-stats">${stat}</div></section>
<section class="cat-list">${nav}<div class="grid">${c.lots.map(cardHtml).join('')}</div></section>
</div>
</main>`;
  const itemList = jsonLd({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: c.lots.slice(0, 50).map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: url(l.path), name: l.title })) });
  return page({ title: c.title, description, path: c.path, body, ld: [itemList, crumbsLd(crumbItems)] });
}

function plural(n, f) {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2];
}

// ───────────────────────── главная (из вашего index.html) ─────────────────────────
function homePage() {
  let html = SRC;
  const hasHead = /<head[\s>]/i.test(html);
  if (!hasHead) {
    // файл начинается с <title> без doctype/html/head/body — достраиваем каркас
    const cut = html.search(/<header[\s>]|<main[\s>]/i);
    if (cut < 0) throw new Error('Не удалось найти начало <body> в index.html');
    const headPart = html.slice(0, cut);
    const bodyPart = html.slice(cut);
    html = `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n${headPart}</head>\n<body>\n${bodyPart}\n</body>\n</html>\n`;
  } else {
    if (!/^\s*<!doctype/i.test(html)) html = '<!doctype html>\n' + html;
    if (!/<html[^>]*\blang=/i.test(html)) html = html.replace(/<html/i, '<html lang="ru"');
    if (!/<meta[^>]+charset/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + '\n<meta charset="utf-8">');
  }
  // осмысленный title
  html = /<title>[\s\S]*?<\/title>/i.test(html) ? html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(CFG.homeTitle)}</title>`) : html.replace('</head>', `<title>${esc(CFG.homeTitle)}</title>\n</head>`);

  // дополнения в <head>
  const headAdd = [
    /yandex-verification/.test(html) ? '' : verifyMeta,
    /rel="icon"/.test(html) ? '' : faviconHead,
    /"@type":\s*"Organization"/.test(html) ? '' : orgLd(),
    /build\.mjs/.test(html) ? '' : `<style>${EXTRA_CSS}</style>`,
    /metrika\/tag\.js/.test(html) ? '' : metrikaHead
  ].filter(Boolean).join('\n');
  html = html.replace('</head>', headAdd + '\n</head>');

  // ссылки на разделы и свежие позиции — обычные <a>, которые видит поисковый робот
  const latest = [...LOTS].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 12);
  const seo = `<section class="seo-links" aria-label="Разделы каталога">
<div class="wrap">
<h2>Разделы каталога</h2>
<ul>${CATS.map((c) => `<li><a href="${c.path}">${esc(c.name)} (${c.lots.length})</a></li>`).join('')}</ul>
<h3>Новые позиции</h3>
<ul>${latest.map((l) => `<li><a href="${l.path}">${esc(l.title)}${l.year ? ' ' + l.year : ''}</a></li>`).join('')}</ul>
</div>
</section>`;
  if (!/class="seo-links"/.test(html)) html = html.replace(/<footer[\s>]/i, (m) => seo + '\n' + m);
  const legal = legalLine();
  if (legal) html = html.replace(/<\/footer>/i, '</footer>\n' + legal);
  // форма заявки: вместо formsubmit.co — российская Яндекс Форма (заявки приходят на почту владельца), встраивается в iframe
  const B24 = '<script src="https://forms.yandex.ru/_static/embed.js"></script><iframe src="https://forms.yandex.ru/u/6aaec6d695add50489ef6afb/?iframe=1" frameborder="0" name="ya-form-6aaec6d695add50489ef6afb" width="100%" style="border:0;min-height:460px" title="Заявка"></iframe>';
  const b24goal = '';
  const privNote = CFG.privacyUrl ? `<p class="formnote" style="margin:.9rem 0 0;padding:.8rem 1rem;background:#fff4d6;border-left:4px solid #b07d2b;border-radius:6px;font-size:1rem;line-height:1.45;color:#1a1a1a">Нажимая «Отправить заявку», вы соглашаетесь с <a href="${esc(CFG.privacyUrl)}" style="font-weight:700;text-decoration:underline;color:#7a5410">политикой обработки персональных данных</a>.</p>` : '';
  if (/<form name="zayavka"/.test(html)) html = html.replace(/<form name="zayavka"[\s\S]*?<\/form>/i, `<div class="b24-form">\n${B24}\n${b24goal}\n${privNote}\n</div>`);
  // в форме заявки: примечание про согласие ведёт на политику
  if (CFG.privacyUrl) html = html.replace('Нажимая кнопку, вы соглашаетесь на обработку персональных данных.', `Нажимая кнопку, вы соглашаетесь с <a href="${esc(CFG.privacyUrl)}">политикой обработки персональных данных</a>.`);

  const goals = goalsScript(`if(e.target.closest&&e.target.closest(".card")&&window.ym)ym(${Number(CFG.metrikaId)},"reachGoal","open_card");`);
  if (goals) html = html.replace('</body>', goals + '\n</body>');
  return html;
}

// страница «спасибо»: цель «заявка отправлена» для Метрики
function thanksPage() {
  const f = path.join(ROOT, 'spasibo.html');
  if (!fs.existsSync(f) || !CFG.metrikaId) return null;
  let html = fs.readFileSync(f, 'utf8');
  html = html.replace('</head>', metrikaHead + '\n</head>');
  html = html.replace('</body>', `<script>window.ym&&ym(${Number(CFG.metrikaId)},"reachGoal","lead_form");</script>\n</body>`);
  return html;
}

// ───────────────────────── favicon.ico из логотипа (PNG внутри ICO) ─────────────────────────
function faviconIco() {
  const f = path.join(ROOT, 'images/logo-mark.png');
  if (!fs.existsSync(f)) return null;
  const png = fs.readFileSync(f);
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head[6] = w >= 256 ? 0 : w; head[7] = h >= 256 ? 0 : h;
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

// ───────────────────────── сборка ─────────────────────────
console.log(`Сборка: ${LOTS.length} позиций, ${CATS.length} разделов → ${path.relative(ROOT, OUT) || '.'}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// статические файлы репозитория (фото, og.jpg, CNAME и т. п.)
const SKIP = new Set(['.git', '.gitignore', '.github', '_site', 'node_modules', 'README.md', 'SEO-README.md', 'build.mjs', 'site.config.json', 'index.html', 'spasibo.html', 'privacy.html']);
for (const name of fs.readdirSync(ROOT)) {
  if (SKIP.has(name) || name === path.basename(OUT)) continue;
  fs.cpSync(path.join(ROOT, name), path.join(OUT, name), { recursive: true });
}

// политика обработки персональных данных: текст лежит в privacy.html (фрагмент), реквизиты подставляются из site.config.json
const privacySrc = path.join(ROOT, 'privacy.html');
const hasPrivacy = fs.existsSync(privacySrc);
if (hasPrivacy && !CFG.privacyUrl) CFG.privacyUrl = '/privacy/';

write('assets/site.css', STYLE + EXTRA_CSS);
write('index.html', homePage());
const thanks = thanksPage() ?? (fs.existsSync(path.join(ROOT, 'spasibo.html')) ? fs.readFileSync(path.join(ROOT, 'spasibo.html'), 'utf8') : null);
if (thanks) write('spasibo.html', thanks);
for (const c of CATS) write(c.path.slice(1) + 'index.html', catPage(c));
for (const l of LOTS) write(l.path.slice(1) + 'index.html', lotPage(l));

if (hasPrivacy) {
  const vars = { legalName: CFG.legalName, inn: CFG.inn, address: CFG.address, phone: CFG.phone, email: CFG.email, siteUrl: BASE };
  const text = fs.readFileSync(privacySrc, 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] ? esc(vars[k]) : m));
  if (/\{\{\w+\}\}/.test(text)) warn('В privacy.html остались незаполненные поля: ' + [...new Set(text.match(/\{\{\w+\}\}/g))].join(', ') + ' — заполните их в site.config.json');
  write('privacy/index.html', page({
    title: 'Политика обработки персональных данных — ' + CFG.siteName,
    description: 'Как ' + CFG.siteName + ' обрабатывает и защищает персональные данные посетителей сайта.',
    path: '/privacy/',
    body: `<main><div class="wrap doc">${text}</div></main>`
  }));
}

write('404.html', page({
  title: 'Страница не найдена — ' + CFG.siteName,
  description: 'Такой страницы нет. Возможно, позиция уже продана. Загляните в каталог.',
  path: '/404.html',
  robots: 'noindex',
  body: `<main><div class="wrap notfound"><h1>Страница не найдена</h1><p>Возможно, позиция уже продана. Загляните в каталог — там много другого.</p><div class="lot-cta" style="justify-content:center"><a class="btn" href="/#katalog">В каталог</a></div><ul class="cat-nav" style="justify-content:center;margin-top:1.5rem">${CATS.map((c) => `<li><a href="${c.path}">${esc(c.name)}</a></li>`).join('')}</ul></div></main>`
}));

const ico = faviconIco();
if (ico) write('favicon.ico', ico);

const lastmod = (arr) => arr.map((l) => l.date).filter(Boolean).sort().pop();
const urlEntry = (loc, mod) => `<url><loc>${loc}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}</url>`;
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntry(BASE + '/', lastmod(LOTS))}
${CATS.map((c) => urlEntry(url(c.path), lastmod(c.lots))).join('\n')}
${LOTS.map((l) => urlEntry(url(l.path), l.date)).join('\n')}
${hasPrivacy ? urlEntry(url('/privacy/')) : ''}
</urlset>
`);
write('robots.txt', `User-agent: *
Allow: /
Disallow: /spasibo.html

Sitemap: ${BASE}/sitemap.xml
`);

// ───────────────────────── проверка внутренних ссылок ─────────────────────────
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])); }
const broken = new Set();
for (const f of walk(OUT).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    const p = decodeURI(m[1]);
    const target = path.join(OUT, p);
    if (!(fs.existsSync(target) && (fs.statSync(target).isFile() || fs.existsSync(path.join(target, 'index.html'))))) broken.add(`${p}  ← ${path.relative(OUT, f)}`);
  }
}
if (broken.size) { [...broken].slice(0, 30).forEach((b) => warn('Битая внутренняя ссылка: ' + b)); }

console.log(`Готово: главная, ${CATS.length} разделов, ${LOTS.length} страниц позиций, sitemap.xml (${LOTS.length + CATS.length + 1 + (hasPrivacy ? 1 : 0)} адресов).`);
if (warnings.length) console.log(`Предупреждений: ${warnings.length}`);
