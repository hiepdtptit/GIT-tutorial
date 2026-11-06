/** Domain logic for one lottery counter. All amounts are integers. */

export const PRICE = 10000;
export const PRODUCTS = ["kt", "cao"];

export const PRODUCT_NAME = {
  kt: "Kiến thiết",
  cao: "Vé cào",
};

/**
 * Net sheets removed without a sale.
 * Subtracting sheets (a gift) increases this; adding sheets decreases it.
 * sheets sold = opening − gifted sheets − remaining
 */
export function giftedSheets(adjustments, product, shift) {
  let gifted = 0;
  for (const item of adjustments) {
    if (item.kind !== "sheets" || item.product !== product) continue;
    if (shift && item.shift !== shift) continue;
    gifted -= item.delta;
  }
  return gifted;
}

export function sheetsSold(sales, product, shift) {
  let sold = 0;
  for (const sale of sales) {
    if (sale.product !== product) continue;
    if (shift && sale.shift !== shift) continue;
    sold += sale.qty;
  }
  return sold;
}

export function expectedRemaining(day, product) {
  return day.opening[product] - giftedSheets(day.adjustments, product) - sheetsSold(day.sales, product);
}

function cashParts(adjustments, shift) {
  let takenOut = 0;
  let added = 0;
  for (const item of adjustments) {
    if (item.kind !== "cash") continue;
    if (shift && item.shift !== shift) continue;
    if (item.delta < 0) takenOut += -item.delta;
    else added += item.delta;
  }
  return { takenOut, added };
}

/** Expected cash = (KT sold + scratch sold) × 10000 − cash taken out + cash added. */
export function expectedCash(day, shift) {
  const sold = sheetsSold(day.sales, "kt", shift) + sheetsSold(day.sales, "cao", shift);
  const { takenOut, added } = cashParts(day.adjustments, shift);
  return sold * PRICE - takenOut + added;
}

export function currentShift(day) {
  return day.handedAt ? "afternoon" : "morning";
}

export function summarize(day) {
  const products = {};
  for (const id of PRODUCTS) {
    const opening = day.opening[id];
    const gifted = giftedSheets(day.adjustments, id);
    const sold = sheetsSold(day.sales, id);
    const soldMorning = sheetsSold(day.sales, id, "morning");
    const soldAfternoon = sheetsSold(day.sales, id, "afternoon");
    products[id] = {
      opening,
      gifted,
      sold,
      soldMorning,
      soldAfternoon,
      remaining: opening - gifted - sold,
    };
  }
  const morning = expectedCash(day, "morning");
  const afternoon = expectedCash(day, "afternoon");
  return {
    products,
    cash: {
      morning,
      afternoon,
      total: morning + afternoon,
    },
    cashParts: {
      morning: cashParts(day.adjustments, "morning"),
      afternoon: cashParts(day.adjustments, "afternoon"),
      all: cashParts(day.adjustments),
    },
  };
}

export function createDay({ kt, cao, now = Date.now(), date }) {
  if (!isCount(kt) || !isCount(cao)) return { ok: false, error: "opening" };
  return {
    ok: true,
    day: {
      id: uid(),
      date: date || localDate(now),
      openedAt: now,
      handedAt: null,
      opening: { kt, cao },
      sales: [],
      redo: [],
      adjustments: [],
    },
  };
}

export function recordSale(day, product, qty, now = Date.now()) {
  if (product !== "kt" && product !== "cao") return { ok: false, error: "product" };
  if (!Number.isInteger(qty) || qty < 1) return { ok: false, error: "qty" };
  const left = expectedRemaining(day, product);
  if (qty > left) return { ok: false, error: "stock" };
  const sale = {
    id: uid(),
    product,
    qty,
    shift: currentShift(day),
    at: now,
  };
  day.sales.push(sale);
  day.redo = [];
  return { ok: true, sale };
}

export function undoSale(day) {
  const sale = day.sales.pop();
  if (!sale) return { ok: false, error: "empty" };
  day.redo.push(sale);
  return { ok: true, sale };
}

/** Take one sheet off the latest sale of this product. A sale of 1 sheet is removed. */
export function decrementProductSale(day, product) {
  if (product !== "kt" && product !== "cao") return { ok: false, error: "product" };
  let index = -1;
  for (let i = day.sales.length - 1; i >= 0; i -= 1) {
    if (day.sales[i].product === product) {
      index = i;
      break;
    }
  }
  if (index < 0) return { ok: false, error: "empty" };
  const sale = day.sales[index];
  if (sale.qty <= 1) day.sales.splice(index, 1);
  else sale.qty -= 1;
  day.redo = [];
  return { ok: true, product };
}

export function redoSale(day) {
  const sale = day.redo[day.redo.length - 1];
  if (!sale) return { ok: false, error: "empty" };
  if (sale.qty > expectedRemaining(day, sale.product)) return { ok: false, error: "stock" };
  day.redo.pop();
  day.sales.push(sale);
  return { ok: true, sale };
}

export function recordAdjustment(day, { kind, product, delta, reason, now = Date.now() }) {
  const note = typeof reason === "string" ? reason.trim() : "";
  if (!note) return { ok: false, error: "reason" };
  if (note.length > 80) return { ok: false, error: "reason" };
  if (!Number.isInteger(delta) || delta === 0) return { ok: false, error: "amount" };
  if (kind === "sheets") {
    if (product !== "kt" && product !== "cao") return { ok: false, error: "product" };
    if (delta < 0 && -delta > expectedRemaining(day, product)) return { ok: false, error: "stock" };
  } else if (kind !== "cash") {
    return { ok: false, error: "kind" };
  }
  const item = {
    id: uid(),
    kind,
    product: kind === "sheets" ? product : null,
    delta,
    reason: note,
    shift: currentShift(day),
    at: now,
  };
  day.adjustments.push(item);
  return { ok: true, item };
}

export function handover(day, now = Date.now()) {
  if (day.handedAt) return { ok: false, error: "already" };
  day.handedAt = now;
  return { ok: true };
}

export function closeDay(day, { kt, cao, cash, now = Date.now() }) {
  if (!isCount(kt) || !isCount(cao) || !isCount(cash)) return { ok: false, error: "count" };
  const sum = summarize(day);
  const expectedSheets = {
    kt: sum.products.kt.remaining,
    cao: sum.products.cao.remaining,
  };
  const cashExpected = sum.cash.total;
  return {
    ok: true,
    closed: {
      id: day.id,
      date: day.date,
      openedAt: day.openedAt,
      closedAt: now,
      handedAt: day.handedAt,
      opening: { ...day.opening },
      sales: day.sales.map((sale) => ({ ...sale })),
      adjustments: day.adjustments.map((item) => ({ ...item })),
      counted: { kt, cao },
      expectedSheets,
      cashCounted: cash,
      cashExpected,
      gaps: {
        kt: kt - expectedSheets.kt,
        cao: cao - expectedSheets.cao,
        cash: cash - cashExpected,
      },
    },
  };
}

export function localDate(now = Date.now()) {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatGrouped(n) {
  const neg = n < 0;
  const body = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "−" : "") + body;
}

export function formatVnd(n) {
  return `${formatGrouped(n)} ₫`;
}

export function formatSheets(n) {
  return `${formatGrouped(n)} tờ`;
}

function isCount(n) {
  return Number.isInteger(n) && n >= 0;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
