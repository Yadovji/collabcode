export const DEFAULT_ROOM_ID = "welcome";

export const SOCKET_EVENTS = {
  join: "workspace:join",
  documentSync: "document:sync",
  documentUpdate: "document:update",
  awarenessSync: "awareness:sync",
  awarenessUpdate: "awareness:update",
  fileCreate: "file:create",
  fileDelete: "file:delete",
  error: "workspace:error"
} as const;

export type Collaborator = {
  name: string;
  color: string;
};

export const STARTER_FILES: Record<string, string> = {
  "src/index.ts": `// Welcome to CollabCode!\n// Open this room in another browser tab and edit together.\n\nfunction greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet("world"));\n`,
  "README.md": `# CollabCode workspace\n\nA shared TypeScript project. Changes are synchronized live with everyone in this room.\n\n- Edit files together\n- Add a file from the explorer\n- Share the room using the link in the top bar\n`,
  "package.json": `{"name":"collab-workspace","private":true,"scripts":{"start":"tsx src/index.ts"}}\n`
};

export const ECOMMERCE_STARTER_FILES: Record<string, string> = {
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f5f2ec" />
    <title>Form &amp; Field — Objects for everyday</title>
    <link rel="stylesheet" href="styles.css" />
    <script defer src="script.js"></script>
  </head>
  <body>
    <div class="announcement">A little more considered. Complimentary delivery over $100.</div>
    <header class="site-header">
      <a class="wordmark" href="#top" aria-label="Form and Field home">form<span>&</span>field</a>
      <nav class="main-nav" aria-label="Main navigation"><a href="#collection">Shop</a><a href="#story">Our approach</a><a href="#footer">Visit us</a></nav>
      <button class="bag-button" id="open-bag" type="button" aria-label="Open shopping bag">Bag <span id="bag-count">0</span></button>
    </header>
    <main id="top">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">THE EVERYDAY EDIT · VOL. 04</p>
          <h1>Useful things.<br /><em>Beautifully made.</em></h1>
          <p class="hero-intro">A small collection of thoughtful objects for slower mornings, longer weekends, and everything in between.</p>
          <a class="button-link" href="#collection">Explore the collection <span aria-hidden="true">↗</span></a>
          <p class="hero-note">Designed with care · Made to be kept</p>
        </div>
        <div class="hero-art" aria-label="Illustration of the Arc over-ear headphones">
          <div class="hero-art-caption"><span>01 / SOUND</span><span>Meet the Arc</span></div>
          <svg class="hero-headphones" viewBox="0 0 280 280" role="img" aria-label="Olive green over-ear headphones">
            <path d="M65 151v-27a75 75 0 0 1 150 0v27" fill="none" stroke="#d9d0bd" stroke-width="24" stroke-linecap="round" />
            <rect x="43" y="137" width="48" height="94" rx="23" fill="#8b9270" />
            <rect x="189" y="137" width="48" height="94" rx="23" fill="#8b9270" />
            <rect x="55" y="151" width="24" height="63" rx="12" fill="#60694f" />
            <rect x="201" y="151" width="24" height="63" rx="12" fill="#60694f" />
            <path d="M99 79q41-33 82 0" fill="none" stroke="#f4f0e5" stroke-width="4" stroke-linecap="round" opacity=".75" />
          </svg>
          <span class="hero-art-stamp">FORM<br />NO. 04</span>
        </div>
        <div class="hero-foot"><span>DESIGNED FOR DAILY LIFE</span><span>SCROLL TO DISCOVER ↓</span></div>
      </section>
      <section class="values-strip" id="story"><span>Made for real life</span><i></i><span>Considered materials</span><i></i><span>Less, but better</span><i></i><span>Free delivery over $100</span></section>
      <section class="collection" id="collection">
        <div class="section-heading"><div><p class="eyebrow">THOUGHTFUL BY DESIGN</p><h2>Everyday favourites</h2></div><span>Three good things to start with</span></div>
        <div class="product-grid">
          <article class="product-card">
            <button class="product-image image-headphones" type="button" data-view="arc" aria-label="View Arc headphones details"><span class="product-badge">BESTSELLER</span><svg viewBox="0 0 200 200" aria-hidden="true"><path d="M48 106V89a52 52 0 0 1 104 0v17" fill="none" stroke="#657052" stroke-width="17" stroke-linecap="round"/><rect x="34" y="98" width="38" height="67" rx="18" fill="#8d9674"/><rect x="128" y="98" width="38" height="67" rx="18" fill="#8d9674"/><rect x="45" y="110" width="16" height="43" rx="8" fill="#566147"/><rect x="139" y="110" width="16" height="43" rx="8" fill="#566147"/></svg><span class="image-index">01</span></button>
            <div class="product-info"><div><h3>Arc wireless headphones</h3><p>Quiet focus, beautifully simple.</p></div><b>$189</b></div>
            <div class="product-actions"><button class="quiet-action" data-view="arc" type="button">Details</button><button class="add-button" data-add="arc" type="button">Add to bag <span>+</span></button></div>
          </article>
          <article class="product-card">
            <button class="product-image image-lamp" type="button" data-view="halo" aria-label="View Halo table lamp details"><span class="product-badge">NEW</span><svg viewBox="0 0 200 200" aria-hidden="true"><path d="M65 82h70l-12-37H77z" fill="#d3aa72"/><path d="M98 82v71" stroke="#756449" stroke-width="9" stroke-linecap="round"/><path d="M75 157h50" stroke="#756449" stroke-width="11" stroke-linecap="round"/><path d="M80 76q20-13 40 0" fill="none" stroke="#f6d7a1" stroke-width="4" opacity=".8"/></svg><span class="image-index">02</span></button>
            <div class="product-info"><div><h3>Halo table lamp</h3><p>A softer kind of evening.</p></div><b>$124</b></div>
            <div class="product-actions"><button class="quiet-action" data-view="halo" type="button">Details</button><button class="add-button" data-add="halo" type="button">Add to bag <span>+</span></button></div>
          </article>
          <article class="product-card">
            <button class="product-image image-weekender" type="button" data-view="weekender" aria-label="View Weekender bag details"><span class="product-badge">TRAVEL READY</span><svg viewBox="0 0 200 200" aria-hidden="true"><path d="M53 83h94l11 83H42z" fill="#b97854"/><path d="M73 83V64a27 27 0 0 1 54 0v19" fill="none" stroke="#744e3b" stroke-width="9"/><path d="M57 100h86" stroke="#d69a76" stroke-width="4"/><circle cx="100" cy="123" r="5" fill="#ead9bd"/><path d="M51 163h98" stroke="#744e3b" stroke-width="4" opacity=".4"/></svg><span class="image-index">03</span></button>
            <div class="product-info"><div><h3>Weekender carry-all</h3><p>Room for one more day.</p></div><b>$145</b></div>
            <div class="product-actions"><button class="quiet-action" data-view="weekender" type="button">Details</button><button class="add-button" data-add="weekender" type="button">Add to bag <span>+</span></button></div>
          </article>
        </div>
      </section>
      <section class="story-card"><div class="story-number">A NOTE ON MAKING</div><div><h2>Keep what you love.<br /><em>Choose it well.</em></h2><p>We work with independent makers to create fewer, better things. Honest materials, useful details, and design that feels right at home.</p><a href="#footer">Read our story <span aria-hidden="true">↗</span></a></div><div class="story-mark">F<span>&</span>F</div></section>
    </main>
    <footer class="site-footer" id="footer"><a class="wordmark" href="#top">form<span>&</span>field</a><span>Good things, made to last.</span><span>© 2026 FORM &amp; FIELD</span></footer>
    <dialog class="detail-dialog" id="detail-dialog" aria-labelledby="detail-name"><form method="dialog"><button class="dialog-close" aria-label="Close product details">×</button></form><p class="eyebrow">A CLOSER LOOK</p><h2 id="detail-name"></h2><p id="detail-description"></p><div class="dialog-detail-bottom"><b id="detail-price"></b><button id="detail-add" class="add-button" type="button">Add to bag <span>+</span></button></div></dialog>
    <dialog class="bag-dialog" id="bag-dialog" aria-labelledby="bag-title"><form method="dialog"><button class="dialog-close" aria-label="Close shopping bag">×</button></form><p class="eyebrow">YOUR PICKS</p><h2 id="bag-title">Shopping bag <span id="bag-count-heading">(0)</span></h2><div id="bag-items" class="bag-items"></div><div class="bag-total"><span>Subtotal</span><b id="bag-total">$0</b></div><p class="bag-shipping">Delivery and taxes calculated at checkout.</p><button class="checkout-button" id="checkout-button" type="button">Continue to checkout <span>↗</span></button><p class="demo-note">Demo storefront · Checkout is not connected</p></dialog>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  </body>
</html>
`,
  "styles.css": `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500;1,600&display=swap');
:root{font-family:'DM Sans',sans-serif;color:#262822;background:#f5f2ec;font-synthesis:none;text-rendering:optimizeLegibility;--ink:#262822;--muted:#77796f;--olive:#667054;--line:#dad8cf;--paper:#f5f2ec;--serif:'Playfair Display',Georgia,serif}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-width:320px}.announcement{min-height:29px;display:grid;place-items:center;background:#687255;color:#fff;font-size:10px;letter-spacing:.08em;text-align:center;padding:5px 12px}.site-header{height:70px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(20px,6vw,88px);border-bottom:1px solid var(--line)}.wordmark{text-decoration:none;color:var(--ink);font-size:20px;font-weight:700;letter-spacing:-1.3px}.wordmark span{color:#b56c4b}.main-nav{display:flex;gap:34px}.main-nav a,.site-footer>span{color:#5f6158;text-decoration:none;font-size:11px}.main-nav a:hover,.story-card a:hover{color:#b56c4b}.bag-button{display:flex;align-items:center;gap:10px;border:0;background:transparent;color:var(--ink);font:inherit;font-size:11px;cursor:pointer}.bag-button span{min-width:22px;height:22px;display:grid;place-items:center;border:1px solid #aaa99e;border-radius:50%;font-size:10px}.hero{position:relative;max-width:1320px;min-height:480px;margin:auto;padding:72px clamp(24px,8vw,120px) 48px;display:grid;grid-template-columns:1fr .9fr;align-items:center;gap:35px}.eyebrow{margin:0 0 17px;color:#858571;font-size:9px;font-weight:700;letter-spacing:.16em}.hero h1{margin:0;color:var(--ink);font:500 clamp(40px,6vw,70px)/1.04 var(--serif);letter-spacing:-2.1px}.hero h1 em,.story-card h2 em{color:#758064;font-weight:500}.hero-intro{max-width:385px;margin:20px 0 25px;color:#77796f;font-size:13px;line-height:1.8}.button-link{min-height:43px;display:inline-flex;align-items:center;gap:25px;padding:0 17px;background:var(--ink);color:white;text-decoration:none;font-size:11px}.button-link:hover,.checkout-button:hover{background:#667054}.hero-note{margin-top:29px;color:#96968c;font-size:9px;letter-spacing:.04em}.hero-art{position:relative;min-height:325px;display:grid;place-items:center;overflow:hidden;background:#8f967e}.hero-art:before,.hero-art:after{content:"";position:absolute;border:1px solid #e7e0cf55;border-radius:50%;width:310px;height:310px}.hero-art:after{width:390px;height:390px}.hero-headphones{z-index:1;width:min(80%,300px);filter:drop-shadow(0 22px 14px #30352a38)}.hero-art-caption{position:absolute;z-index:2;top:17px;left:18px;right:18px;display:flex;justify-content:space-between;color:#fff;font-size:8px;letter-spacing:.12em}.hero-art-stamp{position:absolute;right:18px;bottom:17px;color:#fff;font:600 9px/1.5 'DM Sans',sans-serif;letter-spacing:.12em;text-align:right}.hero-foot{position:absolute;right:clamp(24px,8vw,120px);bottom:17px;left:clamp(24px,8vw,120px);display:flex;justify-content:space-between;color:#929288;font-size:8px;letter-spacing:.12em}.values-strip{min-height:61px;display:flex;align-items:center;justify-content:center;gap:28px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);color:#696b61;font-size:10px}.values-strip i{width:4px;height:4px;border-radius:50%;background:#b56c4b}.collection{max-width:1320px;margin:auto;padding:72px clamp(24px,8vw,120px) 78px}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px}.section-heading .eyebrow{margin-bottom:8px}.section-heading h2{margin:0;font:500 32px/1.2 var(--serif);letter-spacing:-.7px}.section-heading>span{color:#85867d;font-size:10px}.product-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.product-card{min-width:0}.product-image{position:relative;width:100%;aspect-ratio:1.05;display:grid;place-items:center;overflow:hidden;border:0;cursor:pointer}.image-headphones{background:#e5e6dc}.image-lamp{background:#e9e0d2}.image-weekender{background:#e8dcd3}.product-image svg{width:65%;height:65%;filter:drop-shadow(0 15px 12px #34352a1b);transition:transform .25s}.product-image:hover svg{transform:translateY(-5px) scale(1.03)}.product-badge{position:absolute;top:13px;left:13px;padding:6px 8px;background:#f7f5ef;color:#67695f;font-size:7px;font-weight:700;letter-spacing:.1em}.image-index{position:absolute;right:13px;bottom:11px;color:#77796f;font-size:8px}.product-info{display:flex;justify-content:space-between;gap:8px;padding:14px 0 10px}.product-info h3{margin:0;color:var(--ink);font-size:12px;font-weight:600}.product-info p{margin:5px 0 0;color:#85867d;font-size:9px}.product-info>b{color:#43453d;font-size:11px;font-weight:600}.product-actions{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding-top:8px}.quiet-action,.add-button{border:0;background:transparent;color:#65675d;font:inherit;font-size:9px;cursor:pointer}.quiet-action:hover{color:#b56c4b}.add-button{display:flex;align-items:center;gap:10px;padding:7px 0;color:var(--ink);font-size:10px;font-weight:600}.add-button span{width:20px;height:20px;display:grid;place-items:center;border:1px solid #a8a89c;border-radius:50%;font-size:13px;font-weight:400}.add-button:hover span{border-color:var(--olive);background:var(--olive);color:white}.story-card{max-width:1080px;min-height:245px;position:relative;display:grid;grid-template-columns:.55fr 1fr .3fr;align-items:center;gap:30px;margin:0 auto 74px;padding:35px clamp(22px,6vw,70px);background:#e7e5dc}.story-number{align-self:start;color:#848579;font-size:8px;letter-spacing:.13em}.story-card h2{margin:0;font:500 clamp(27px,4vw,43px)/1.14 var(--serif);letter-spacing:-1px}.story-card p{max-width:435px;color:#74766d;font-size:11px;line-height:1.8}.story-card a{color:var(--ink);text-decoration:none;font-size:10px;font-weight:600}.story-mark{justify-self:end;color:#899073;font:500 48px var(--serif);letter-spacing:-7px}.story-mark span{color:#b56c4b}.site-footer{min-height:75px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(20px,6vw,88px);border-top:1px solid var(--line)}.site-footer .wordmark{font-size:16px}.site-footer>span{font-size:9px}.detail-dialog,.bag-dialog{position:fixed;width:min(92vw,430px);max-width:100%;padding:29px;border:1px solid #d7d4cb;background:#f8f6f0;color:var(--ink);box-shadow:0 25px 90px #26282230}.detail-dialog::backdrop,.bag-dialog::backdrop{background:#25272080;backdrop-filter:blur(3px)}.dialog-close{position:absolute;top:13px;right:15px;width:29px;height:29px;border:1px solid var(--line);border-radius:50%;background:transparent;color:var(--ink);font-size:18px;cursor:pointer}.detail-dialog h2,.bag-dialog h2{margin:0 0 12px;font:500 27px var(--serif)}.detail-dialog>p:not(.eyebrow){color:#72746b;font-size:12px;line-height:1.7}.dialog-detail-bottom{display:flex;align-items:center;justify-content:space-between;margin-top:24px;padding-top:15px;border-top:1px solid var(--line)}.dialog-detail-bottom>b{font-size:14px}.dialog-detail-bottom .add-button{padding:9px 0}.bag-dialog{margin-right:0;margin-top:0;width:min(440px,100%);height:100dvh;max-height:none;border:0;padding:32px 25px}.bag-dialog h2 span{color:#8a8b80;font:400 12px 'DM Sans',sans-serif}.bag-items{max-height:55vh;overflow:auto;margin:21px 0}.bag-empty{padding:20px 0;color:#77796f;font-size:11px;line-height:1.6}.bag-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid var(--line)}.bag-row>div{display:flex;flex-direction:column;gap:4px}.bag-row b{font-size:10px}.bag-row small{color:#77796f;font-size:9px}.bag-row button{border:0;background:transparent;color:#77796f;font-size:10px;cursor:pointer}.bag-total{display:flex;justify-content:space-between;padding:13px 0;border-top:1px solid var(--line);font-size:11px}.bag-shipping,.demo-note{color:#85867d;font-size:9px}.checkout-button{width:100%;height:43px;display:flex;align-items:center;justify-content:space-between;margin-top:17px;padding:0 13px;border:0;background:var(--ink);color:white;font:inherit;font-size:10px;cursor:pointer}.demo-note{text-align:center}.toast{position:fixed;z-index:5;right:20px;bottom:20px;transform:translateY(15px);opacity:0;pointer-events:none;padding:11px 15px;background:var(--ink);color:#fff;font-size:10px;transition:opacity .2s,transform .2s}.toast.visible{transform:translateY(0);opacity:1}@media(max-width:760px){.site-header{height:61px;padding:0 19px}.main-nav{gap:14px}.main-nav a{font-size:9px}.hero{min-height:0;grid-template-columns:1fr;gap:25px;padding:53px 21px 56px}.hero h1{font-size:clamp(42px,12vw,62px)}.hero-art{min-height:290px}.hero-foot{bottom:16px;right:22px;left:22px}.values-strip{flex-wrap:wrap;gap:10px 14px;padding:13px 18px;font-size:8px}.collection{padding:51px 20px 57px}.section-heading{align-items:flex-start;gap:10px}.section-heading h2{font-size:27px}.section-heading>span{max-width:100px;text-align:right;line-height:1.5}.product-grid{grid-template-columns:1fr 1fr;gap:20px 12px}.product-info{min-height:54px}.product-info h3{font-size:10px}.product-info p{font-size:8px}.product-info>b{font-size:10px}.product-actions{align-items:flex-start}.add-button{gap:5px;font-size:8px}.quiet-action{font-size:8px}.story-card{grid-template-columns:1fr auto;gap:17px;margin:0 18px 46px;padding:25px 21px}.story-number{grid-column:1/-1}.story-card h2{font-size:29px}.story-card p{font-size:10px}.story-mark{grid-column:2;grid-row:2;font-size:36px}.site-footer{gap:10px;flex-wrap:wrap;padding:17px 20px}.site-footer>span{font-size:8px}}@media(max-width:390px){.main-nav{gap:9px}.main-nav a{font-size:8px}.wordmark{font-size:17px}.bag-button{font-size:9px}.product-grid{grid-template-columns:1fr}.product-image{aspect-ratio:1.2}.section-heading>span{max-width:90px}}
`,
  "script.js": `const products = [
  { id: "arc", name: "Arc wireless headphones", price: 189, description: "A warm, detailed sound with soft-touch cushions and a lightweight frame. Up to 32 hours of listening, with a simple tactile control." },
  { id: "halo", name: "Halo table lamp", price: 124, description: "A gentle pool of light for the end of the day. Powder-coated metal, a linen-wrapped cable, and a dimmable warm LED." },
  { id: "weekender", name: "Weekender carry-all", price: 145, description: "A durable everyday bag cut from recycled canvas, with a roomy main compartment and a pocket for the little things." }
];
const bag = new Map();
const bagCount = document.querySelector("#bag-count");
const bagCountHeading = document.querySelector("#bag-count-heading");
const bagItems = document.querySelector("#bag-items");
const bagTotal = document.querySelector("#bag-total");
const bagDialog = document.querySelector("#bag-dialog");
const detailDialog = document.querySelector("#detail-dialog");
const toast = document.querySelector("#toast");
let selectedProduct = null;
let toastTimer;
function money(value) { return "$" + value.toFixed(0); }
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}
function renderBag() {
  const count = [...bag.values()].reduce((sum, quantity) => sum + quantity, 0);
  const total = [...bag.entries()].reduce((sum, [id, quantity]) => sum + products.find((product) => product.id === id).price * quantity, 0);
  bagCount.textContent = String(count);
  bagCountHeading.textContent = "(" + count + ")";
  bagTotal.textContent = money(total);
  if (!count) {
    bagItems.innerHTML = '<p class="bag-empty">Your bag is taking a quiet moment. Add something you love from the collection.</p>';
    return;
  }
  bagItems.innerHTML = [...bag.entries()].map(([id, quantity]) => {
    const product = products.find((item) => item.id === id);
    return '<div class="bag-row"><div><b>' + product.name + '</b><small>' + quantity + ' × ' + money(product.price) + '</small></div><button type="button" data-remove="' + id + '">Remove</button></div>';
  }).join("");
}
function addToBag(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;
  bag.set(id, (bag.get(id) || 0) + 1);
  renderBag();
  showToast(product.name + " added to your bag");
}
function showDetails(id) {
  selectedProduct = products.find((item) => item.id === id);
  if (!selectedProduct) return;
  document.querySelector("#detail-name").textContent = selectedProduct.name;
  document.querySelector("#detail-description").textContent = selectedProduct.description;
  document.querySelector("#detail-price").textContent = money(selectedProduct.price);
  detailDialog.showModal();
}
document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.add) addToBag(target.dataset.add);
  if (target.dataset.view) showDetails(target.dataset.view);
  if (target.dataset.remove) { bag.delete(target.dataset.remove); renderBag(); }
});
document.querySelector("#open-bag").addEventListener("click", () => bagDialog.showModal());
document.querySelector("#detail-add").addEventListener("click", () => {
  if (selectedProduct) addToBag(selectedProduct.id);
  detailDialog.close();
});
document.querySelector("#checkout-button").addEventListener("click", () => showToast("Demo only — checkout is not connected yet."));
renderBag();
`,
  "README.md": `# Form & Field — E-commerce demo

A sample storefront built in three shared files: HTML, CSS, and JavaScript.

## Try it

1. Run the preview in CollabCode.
2. Open product details or add an item to the bag.
3. Open the bag to change the contents and subtotal.
4. Invite a teammate to edit the storefront together.

This is a front-end demo. The bag is held in browser memory, and checkout is intentionally not connected to a payment service.
`
};

export function isSafeFilePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 160) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes("..")) return false;
  return /^[\w.-]+(?:\/[\w.-]+)*$/.test(value) && !value.split("/").some((part) => part.startsWith("."));
}

export function getLanguageForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  const languages: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", md: "markdown", css: "css", html: "html", py: "python",
    yml: "yaml", yaml: "yaml", sql: "sql"
  };
  return (extension && languages[extension]) || "plaintext";
}
