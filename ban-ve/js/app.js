import {
  PRICE,
  PRODUCT_NAME,
  closeDay,
  createDay,
  currentShift,
  formatGrouped,
  formatSheets,
  formatVnd,
  decrementProductSale,
  handover,
  recordAdjustment,
  recordSale,
  redoSale,
  summarize,
  undoSale,
} from "./ledger.js";

const STORAGE_KEY = "ban-ve-quay-v1";

const state = {
  openDay: null,
  lastClosed: null,
  reviewing: false,
  view: "sell",
  product: "kt",
  customOpen: false,
  customDigits: "",
  openDigits: { kt: "", cao: "" },
  openFocus: "kt",
  adjustMode: "gift",
  adjustProduct: "kt",
  adjustDigits: "",
  adjustReason: "",
  closeDigits: { kt: "", cao: "", cash: "" },
  closeFocus: "kt",
  toast: "",
};

let toastToken = 0;
let lastUndoAt = 0;

const app = document.querySelector("#app");

load();
render();

app.addEventListener("click", onClick);
app.addEventListener("input", (event) => {
  if (event.target.id !== "reason") return;
  state.adjustReason = event.target.value.slice(0, 80);
});
app.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.id === "reason") {
    event.preventDefault();
    saveAdjust();
  }
});

function onClick(event) {
  const button = event.target.closest("[data-act]");
  if (!button) return;
  const act = button.dataset.act;

  if (act === "digit") return onDigit(button.dataset.d);
  if (act === "nav") return setView(button.dataset.view);
  if (act === "product") return selectProduct(button.dataset.product);
  if (act === "qty") return sell(Number(button.dataset.n));
  if (act === "plus") return sell(1);
  if (act === "minus") return minusOne();
  if (act === "custom-open") {
    state.customOpen = true;
    state.customDigits = "";
    return render();
  }
  if (act === "custom-close") {
    state.customOpen = false;
    state.customDigits = "";
    return render();
  }
  if (act === "custom-sell") return sell(parseDigits(state.customDigits));
  if (act === "undo") return undo();
  if (act === "redo") return redo();
  if (act === "open-focus") {
    state.openFocus = button.dataset.key;
    return render();
  }
  if (act === "open-day") return openDay();
  if (act === "handover") return confirmHandover();
  if (act === "adjust-mode") {
    state.adjustMode = button.dataset.mode;
    state.adjustDigits = "";
    return render();
  }
  if (act === "adjust-product") {
    state.adjustProduct = button.dataset.product;
    return render();
  }
  if (act === "adjust-save") return saveAdjust();
  if (act === "close-focus") {
    state.closeFocus = button.dataset.key;
    return render();
  }
  if (act === "close-day") return finishDay();
  if (act === "new-day") return startNextDay();
}

function setView(view) {
  state.view = view;
  state.customOpen = false;
  render();
}

function selectProduct(product) {
  state.product = product;
  render();
}

function sell(qty) {
  const result = recordSale(state.openDay, state.product, qty);
  if (!result.ok) {
    setToast(result.error === "stock" ? "Không đủ tờ trong quầy" : "Nhập số tờ lớn hơn 0");
    return;
  }
  state.customOpen = false;
  state.customDigits = "";
  pulse();
  setToast(`Đã bán ${qty} tờ ${PRODUCT_NAME[state.product]} · ${formatVnd(qty * PRICE)}`);
}

function undo() {
  const now = Date.now();
  if (lastUndoAt !== 0 && now - lastUndoAt < 1000) {
    setToast("Hoàn tác mỗi giây một lần");
    return;
  }
  const result = undoSale(state.openDay);
  if (!result.ok) {
    setToast("Chưa có vé để hoàn tác");
    return;
  }
  lastUndoAt = now;
  const sale = result.sale;
  setToast(`Đã hoàn tác ${sale.qty} tờ ${PRODUCT_NAME[sale.product]}`);
}

function minusOne() {
  const result = decrementProductSale(state.openDay, state.product);
  if (!result.ok) {
    setToast("Chưa có tờ để bớt");
    return;
  }
  setToast(`Đã bớt 1 tờ ${PRODUCT_NAME[state.product]}`);
}

function redo() {
  const result = redoSale(state.openDay);
  if (!result.ok) {
    setToast(result.error === "stock" ? "Không đủ tờ trong quầy" : "Không có vé để làm lại");
    return;
  }
  const sale = result.sale;
  setToast(`Đã bán lại ${sale.qty} tờ ${PRODUCT_NAME[sale.product]}`);
}

function openDay() {
  const kt = parseDigits(state.openDigits.kt);
  const cao = parseDigits(state.openDigits.cao);
  if (kt === null || cao === null) {
    setToast("Nhập số tờ Kiến thiết và Vé cào, rồi bấm Mở quầy");
    return;
  }
  const created = createDay({ kt, cao });
  if (!created.ok) return;
  state.openDay = created.day;
  state.reviewing = false;
  state.view = "sell";
  state.product = "kt";
  state.customOpen = false;
  setToast("Đã mở quầy");
}

function confirmHandover() {
  const result = handover(state.openDay);
  if (!result.ok) return;
  setToast("Đã giao quầy. Ca chiều bắt đầu.");
}

function saveAdjust() {
  const amount = parseDigits(state.adjustDigits);
  const sheets = state.adjustMode === "gift" || state.adjustMode === "stock";
  if (!state.adjustReason.trim()) {
    setToast("Nhập lý do ngắn");
    return;
  }
  if (amount === null || amount < 1) {
    setToast(sheets ? "Nhập số tờ lớn hơn 0" : "Nhập số lớn hơn 0");
    return;
  }
  const result = recordAdjustment(state.openDay, {
    kind: sheets ? "sheets" : "cash",
    product: sheets ? state.adjustProduct : null,
    delta: state.adjustMode === "gift" || state.adjustMode === "withdraw" ? -amount : amount,
    reason: state.adjustReason,
  });
  if (!result.ok) {
    setToast(result.error === "stock" ? "Không đủ tờ trong quầy" : "Chưa ghi được");
    return;
  }
  state.adjustDigits = "";
  state.adjustReason = "";
  setToast("Đã ghi. Không tính là bán.");
}

function finishDay() {
  const kt = parseDigits(state.closeDigits.kt);
  const cao = parseDigits(state.closeDigits.cao);
  const cash = parseDigits(state.closeDigits.cash);
  if (kt === null || cao === null || cash === null) {
    setToast("Nhập đủ ba số đếm rồi mới chốt");
    return;
  }
  const result = closeDay(state.openDay, { kt, cao, cash });
  if (!result.ok) return;
  state.lastClosed = result.closed;
  state.openDay = null;
  state.reviewing = true;
  state.closeDigits = { kt: "", cao: "", cash: "" };
  state.view = "sell";
  render();
}

function startNextDay() {
  state.reviewing = false;
  const counted = state.lastClosed?.counted;
  state.openDigits = {
    kt: counted ? String(counted.kt) : "",
    cao: counted ? String(counted.cao) : "",
  };
  state.openFocus = "kt";
  render();
}

function onDigit(key) {
  const target = digitTarget();
  if (!target) return;
  let next = target.get();
  if (key === "clear") next = "";
  else if (key === "back") next = next.slice(0, -1);
  else next = pushDigit(next, key, target.max);
  target.set(next);
  render();
}

function digitTarget() {
  if (!state.openDay && !state.reviewing) {
    return {
      max: 6,
      get: () => state.openDigits[state.openFocus],
      set: (value) => {
        state.openDigits[state.openFocus] = value;
      },
    };
  }
  if (!state.openDay) return null;
  if (state.view === "sell" && state.customOpen) {
    return {
      max: 4,
      get: () => state.customDigits,
      set: (value) => {
        state.customDigits = value;
      },
    };
  }
  if (state.view === "adjust") {
    const sheets = state.adjustMode === "gift" || state.adjustMode === "stock";
    return {
      max: sheets ? 4 : 9,
      get: () => state.adjustDigits,
      set: (value) => {
        state.adjustDigits = value;
      },
    };
  }
  if (state.view === "close") {
    return {
      max: state.closeFocus === "cash" ? 9 : 6,
      get: () => state.closeDigits[state.closeFocus],
      set: (value) => {
        state.closeDigits[state.closeFocus] = value;
      },
    };
  }
  return null;
}

function render() {
  const main = document.querySelector(".main");
  const scrollTop = main ? main.scrollTop : 0;
  const reasonFocus = document.activeElement?.id === "reason" ? reasonCaret() : null;
  persist();
  const open = state.openDay;
  app.innerHTML = `<div class="phone ${open ? "" : "no-nav"}" data-screen="${screenName()}">${shell()}</div>`;
  const nextMain = document.querySelector(".main");
  if (nextMain) nextMain.scrollTop = scrollTop;
  const focused = document.querySelector(".field.on");
  if (focused) revealInMain(focused);
  if (reasonFocus) {
    const input = document.querySelector("#reason");
    if (input) {
      input.focus();
      const pos = Math.min(reasonFocus, input.value.length);
      input.setSelectionRange(pos, pos);
    }
  }
}

function shell() {
  if (state.reviewing && state.lastClosed) return reviewHtml();
  if (!state.openDay) {
    return `${openHtml()}${dockHtml(
      `<button type="button" class="primary dock-go" data-act="open-day">Mở quầy</button>${numpadHtml()}`,
    )}`;
  }
  const day = state.openDay;
  return [headerHtml(day), `<main class="main">${viewHtml(day)}</main>`, dockFor(), navHtml()].join("");
}

function viewHtml(day) {
  const body =
    state.view === "handover"
      ? handoverHtml(day)
      : state.view === "adjust"
        ? adjustHtml(day)
        : state.view === "close"
          ? closeHtml(day)
          : sellHtml(day);
  return toastHtml() + body;
}

function dockFor() {
  if (state.view === "adjust") {
    const amount = parseDigits(state.adjustDigits);
    const sheets = state.adjustMode === "gift" || state.adjustMode === "stock";
    const shown = amount === null ? "—" : sheets ? formatSheets(amount) : formatVnd(amount);
    const label = { gift: "Ghi tặng", stock: "Ghi nhập", withdraw: "Ghi rút", deposit: "Ghi thêm" }[state.adjustMode];
    return dockHtml(`
      <div class="dock-row">
        <div class="readout"><span>${sheets ? "Số tờ" : "Số tiền"}</span><strong>${esc(shown)}</strong></div>
        <button type="button" class="save" data-act="adjust-save">${label}</button>
      </div>
      ${numpadHtml()}`);
  }
  if (state.view === "close") {
    return dockHtml(`<button type="button" class="primary dock-go" data-act="close-day">Chốt sổ</button>${numpadHtml()}`);
  }
  return "";
}

function screenName() {
  if (state.reviewing && state.lastClosed) return "review";
  if (!state.openDay) return "open";
  if (state.view === "sell" && state.customOpen) return "custom";
  return state.view;
}

function headerHtml(day) {
  const sum = summarize(day);
  const shift = currentShift(day);
  return `
    <header class="top">
      <div class="top-row">
        <div>
          <p class="brand">Quầy vé số</p>
          <p class="date">${esc(formatViDate(day.date))}</p>
        </div>
        <span class="shift shift-${shift}">${shift === "morning" ? "Ca sáng" : "Ca chiều"}</span>
      </div>
      <p class="opening-line">
        <span>Tổng vé đầu ngày</span>
        <strong data-value="opening">${esc(formatSheets(sum.products.kt.opening + sum.products.cao.opening))}</strong>
      </p>
      <div class="stats" aria-live="polite">
        ${stat("Kiến thiết còn", formatSheets(sum.products.kt.remaining), "", "kt")}
        ${stat("Vé cào còn", formatSheets(sum.products.cao.remaining), "", "cao")}
        ${stat("Tiền phải có", formatVnd(sum.cash.total), sum.cash.total < 0 ? "stat-cash neg" : "stat-cash", "cash")}
        ${stat("Tổng vé đã bán", formatSheets(sum.products.kt.sold + sum.products.cao.sold), "stat-sold", "sold")}
      </div>
    </header>`;
}

function stat(label, value, extra = "", key = "") {
  return `<div class="stat ${extra}"><span>${esc(label)}</span><strong data-value="${key}">${esc(value)}</strong></div>`;
}

function navHtml() {
  const items = [
    ["sell", "Bán", iconTicket()],
    ["handover", "Giao quầy", iconHand()],
    ["adjust", "Điều chỉnh", iconSliders()],
    ["close", "Kết ngày", iconFlag()],
  ];
  const buttons = items
    .map(([view, label, icon]) => {
      const on = state.view === view ? "on" : "";
      return `<button type="button" class="${on}" data-act="nav" data-view="${view}" aria-current="${on ? "page" : "false"}">${icon}<span>${label}</span></button>`;
    })
    .join("");
  return `<nav class="nav">${buttons}</nav>`;
}

function sellHtml(day) {
  if (state.customOpen) return customHtml(day);
  const sum = summarize(day);
  const last = day.sales[day.sales.length - 1];
  const keys = [1, 2, 3, 5, 10, 16, 20]
    .map(
      (qty) => `<button type="button" class="qty" data-act="qty" data-n="${qty}" aria-label="Bán ${qty} tờ">
        <strong>${qty}</strong><small>${esc(formatVnd(qty * PRICE))}</small>
      </button>`,
    )
    .join("");
  const recent = [...day.sales].reverse().slice(0, 8);
  return `
    <div class="products">
      ${pick("kt", sum)}
      ${pick("cao", sum)}
    </div>
    <div class="stepper">
      <button type="button" class="step minus" data-act="minus" aria-label="Bớt 1 tờ"><strong>−</strong><small>Bớt 1</small></button>
      <button type="button" class="step plus" data-act="plus" aria-label="Bán 1 tờ"><strong>+</strong><small>Bán 1</small></button>
    </div>
    <div class="qtys">${keys}<button type="button" class="qty other" data-act="custom-open">Số khác</button></div>
    <div class="moves">
      <button type="button" class="undo" data-act="undo">Hoàn tác</button>
      <button type="button" class="redo" data-act="redo">Làm lại</button>
    </div>
    <p class="sale-line">${last ? `Vừa bán: ${esc(PRODUCT_NAME[last.product])} × ${last.qty}` : "Chưa bán vé nào"}</p>
    ${recent.length ? `<ul class="log">${recent.map(saleRow).join("")}</ul>` : ""}`;
}

function pick(product, sum) {
  const on = state.product === product ? "on" : "";
  return `<button type="button" class="pick ${product} ${on}" data-act="product" data-product="${product}">
    <span>${PRODUCT_NAME[product]}</span>
    <strong>${esc(formatSheets(sum.products[product].remaining))}</strong>
  </button>`;
}

function customHtml(day) {
  const sum = summarize(day);
  const left = sum.products[state.product].remaining;
  const qty = parseDigits(state.customDigits);
  const ready = qty !== null && qty >= 1 && qty <= left;
  const label = ready ? `Bán ${qty} tờ · ${formatVnd(qty * PRICE)}` : "Bán";
  return `
    <div class="custom-title">
      <h1>Số khác</h1>
      <button type="button" class="ghost tiny" data-act="custom-close">Quay lại</button>
    </div>
    <p class="lead">Bán ${esc(PRODUCT_NAME[state.product])}. Còn ${esc(formatSheets(left))}.</p>
    <div class="field on"><span>Số tờ</span><strong>${esc(state.customDigits === "" ? "0" : formatGrouped(Number(state.customDigits)))}</strong></div>
    <button type="button" class="primary" data-act="custom-sell">${esc(label)}</button>
    ${numpadHtml()}`;
}

function handoverHtml(day) {
  const sum = summarize(day);
  const handed = Boolean(day.handedAt);
  const notes = adjustmentItems(day, "morning");
  return `
    <h1>Giao quầy</h1>
    <p class="lead">Ca sáng giao cho ca chiều. Không đếm lại, không nhập số.</p>
    <section class="card">
      ${metric("Kiến thiết đã bán", formatSheets(sum.products.kt.soldMorning))}
      ${metric("Vé cào đã bán", formatSheets(sum.products.cao.soldMorning))}
      ${metric("Kiến thiết còn", formatSheets(sum.products.kt.remaining))}
      ${metric("Vé cào còn", formatSheets(sum.products.cao.remaining))}
      ${metric("Tiền ca sáng", formatVnd(sum.cash.morning))}
      ${notes.length ? `<ul class="lines">${notes.map(adjustRow).join("")}</ul>` : ""}
    </section>
    ${
      handed
        ? `<p class="hint">Đã giao lúc ${esc(formatTime(day.handedAt))}. Vé bán từ giờ thuộc ca chiều.</p>`
        : `<button type="button" class="primary" data-act="handover">Đã giao</button>`
    }`;
}

function adjustHtml(day) {
  const sheets = state.adjustMode === "gift" || state.adjustMode === "stock";
  const modes = [
    ["gift", "Tặng tờ"],
    ["stock", "Nhập tờ"],
    ["withdraw", "Rút tiền"],
    ["deposit", "Thêm tiền"],
  ];
  const modeButtons = modes
    .map(
      ([mode, label]) =>
        `<button type="button" class="mode ${state.adjustMode === mode ? "on" : ""}" data-act="adjust-mode" data-mode="${mode}">${label}</button>`,
    )
    .join("");
  const copy = {
    gift: "Tặng tờ trừ tồn, không tính tiền bán.",
    stock: "Nhập tờ cộng tồn, không tính là bán.",
    withdraw: "Rút tiền khỏi ngăn kéo, ví dụ ăn sáng.",
    deposit: "Bỏ thêm tiền vào ngăn kéo.",
  }[state.adjustMode];
  const products = sheets
    ? `<div class="products">
        <button type="button" class="pick kt ${state.adjustProduct === "kt" ? "on" : ""}" data-act="adjust-product" data-product="kt"><span>Kiến thiết</span></button>
        <button type="button" class="pick cao ${state.adjustProduct === "cao" ? "on" : ""}" data-act="adjust-product" data-product="cao"><span>Vé cào</span></button>
      </div>`
    : "";
  const items = [...day.adjustments].reverse();
  const amount = parseDigits(state.adjustDigits);
  const tooMany =
    state.adjustMode === "gift" && amount !== null && amount > summarize(day).products[state.adjustProduct].remaining;
  return `
    <h1>Điều chỉnh</h1>
    <p class="lead">${copy} Ghi nhầm thì ghi một dòng ngược lại.</p>
    ${tooMany ? `<p class="hint">Không đủ tờ để tặng.</p>` : ""}
    <div class="modes">${modeButtons}</div>
    ${products}
    <label class="sr" for="reason">Lý do</label>
    <input id="reason" class="reason" maxlength="80" placeholder="Lý do ngắn, ví dụ ăn sáng" value="${esc(state.adjustReason)}" autocomplete="off" />
    ${items.length ? `<ul class="log">${items.map(adjustLog).join("")}</ul>` : `<p class="sale-line">Chưa có điều chỉnh</p>`}`;
}

function closeHtml(day) {
  const sum = summarize(day);
  const kt = fieldCompare("kt", "Tồn Kiến thiết đếm được", sum.products.kt.remaining, "tờ");
  const cao = fieldCompare("cao", "Tồn Vé cào đếm được", sum.products.cao.remaining, "tờ");
  const cash = fieldCompare("cash", "Tiền mặt đếm được", sum.cash.total, "vnd");
  const ready = kt.filled && cao.filled && cash.filled;
  const matched = ready && kt.gap === 0 && cao.gap === 0 && cash.gap === 0;
  const banner = !ready
    ? `<div class="banner wait">Nhập đủ ba số đếm để đối chiếu</div>`
    : matched
      ? `<div class="banner ok"><span class="stamp">Sổ khớp</span></div>`
      : `<div class="banner bad"><span class="stamp">Sổ lệch</span></div>`;
  return `
    <h1>Kết ngày</h1>
    <p class="lead">Nhập số tờ đếm tay và tiền mặt thật trong ngăn kéo.</p>
    <div class="fields">${kt.html}${cao.html}${cash.html}</div>
    ${banner}
    ${shiftCard(day, sum, "morning")}
    ${shiftCard(day, sum, "afternoon")}
    <p class="formula">${esc(stockSentence("Kiến thiết", sum.products.kt))}</p>
    <p class="formula">${esc(stockSentence("Vé cào", sum.products.cao))}</p>
    <p class="formula">${esc(cashSentence(sum))}</p>`;
}

function fieldCompare(key, label, expected, unit) {
  const digits = state.closeDigits[key];
  const filled = digits !== "";
  const counted = filled ? Number(digits) : null;
  const gap = filled ? counted - expected : null;
  const tone = !filled ? "" : gap === 0 ? "match" : gap < 0 ? "short" : "over";
  const shown = filled ? (unit === "vnd" ? formatVnd(counted) : formatSheets(counted)) : "—";
  const expectedText = unit === "vnd" ? formatVnd(expected) : formatSheets(expected);
  return {
    filled,
    gap,
    html: `<button type="button" class="field ${state.closeFocus === key ? "on" : ""} ${tone}" data-act="close-focus" data-key="${key}">
      <span>${esc(label)}</span>
      <strong>${esc(shown)}</strong>
      <em>Dự kiến ${esc(expectedText)} · ${esc(gapText(gap, unit))}</em>
    </button>`,
  };
}

function shiftCard(day, sum, shift) {
  const afternoonLocked = shift === "afternoon" && !day.handedAt;
  const title = shift === "morning" ? "Ca sáng" : "Ca chiều";
  const kt = shift === "morning" ? sum.products.kt.soldMorning : sum.products.kt.soldAfternoon;
  const cao = shift === "morning" ? sum.products.cao.soldMorning : sum.products.cao.soldAfternoon;
  const cash = sum.cash[shift];
  const notes = adjustmentItems(day, shift);
  return `
    <section class="split">
      <h2>${title}</h2>
      ${
        afternoonLocked
          ? `<p>Chưa giao quầy. Mọi vé đang tính vào ca sáng.</p>`
          : `${metric("Kiến thiết đã bán", formatSheets(kt))}
             ${metric("Vé cào đã bán", formatSheets(cao))}
             ${metric("Tiền ca", formatVnd(cash))}`
      }
      ${notes.length ? `<ul class="lines">${notes.map(adjustRow).join("")}</ul>` : ""}
    </section>`;
}

function openHtml() {
  const today = formatViDate(localToday());
  const closed = state.lastClosed;
  const mismatched = closed && (closed.gaps.kt !== 0 || closed.gaps.cao !== 0 || closed.gaps.cash !== 0);
  const hint = !closed
    ? ""
    : mismatched
      ? `<p class="hint">Hôm qua sổ lệch. Ô dưới lấy theo số tờ đã đếm, sửa được trước khi mở.</p>`
      : `<p class="hint">Gợi ý từ tồn đếm hôm qua. Sửa được trước khi mở.</p>`;
  return `
    <header class="bar"><div><p class="brand">Quầy vé số</p><p>${esc(today)}</p></div></header>
    <main class="main">
      ${toastHtml()}
      <h1>Mở ngày</h1>
      <p class="lead">Một quầy, giá 10.000 ₫ một tờ. Nhập tồn đầu Kiến thiết và Vé cào.</p>
      ${hint}
      <div class="fields">
        ${openField("kt", "Tồn đầu Kiến thiết")}
        ${openField("cao", "Tồn đầu Vé cào")}
      </div>
    </main>`;
}

function openField(key, label) {
  const digits = state.openDigits[key];
  const shown = digits === "" ? "—" : formatSheets(Number(digits));
  return `<button type="button" class="field ${state.openFocus === key ? "on" : ""}" data-act="open-focus" data-key="${key}">
    <span>${label}</span><strong>${esc(shown)}</strong>
  </button>`;
}

function reviewHtml() {
  const closed = state.lastClosed;
  const day = {
    opening: closed.opening,
    sales: closed.sales,
    adjustments: closed.adjustments,
    handedAt: closed.handedAt,
    date: closed.date,
  };
  const sum = summarize(day);
  const matched = closed.gaps.kt === 0 && closed.gaps.cao === 0 && closed.gaps.cash === 0;
  return `
    <header class="bar"><div><p class="brand">Quầy vé số</p><p>${esc(formatViDate(closed.date))}</p></div></header>
    <main class="main">
      ${toastHtml()}
      <h1>Đã chốt sổ</h1>
      <div class="banner ${matched ? "ok" : "bad"}"><span class="stamp">${matched ? "Sổ khớp" : "Sổ lệch"}</span></div>
      <section class="card">
        ${compareLine("Kiến thiết", closed.expectedSheets.kt, closed.counted.kt, closed.gaps.kt, "tờ")}
        ${compareLine("Vé cào", closed.expectedSheets.cao, closed.counted.cao, closed.gaps.cao, "tờ")}
        ${compareLine("Tiền", closed.cashExpected, closed.cashCounted, closed.gaps.cash, "vnd")}
      </section>
      ${shiftCard(day, sum, "morning")}
      ${shiftCard(day, sum, "afternoon")}
      <button type="button" class="primary" data-act="new-day">Mở ngày mới</button>
    </main>`;
}

function compareLine(label, expected, counted, gap, unit) {
  const expectedText = unit === "vnd" ? formatVnd(expected) : formatSheets(expected);
  const countedText = unit === "vnd" ? formatVnd(counted) : formatSheets(counted);
  return `<div class="row"><span>${esc(label)}</span><b class="gap ${gapClass(gap)}">${esc(gapText(gap, unit))}</b></div>
    <p class="formula">Dự kiến ${esc(expectedText)} · đếm ${esc(countedText)}</p>`;
}

function metric(label, value) {
  return `<div class="row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function saleRow(sale) {
  const shift = sale.shift === "morning" ? "Sáng" : "Chiều";
  return `<li>
    <span><span class="when">${esc(formatTime(sale.at))} · ${shift}</span><br>${esc(PRODUCT_NAME[sale.product])} × ${sale.qty}</span>
    <b>${esc(formatVnd(sale.qty * PRICE))}</b>
  </li>`;
}

function adjustmentItems(day, shift) {
  return day.adjustments.filter((item) => item.shift === shift);
}

function adjustRow(item) {
  return `<li><span>${esc(adjustTitle(item))}${item.reason ? ` · ${esc(item.reason)}` : ""}</span><b>${esc(adjustAmount(item))}</b></li>`;
}

function adjustLog(item) {
  const shift = item.shift === "morning" ? "Sáng" : "Chiều";
  return `<li>
    <span><span class="when">${esc(formatTime(item.at))} · ${shift}</span><br>${esc(adjustTitle(item))}</span>
    <b>${esc(adjustAmount(item))}</b>
    <em>${esc(item.reason)}</em>
  </li>`;
}

function adjustTitle(item) {
  if (item.kind === "sheets" && item.delta < 0) return `Tặng ${PRODUCT_NAME[item.product]}`;
  if (item.kind === "sheets") return `Nhập ${PRODUCT_NAME[item.product]}`;
  if (item.delta < 0) return "Rút tiền";
  return "Thêm tiền";
}

function adjustAmount(item) {
  if (item.kind === "sheets") {
    const text = formatSheets(Math.abs(item.delta));
    return item.delta < 0 ? `−${text}` : `+${text}`;
  }
  const text = formatVnd(Math.abs(item.delta));
  return item.delta < 0 ? `−${text}` : `+${text}`;
}

function stockSentence(name, product) {
  const head = `${name}: đầu ${formatGrouped(product.opening)}`;
  let mid = "";
  if (product.gifted > 0) mid = ` − tặng ${formatGrouped(product.gifted)}`;
  else if (product.gifted < 0) mid = ` + nhập ${formatGrouped(-product.gifted)}`;
  return `${head}${mid} − bán ${formatGrouped(product.sold)} = còn ${formatGrouped(product.remaining)}`;
}

function cashSentence(sum) {
  const soldValue = (sum.products.kt.sold + sum.products.cao.sold) * PRICE;
  const { takenOut, added } = sum.cashParts.all;
  return `Tiền phải có: bán ${formatVnd(soldValue)} − rút ${formatVnd(takenOut)} + thêm ${formatVnd(added)} = ${formatVnd(sum.cash.total)}`;
}

function gapText(gap, unit) {
  if (gap === null) return "Chưa nhập";
  if (gap === 0) return "Khớp";
  const amount = unit === "vnd" ? formatVnd(Math.abs(gap)) : formatSheets(Math.abs(gap));
  return gap < 0 ? `Thiếu ${amount}` : `Thừa ${amount}`;
}

function gapClass(gap) {
  if (gap === 0) return "ok";
  if (gap < 0) return "short";
  return "over";
}

function numpadHtml() {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, "clear", 0, "back"];
  return `<div class="pad">${keys
    .map((key) => {
      const label = key === "clear" ? "Xóa" : key === "back" ? backspaceIcon() : String(key);
      const soft = key === "clear" || key === "back" ? "soft" : "";
      const name = key === "back" ? "Xóa một số" : key === "clear" ? "Xóa hết" : label;
      return `<button type="button" class="${soft}" data-act="digit" data-d="${key}" aria-label="${name}">${label}</button>`;
    })
    .join("")}</div>`;
}

function dockHtml(inner) {
  return `<div class="dock">${inner}</div>`;
}

function toastHtml() {
  if (!state.toast) return "";
  return `<div class="toast" role="status">${esc(state.toast)}</div>`;
}

function parseDigits(value) {
  if (value === "" || value == null) return null;
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}

function pushDigit(current, digit, maxLen) {
  if (current.length >= maxLen) return current;
  if (current === "0") return digit === "0" ? "0" : String(digit);
  return current + String(digit);
}

function revealInMain(el) {
  const scroller = el.closest(".main");
  if (!scroller) return;
  const pad = 8;
  const box = scroller.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  if (rect.top < box.top + pad) scroller.scrollTop -= box.top + pad - rect.top;
  else if (rect.bottom > box.bottom - pad) scroller.scrollTop += rect.bottom - (box.bottom - pad);
}

function reasonCaret() {
  const input = document.querySelector("#reason");
  return input ? input.selectionStart : 0;
}

function setToast(message) {
  state.toast = message;
  const token = ++toastToken;
  render();
  window.setTimeout(() => {
    if (token !== toastToken) return;
    state.toast = "";
    render();
  }, 2200);
}

function pulse() {
  if (navigator.vibrate) navigator.vibrate(12);
}

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      openDay: state.openDay,
      lastClosed: state.lastClosed,
      reviewing: state.reviewing,
    }),
  );
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (validDay(data.openDay)) state.openDay = data.openDay;
    if (validClosed(data.lastClosed)) state.lastClosed = data.lastClosed;
    state.reviewing = Boolean(data.reviewing && state.lastClosed && !state.openDay);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  if (!state.openDay && state.lastClosed?.counted) {
    state.openDigits.kt = String(state.lastClosed.counted.kt);
    state.openDigits.cao = String(state.lastClosed.counted.cao);
  }
}

function validDay(day) {
  return Boolean(
    day &&
      Number.isInteger(day.opening?.kt) &&
      Number.isInteger(day.opening?.cao) &&
      Array.isArray(day.sales) &&
      Array.isArray(day.redo) &&
      Array.isArray(day.adjustments) &&
      typeof day.date === "string",
  );
}

function validClosed(closed) {
  return Boolean(
    closed &&
      closed.counted &&
      Number.isInteger(closed.counted.kt) &&
      Number.isInteger(closed.counted.cao) &&
      closed.gaps &&
      Array.isArray(closed.sales) &&
      Array.isArray(closed.adjustments),
  );
}

function formatViDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function iconTicket() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v2a2 2 0 0 1 0 4v2a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-2a2 2 0 0 1 0-4Z"/></svg>`;
}

function iconHand() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 11V6a2 2 0 1 1 4 0v5"/><path d="M12 10V5a2 2 0 1 1 4 0v6"/><path d="M16 11V7a2 2 0 1 1 4 0v7a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-3a2 2 0 1 1 4 0"/></svg>`;
}

function iconSliders() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>`;
}

function backspaceIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-5-6 5-6Z"/><path d="m11 10 4 4M15 10l-4 4"/></svg>`;
}

function iconFlag() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 4v16"/><path d="M6 5h11l-2 4 2 4H6"/></svg>`;
}
