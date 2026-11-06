import test from "node:test";
import assert from "node:assert/strict";
import {
  closeDay,
  createDay,
  decrementProductSale,
  expectedCash,
  expectedRemaining,
  giftedSheets,
  handover,
  recordAdjustment,
  recordSale,
  redoSale,
  sheetsSold,
  summarize,
  undoSale,
} from "./ledger.js";

function open(kt = 100, cao = 40) {
  const created = createDay({ kt, cao, now: 1_700_000_000_000, date: "2026-11-05" });
  assert.equal(created.ok, true);
  return created.day;
}

test("sheets sold = opening − gifted sheets − remaining", () => {
  const day = open(100, 40);
  assert.equal(recordSale(day, "kt", 10).ok, true);
  assert.equal(recordAdjustment(day, { kind: "sheets", product: "kt", delta: -2, reason: "tặng khách" }).ok, true);
  assert.equal(recordAdjustment(day, { kind: "sheets", product: "kt", delta: 5, reason: "nhập thêm" }).ok, true);
  assert.equal(giftedSheets(day.adjustments, "kt"), -3);
  assert.equal(expectedRemaining(day, "kt"), 100 - -3 - 10);
  assert.equal(sheetsSold(day.sales, "kt"), 100 - giftedSheets(day.adjustments, "kt") - expectedRemaining(day, "kt"));
  assert.equal(expectedRemaining(day, "cao"), 40);
});

test("expected cash ignores gifts and applies cash in and out", () => {
  const day = open();
  recordSale(day, "kt", 3);
  recordSale(day, "cao", 2);
  recordAdjustment(day, { kind: "sheets", product: "kt", delta: -1, reason: "tặng" });
  recordAdjustment(day, { kind: "cash", delta: -15000, reason: "ăn sáng" });
  recordAdjustment(day, { kind: "cash", delta: 5000, reason: "thối lại" });
  assert.equal(expectedCash(day), (3 + 2) * 10000 - 15000 + 5000);
  assert.equal(expectedCash(day), 40000);
});

test("sales after handover belong to the afternoon", () => {
  const day = open();
  recordSale(day, "kt", 4);
  recordAdjustment(day, { kind: "cash", delta: -10000, reason: "ăn sáng" });
  assert.equal(handover(day, 50).ok, true);
  assert.equal(handover(day).ok, false);
  recordSale(day, "cao", 2);
  recordAdjustment(day, { kind: "sheets", product: "cao", delta: -1, reason: "tặng" });
  const sum = summarize(day);
  assert.equal(sum.products.kt.soldMorning, 4);
  assert.equal(sum.products.kt.soldAfternoon, 0);
  assert.equal(sum.products.cao.soldMorning, 0);
  assert.equal(sum.products.cao.soldAfternoon, 2);
  assert.equal(sum.cash.morning, 4 * 10000 - 10000);
  assert.equal(sum.cash.afternoon, 2 * 10000);
  assert.equal(sum.cash.total, sum.cash.morning + sum.cash.afternoon);
  assert.equal(expectedRemaining(day, "cao"), 40 - 1 - 2);
});

test("undo and redo move one sale and keep its shift", () => {
  const day = open();
  recordSale(day, "kt", 10);
  recordSale(day, "cao", 2);
  handover(day, 80);
  recordSale(day, "kt", 5);
  assert.equal(undoSale(day).sale.qty, 5);
  assert.equal(expectedRemaining(day, "kt"), 90);
  assert.equal(redoSale(day).sale.shift, "afternoon");
  assert.equal(expectedRemaining(day, "kt"), 85);
  assert.equal(undoSale(day).ok, true);
  recordSale(day, "cao", 1);
  assert.equal(day.redo.length, 0);
  assert.equal(undoSale(day).ok, true);
  assert.equal(undoSale(day).ok, true);
  assert.equal(undoSale(day).ok, true);
  assert.equal(undoSale(day).ok, false);
});

test("cannot sell or gift more sheets than remain", () => {
  const day = open(3, 1);
  assert.equal(recordSale(day, "kt", 4).error, "stock");
  assert.equal(recordSale(day, "cao", 1).ok, true);
  assert.equal(recordSale(day, "cao", 1).error, "stock");
  assert.equal(recordAdjustment(day, { kind: "sheets", product: "kt", delta: -4, reason: "tặng" }).error, "stock");
  assert.equal(recordAdjustment(day, { kind: "cash", delta: -50000, reason: "ăn sáng" }).ok, true);
  assert.equal(expectedCash(day), 10000 - 50000);
});

test("minus one sheet changes only the latest sale of that product", () => {
  const day = open(10, 10);
  recordSale(day, "kt", 3);
  recordSale(day, "cao", 2);
  recordSale(day, "kt", 1);
  undoSale(day);
  assert.equal(decrementProductSale(day, "cao").ok, true);
  assert.equal(day.redo.length, 0);
  assert.equal(day.sales.find((sale) => sale.product === "cao").qty, 1);
  assert.equal(decrementProductSale(day, "cao").ok, true);
  assert.equal(day.sales.some((sale) => sale.product === "cao"), false);
  assert.equal(day.sales.find((sale) => sale.product === "kt").qty, 3);
  assert.equal(expectedRemaining(day, "kt"), 7);
  assert.equal(expectedCash(day), 3 * 10000);
  recordAdjustment(day, { kind: "sheets", product: "cao", delta: -1, reason: "tặng" });
  assert.equal(decrementProductSale(day, "cao").error, "empty");
});

test("close compares counted sheets and cash, including a match", () => {
  const day = open(100, 40);
  recordSale(day, "kt", 10);
  recordSale(day, "cao", 2);
  undoSale(day);
  redoSale(day);
  handover(day, 90);
  recordSale(day, "cao", 1);
  recordAdjustment(day, { kind: "sheets", product: "kt", delta: -2, reason: "tặng khách" });
  recordAdjustment(day, { kind: "cash", delta: -20000, reason: "ăn sáng" });

  const expectedKt = 100 - 2 - 10;
  const expectedCao = 40 - 3;
  const expectedMoney = 13 * 10000 - 20000;

  const mismatch = closeDay(day, { kt: expectedKt - 1, cao: expectedCao, cash: expectedMoney - 10000 });
  assert.equal(mismatch.closed.gaps.kt, -1);
  assert.equal(mismatch.closed.gaps.cao, 0);
  assert.equal(mismatch.closed.gaps.cash, -10000);
  assert.equal(mismatch.closed.expectedSheets.kt, expectedKt);
  assert.equal(mismatch.closed.cashExpected, expectedMoney);

  const matched = closeDay(day, { kt: expectedKt, cao: expectedCao, cash: expectedMoney });
  assert.deepEqual(matched.closed.gaps, { kt: 0, cao: 0, cash: 0 });
  assert.equal(matched.closed.counted.kt, expectedKt);
});
