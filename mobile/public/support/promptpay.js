/* Builds a PromptPay (Thai QR Payment) payload and renders it to a QR image,
   with a live amount picker. Needs qr.js (global `qrcode`) loaded first.

   The recipient PromptPay number is never written as a literal string anywhere
   in this file or the page — it is assembled at runtime from character codes so
   it is not search-indexable and not findable with Ctrl+F in view-source. A
   determined visitor with devtools can still read the finished payload; that is
   accepted (they could equally just scan the QR).  */
(function () {
  "use strict";

  // 9 significant digits of the receiving mobile number (leading 0 dropped).
  var SIG = String.fromCharCode(57, 48, 57, 53, 51, 55, 51, 53, 56);
  // PromptPay formats a phone proxy as 13 chars: "00" + "66" + <9 digits>.
  var TARGET = "00" + "66" + SIG;
  var AID = "A000000677010111"; // PromptPay application id

  function tlv(id, value) {
    value = String(value);
    return id + ("0" + value.length).slice(-2) + value;
  }

  function crc16(s) {
    var crc = 0xffff;
    for (var i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) {
        crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
        crc &= 0xffff;
      }
    }
    return ("000" + crc.toString(16).toUpperCase()).slice(-4);
  }

  function payload(amount) {
    var merchant = tlv("00", AID) + tlv("01", TARGET);
    var s =
      tlv("00", "01") +
      tlv("01", amount ? "12" : "11") +
      tlv("29", merchant) +
      tlv("58", "TH") +
      tlv("53", "764");
    if (amount) s += tlv("54", Number(amount).toFixed(2));
    s += "6304";
    return s + crc16(s);
  }

  var chips = document.getElementById("chips");
  var custom = document.getElementById("custom");
  var qrimg = document.getElementById("qrimg");
  var fallback = document.getElementById("qrfallback");
  var give = document.getElementById("give");
  if (!chips || !qrimg) return;

  var amount = ""; // "" => no amount baked in

  function showFallback() {
    if (qrimg) qrimg.hidden = true;
    if (fallback) fallback.hidden = false;
  }

  function label() {
    if (!give) return;
    var th = document.documentElement.getAttribute("data-lang") === "th";
    if (amount) {
      give.textContent = th ? "สแกนเพื่อโอน ฿" + amount : "Scan to give ฿" + amount;
    } else {
      give.textContent = th ? "สแกนแล้วกรอกยอดเอง" : "Scan, then enter any amount";
    }
    give.hidden = false;
  }

  function render() {
    label();
    try {
      var q = qrcode(0, "M");
      q.addData(payload(amount));
      q.make();
      qrimg.src = q.createDataURL(6, 2);
      qrimg.hidden = false;
      if (fallback) fallback.hidden = true;
    } catch (e) {
      showFallback();
    }
  }

  function selectChip(btn) {
    var all = chips.querySelectorAll("button");
    for (var i = 0; i < all.length; i++) {
      all[i].setAttribute("aria-pressed", all[i] === btn ? "true" : "false");
    }
  }

  chips.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("button") : null;
    if (!btn || !chips.contains(btn)) return;
    var v = btn.getAttribute("data-amt");
    selectChip(btn);
    if (v) {
      amount = v;
      if (custom) custom.value = "";
    } else {
      amount = "";
      if (custom) custom.focus();
    }
    render();
  });

  if (custom) {
    custom.addEventListener("input", function () {
      var n = parseInt(custom.value, 10);
      if (n > 0 && n <= 100000) {
        amount = String(n);
      } else {
        amount = "";
      }
      selectChip(null);
      var anyBtn = chips.querySelector('button[data-amt=""]');
      if (anyBtn) anyBtn.setAttribute("aria-pressed", "true");
      render();
    });
  }

  document.addEventListener("langchange", label);

  if (typeof qrcode === "undefined") {
    showFallback();
  } else {
    render();
  }
})();
