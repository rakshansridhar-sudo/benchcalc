/* BenchCalc — vanilla JS, no framework, no build step. */

(function () {
  "use strict";

  /* ---------- helpers ---------- */

  function num(str) {
    if (str === null || str === undefined) return null;
    const s = String(str).trim();
    if (s === "") return null;
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : null;
  }

  function fmt(n, maxDp = 4) {
    if (!Number.isFinite(n)) return "—";
    if (n === 0) return "0";
    const abs = Math.abs(n);
    let dp = maxDp;
    if (abs >= 1000) dp = 2;
    else if (abs >= 1) dp = 3;
    else if (abs >= 0.001) dp = 5;
    else dp = 8;
    let out = n.toFixed(dp);
    out = out.replace(/\.?0+$/, "");
    if (out === "" || out === "-") out = "0";
    return out;
  }

  function resultCard(container, headline, sub, isError) {
    container.innerHTML = `
      <div class="result-card ${isError ? "error" : ""}">
        <div class="result-headline">${headline}</div>
        ${sub ? `<div class="result-sub">${sub}</div>` : ""}
      </div>`;
  }

  function flashStatus() {
    const pill = document.getElementById("statusPill");
    pill.textContent = "calculated";
    pill.classList.add("busy");
    clearTimeout(flashStatus._t);
    flashStatus._t = setTimeout(() => {
      pill.textContent = "ready";
      pill.classList.remove("busy");
    }, 900);
  }

  /* ---------- tab navigation ---------- */

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    const tools = document.querySelectorAll(".tool");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.target;
        tabs.forEach((t) => t.classList.toggle("active", t === tab));
        tools.forEach((s) => s.classList.toggle("active", s.dataset.tool === target));
      });
    });
  }

  function initSegmented() {
    document.querySelectorAll(".segmented").forEach((group) => {
      const btns = group.querySelectorAll(".seg-btn");
      btns.forEach((btn) => {
        btn.addEventListener("click", () => {
          btns.forEach((b) => b.classList.toggle("active", b === btn));
          const mode = btn.dataset.mode;
          const parent = group.closest("section");
          parent.querySelectorAll(".pane").forEach((p) => {
            p.classList.toggle("active", p.dataset.pane === mode);
          });
        });
      });
    });
  }

  /* ---------- Molarity & Mass ---------- */
  /* mass(g) = conc(M) * MW(g/mol) * vol(L) */

  const VOL_TO_L = { L: 1, mL: 1e-3, uL: 1e-6 };
  const CONC_TO_M = { M: 1, mM: 1e-3, uM: 1e-6 };

  function initMassMolarity() {
    const els = {
      mass: document.getElementById("m_mass"),
      mw: document.getElementById("m_mw"),
      vol: document.getElementById("m_vol"),
      volUnit: document.getElementById("m_vol_unit"),
      conc: document.getElementById("m_conc"),
      concUnit: document.getElementById("m_conc_unit"),
      result: document.getElementById("m_result"),
    };

    document.getElementById("m_calc").addEventListener("click", () => {
      const mass = num(els.mass.value); // grams
      const mw = num(els.mw.value); // g/mol
      const volRaw = num(els.vol.value);
      const concRaw = num(els.conc.value);

      const blanks = [
        els.mass.value.trim() === "",
        els.mw.value.trim() === "",
        els.vol.value.trim() === "",
        els.conc.value.trim() === "",
      ];
      const blankCount = blanks.filter(Boolean).length;

      if (blankCount !== 1) {
        resultCard(
          els.result,
          blankCount === 0 ? "Clear one field" : "Fill in 3 of 4 fields",
          "Leave exactly one field empty — that's the one BenchCalc solves for.",
          true
        );
        return;
      }

      const volL = volRaw !== null ? volRaw * VOL_TO_L[els.volUnit.value] : null;
      const concM = concRaw !== null ? concRaw * CONC_TO_M[els.concUnit.value] : null;

      try {
        if (blanks[0]) {
          // solve mass
          if (mw <= 0 || volL <= 0) throw new Error("MW and volume must be greater than 0.");
          const g = concM * mw * volL;
          const mg = g * 1000;
          els.mass.value = fmt(g, 6);
          resultCard(els.result, `${fmt(g, 6)} g`, `≈ ${fmt(mg, 3)} mg needed`, false);
        } else if (blanks[1]) {
          // solve MW
          if (concM <= 0 || volL <= 0) throw new Error("Concentration and volume must be greater than 0.");
          const mw2 = mass / (concM * volL);
          els.mw.value = fmt(mw2, 3);
          resultCard(els.result, `${fmt(mw2, 3)} g/mol`, "Implied molecular weight", false);
        } else if (blanks[2]) {
          // solve volume
          if (mw <= 0 || concM <= 0) throw new Error("MW and concentration must be greater than 0.");
          const vL = mass / (mw * concM);
          const displayVol = vL / VOL_TO_L[els.volUnit.value];
          els.vol.value = fmt(displayVol, 5);
          resultCard(els.result, `${fmt(displayVol, 5)} ${els.volUnit.value}`, `≈ ${fmt(vL * 1000, 4)} mL total`, false);
        } else if (blanks[3]) {
          // solve concentration
          if (mw <= 0 || volL <= 0) throw new Error("MW and volume must be greater than 0.");
          const cM = mass / (mw * volL);
          const displayConc = cM / CONC_TO_M[els.concUnit.value];
          els.conc.value = fmt(displayConc, 5);
          resultCard(els.result, `${fmt(displayConc, 5)} ${els.concUnit.value}`, `= ${fmt(cM, 6)} M`, false);
        }
        flashStatus();
      } catch (e) {
        resultCard(els.result, "Can't calculate", e.message, true);
      }
    });

    document.getElementById("m_clear").addEventListener("click", () => {
      [els.mass, els.mw, els.vol, els.conc].forEach((i) => (i.value = ""));
      els.result.innerHTML = "";
    });
  }

  /* ---------- Dilution C1V1 = C2V2 ---------- */

  function initDilution() {
    const c1 = document.getElementById("d_c1");
    const v1 = document.getElementById("d_v1");
    const c2 = document.getElementById("d_c2");
    const v2 = document.getElementById("d_v2");
    const result = document.getElementById("d_result");

    document.getElementById("d_calc").addEventListener("click", () => {
      const vals = [c1, v1, c2, v2].map((i) => i.value.trim());
      const blankCount = vals.filter((v) => v === "").length;

      if (blankCount !== 1) {
        resultCard(
          result,
          blankCount === 0 ? "Clear one field" : "Fill in 3 of 4 fields",
          "Leave exactly one field empty — that's the one BenchCalc solves for.",
          true
        );
        return;
      }

      const C1 = num(c1.value), V1 = num(v1.value), C2 = num(c2.value), V2 = num(v2.value);

      try {
        if (vals[0] === "") {
          if (V1 <= 0) throw new Error("V1 must be greater than 0.");
          const val = (C2 * V2) / V1;
          c1.value = fmt(val, 5);
          resultCard(result, `C₁ = ${fmt(val, 5)}`, `Dilute stock to this concentration`, false);
        } else if (vals[1] === "") {
          if (C1 <= 0) throw new Error("C1 must be greater than 0.");
          const val = (C2 * V2) / C1;
          v1.value = fmt(val, 5);
          resultCard(result, `V₁ = ${fmt(val, 5)}`, `Take this much stock, bring up to V₂`, false);
        } else if (vals[2] === "") {
          if (V2 <= 0) throw new Error("V2 must be greater than 0.");
          const val = (C1 * V1) / V2;
          c2.value = fmt(val, 5);
          resultCard(result, `C₂ = ${fmt(val, 5)}`, `Resulting final concentration`, false);
        } else if (vals[3] === "") {
          if (C2 <= 0) throw new Error("C2 must be greater than 0.");
          const val = (C1 * V1) / C2;
          v2.value = fmt(val, 5);
          const diluent = val - V1;
          resultCard(result, `V₂ = ${fmt(val, 5)}`, diluent > 0 ? `Add ${fmt(diluent, 5)} diluent to V₁ = ${fmt(V1, 5)}` : "", false);
        }
        flashStatus();
      } catch (e) {
        resultCard(result, "Can't calculate", e.message, true);
      }
    });

    document.getElementById("d_clear").addEventListener("click", () => {
      [c1, v1, c2, v2].forEach((i) => (i.value = ""));
      result.innerHTML = "";
    });
  }

  /* ---------- Primer Tm ---------- */

  function analyzeSeq(raw) {
    const cleaned = raw.toUpperCase().replace(/[^ACGTU]/g, "");
    const a = (cleaned.match(/A/g) || []).length;
    const t = (cleaned.match(/[TU]/g) || []).length;
    const g = (cleaned.match(/G/g) || []).length;
    const c = (cleaned.match(/C/g) || []).length;
    const n = cleaned.length;
    return { cleaned, a, t, g, c, n };
  }

  function initTm() {
    const seqInput = document.getElementById("tm_seq");
    const saltInput = document.getElementById("tm_salt");
    const result = document.getElementById("tm_result");
    const stats = document.getElementById("tm_stats");

    document.getElementById("tm_calc").addEventListener("click", () => {
      const { cleaned, a, t, g, c, n } = analyzeSeq(seqInput.value);

      if (n === 0) {
        resultCard(result, "Enter a sequence", "Only A, C, G, T (or U) characters are counted.", true);
        stats.hidden = true;
        return;
      }

      const gcCount = g + c;
      const gcPct = (gcCount / n) * 100;
      const salt = num(saltInput.value) ?? 50; // mM
      const saltM = salt / 1000;

      const wallace = 2 * (a + t) + 4 * gcCount;

      let saltAdjusted = null;
      if (n >= 6) {
        const base = 64.9 + (41 * (gcCount - 16.4)) / n;
        const correction = saltM > 0 ? 16.6 * Math.log10(saltM / 0.05) : 0;
        saltAdjusted = base + correction;
      }

      const recommended = n < 14 ? wallace : saltAdjusted;
      const recLabel = n < 14 ? "Wallace rule" : "Salt-adjusted";

      resultCard(
        result,
        `${fmt(recommended, 1)} °C`,
        `Recommended (${recLabel}, n=${n}) — cleaned sequence: ${cleaned || "—"}`,
        false
      );

      document.getElementById("tm_len").textContent = `${n} nt`;
      document.getElementById("tm_gc").textContent = `${fmt(gcPct, 1)}%`;
      document.getElementById("tm_wallace").textContent = `${fmt(wallace, 1)} °C`;
      document.getElementById("tm_salted").textContent = saltAdjusted !== null ? `${fmt(saltAdjusted, 1)} °C` : "n/a (too short)";
      stats.hidden = false;

      flashStatus();
    });

    document.getElementById("tm_clear").addEventListener("click", () => {
      seqInput.value = "";
      result.innerHTML = "";
      stats.hidden = true;
    });
  }

  /* ---------- PCR Master Mix ---------- */

  const DEFAULT_ROWS = [
    { name: "2x Master Mix", vol: 12.5 },
    { name: "Forward primer (10 µM)", vol: 1 },
    { name: "Reverse primer (10 µM)", vol: 1 },
    { name: "Template DNA", vol: 1 },
  ];

  function initPcr() {
    const table = document.getElementById("pcr_table");
    const rxnsInput = document.getElementById("p_rxns");
    const overageInput = document.getElementById("p_overage");
    const totalInput = document.getElementById("p_total");
    const result = document.getElementById("p_result");

    function buildRows(rows) {
      table.querySelectorAll(".pcr-row:not(.pcr-header)").forEach((r) => r.remove());
      rows.forEach((r) => addRow(r.name, r.vol));
      addWaterRow();
    }

    function addRow(name = "", vol = "") {
      const row = document.createElement("div");
      row.className = "pcr-row";
      row.innerHTML = `
        <input type="text" class="row-name" value="${name}" placeholder="Component name">
        <input inputmode="decimal" class="num row-vol" value="${vol}" placeholder="0">
        <button class="row-remove" title="Remove">&times;</button>
      `;
      row.querySelector(".row-remove").addEventListener("click", () => row.remove());
      table.insertBefore(row, table.querySelector(".pcr-fill-row"));
    }

    function addWaterRow() {
      const row = document.createElement("div");
      row.className = "pcr-row pcr-fill-row readonly";
      row.innerHTML = `
        <span class="fill-label">Nuclease-free water</span>
        <input class="num row-vol" id="p_water" value="" disabled placeholder="auto">
        <span></span>
      `;
      table.appendChild(row);
    }

    document.getElementById("p_add_row").addEventListener("click", () => addRow());

    document.getElementById("p_reset").addEventListener("click", () => {
      rxnsInput.value = 1;
      overageInput.value = 10;
      totalInput.value = 25;
      buildRows(DEFAULT_ROWS);
      result.innerHTML = "";
    });

    document.getElementById("p_calc").addEventListener("click", () => {
      const rxns = num(rxnsInput.value);
      const overagePct = num(overageInput.value) ?? 0;
      const total = num(totalInput.value);

      if (!rxns || rxns < 1) {
        resultCard(result, "Enter # of reactions", "Must be 1 or more.", true);
        return;
      }
      if (!total || total <= 0) {
        resultCard(result, "Enter reaction volume", "Total volume per reaction must be greater than 0.", true);
        return;
      }

      const rows = Array.from(table.querySelectorAll(".pcr-row:not(.pcr-header):not(.pcr-fill-row)"));
      const components = rows.map((row) => ({
        name: row.querySelector(".row-name").value.trim() || "Component",
        perRxn: num(row.querySelector(".row-vol").value) ?? 0,
      }));

      const sumFixed = components.reduce((s, c) => s + c.perRxn, 0);
      const waterPerRxn = total - sumFixed;

      if (waterPerRxn < 0) {
        resultCard(
          result,
          "Components exceed reaction volume",
          `Fixed components total ${fmt(sumFixed, 3)} µL, more than the ${fmt(total, 3)} µL reaction volume.`,
          true
        );
        document.getElementById("p_water").value = fmt(waterPerRxn, 3);
        return;
      }

      document.getElementById("p_water").value = fmt(waterPerRxn, 3);

      const multiplier = rxns * (1 + overagePct / 100);
      const lines = components
        .map((c) => `${c.name}: ${fmt(c.perRxn * multiplier, 3)} µL total (${fmt(c.perRxn, 3)} µL/rxn)`)
        .join("<br>");
      const waterLine = `Nuclease-free water: ${fmt(waterPerRxn * multiplier, 3)} µL total (${fmt(waterPerRxn, 3)} µL/rxn)`;
      const grandTotal = total * multiplier;

      resultCard(
        result,
        `${fmt(grandTotal, 2)} µL total mix`,
        `For ${rxns} reaction${rxns == 1 ? "" : "s"} + ${fmt(overagePct, 1)}% overage:<br><br>${lines}<br>${waterLine}`,
        false
      );

      flashStatus();
    });

    buildRows(DEFAULT_ROWS);
  }

  /* ---------- init ---------- */

  document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initSegmented();
    initMassMolarity();
    initDilution();
    initTm();
    initPcr();
  });

  if (document.readyState === "complete" || document.readyState === "interactive") {
    if (document.readyState !== "loading") {
      // DOMContentLoaded may have already fired
    }
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
