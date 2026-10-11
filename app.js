/**
 * TR-TaşkınRisk ML — Ana Uygulama Denetleyicisi (app.js)
 */

import {
  PAPER_METADATA,
  STAGE1_PREDICTORS,
  THRESHOLD_SENSITIVITY_TABLE,
  TURKIYE_PRESETS,
  TURKIYE_PROVINCES
} from "./data-turkiye.js";

import {
  predictStage1AllModels,
  runExposureConfoundDiagnostic,
  runTurkiyeSpatialExperiment
} from "./ml-engine.js";

const state = {
  selectedProvinceCode: 53, // Varsayılan: Rize (Doğu Karadeniz yüksek taşkın duyarlılığı)
  mapMode: "hlrr",
  regionFilter: "ALL",
  searchQuery: "",
  simTitle: "Rize (53) — Doğu Karadeniz Havzası",
  simScores: { ...TURKIYE_PROVINCES.find((p) => p.code === 53).ordinalScores },
  threshold: 0.50,
  applyPlatt: false,
  spatialScale: "province",
  spatialTarget: "floodRiskHigh",
  citizenAnswers: {
    streamDist: "medium",  // safe | medium | risky
    floorLevel: "safe",    // safe | medium | risky
    streetDrain: "medium", // safe | medium | risky
    greenCover: "medium",  // safe | medium | risky
    slopeCoast: "safe"     // safe | medium | risky
  }
};

// Coğrafi koordinatları (Enlem 35.8–42.2, Boylam 25.8–44.8) SVG (1000 x 480) düzlemine izdüşürür
function projectLatLon(lat, lon) {
  const x = ((lon - 25.6) / (44.9 - 25.6)) * 910 + 45;
  const y = ((42.3 - lat) / (42.3 - 35.7)) * 390 + 45;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

function getRiskColor(score) {
  if (score >= 0.80) return "#ef4444";
  if (score >= 0.62) return "#f97316";
  if (score >= 0.42) return "#eab308";
  return "#10b981";
}

function getProvinceDisplayScore(prov, mode) {
  if (mode === "raw_tl") return prov.rawDollarLossScore;
  if (mode === "lr_prob") {
    return predictStage1AllModels(prov.ordinalScores, state.threshold, state.applyPlatt).probLR;
  }
  if (mode === "rf_prob") {
    const res = predictStage1AllModels(prov.ordinalScores, state.threshold, state.applyPlatt);
    return res.models.find((m) => m.name === "Random Forest").prob;
  }
  return prov.hlrScore;
}

// 1. TÜRKİYE 81 İL HARİTASINI VE TABLOSUNU ÇİZ
function renderTurkiyeMap() {
  const svg = document.getElementById("svg-turkiye-map");
  if (!svg) return;

  // Arka plan ızgara ve Türkiye ana hat çerçevesi
  let html = `
    <defs>
      <radialGradient id="seaGlow" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stop-color="#1e293b" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="#0f172a" stop-opacity="0.95"/>
      </radialGradient>
    </defs>
    <rect width="1000" height="480" rx="8" fill="url(#seaGlow)"/>
    <g stroke="rgba(148,163,184,0.12)" stroke-width="1">
      <line x1="0" y1="120" x2="1000" y2="120"/>
      <line x1="0" y1="240" x2="1000" y2="240"/>
      <line x1="0" y1="360" x2="1000" y2="360"/>
      <line x1="250" y1="0" x2="250" y2="480"/>
      <line x1="500" y1="0" x2="500" y2="480"/>
      <line x1="750" y1="0" x2="750" y2="480"/>
    </g>
    <text x="480" y="24" fill="#64748b" font-size="11" text-anchor="middle" font-weight="600">KARADENİZ (BLACK SEA)</text>
    <text x="35" y="260" fill="#64748b" font-size="11" text-anchor="middle" transform="rotate(-90 35 260)" font-weight="600">EGE DENİZİ</text>
    <text x="380" y="466" fill="#64748b" font-size="11" text-anchor="middle" font-weight="600">AKDENİZ (MEDITERRANEAN SEA)</text>
  `;

  // Aynı havzadaki komşu iller arasında ince hidrolojik bağlantı çizgileri
  for (let i = 0; i < TURKIYE_PROVINCES.length; i++) {
    for (let j = i + 1; j < TURKIYE_PROVINCES.length; j++) {
      const a = TURKIYE_PROVINCES[i];
      const b = TURKIYE_PROVINCES[j];
      const dist = Math.hypot(a.lat - b.lat, (a.lon - b.lon) * 0.8);
      if (dist < 1.35) {
        const pa = projectLatLon(a.lat, a.lon);
        const pb = projectLatLon(b.lat, b.lon);
        html += `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="rgba(148,163,184,0.18)" stroke-width="1.2"/>`;
      }
    }
  }

  // 81 İl Düğümleri
  for (const prov of TURKIYE_PROVINCES) {
    const { x, y } = projectLatLon(prov.lat, prov.lon);
    const score = getProvinceDisplayScore(prov, state.mapMode);
    const color = getRiskColor(score);
    const isSelected = prov.code === state.selectedProvinceCode;
    const matchesRegion = state.regionFilter === "ALL" || prov.region === state.regionFilter;
    const opacity = matchesRegion ? 1 : 0.22;
    const radius = state.mapMode === "raw_tl"
      ? Math.max(8, Math.min(22, 6 + Math.sqrt(prov.populationK) * 0.14))
      : Math.max(9, Math.min(16, 7 + score * 8));

    html += `
      <g class="prov-node ${isSelected ? "selected" : ""}" data-code="${prov.code}" style="opacity:${opacity}">
        <circle class="prov-Bubble" cx="${x}" cy="${y}" r="${radius.toFixed(1)}" fill="${color}" fill-opacity="0.88" stroke="#0f172a" stroke-width="1.5"/>
        <text x="${x}" y="${y + 3}" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="700" pointer-events="none">${prov.plate}</text>
        <text x="${x}" y="${y + radius + 11}" text-anchor="middle" fill="#cbd5e1" font-size="9.5" font-weight="${isSelected ? "700" : "500"}" pointer-events="none">${prov.name}</text>
      </g>
    `;
  }

  svg.innerHTML = html;

  // İl tıklama dinleyicileri
  svg.querySelectorAll(".prov-node").forEach((node) => {
    node.addEventListener("click", () => {
      const code = Number(node.getAttribute("data-code"));
      selectProvince(code);
    });
  });

  renderProvinceTable();
  renderSelectedProvinceCard();
}

function selectProvince(code) {
  state.selectedProvinceCode = code;
  const citSelect = document.getElementById("select-citizen-province");
  if (citSelect) citSelect.value = String(code);
  renderTurkiyeMap();
  renderCitizenDashboard();
}

function renderSelectedProvinceCard() {
  const container = document.getElementById("selected-province-card");
  const prov = TURKIYE_PROVINCES.find((p) => p.code === state.selectedProvinceCode);
  if (!container || !prov) return;

  const simPred = predictStage1AllModels(prov.ordinalScores, state.threshold, state.applyPlatt);
  const rfModel = simPred.models.find((m) => m.name === "Random Forest");

  container.innerHTML = `
    <div class="prov-detail-header">
      <div>
        <span class="badge-stage">${prov.region} Bölgesi • ${prov.basin} Havzası</span>
        <div class="prov-title">${prov.plate} — ${prov.name}</div>
      </div>
      <span class="status-pill ${prov.floodRiskHigh ? "high" : "low"}">
        ${prov.hlrrRating}
      </span>
    </div>
    <div class="prov-meta-grid">
      <div class="prov-meta-item">
        <span>Normalize Kayıp Oranı (HLRR)</span>
        <strong class="mono">${prov.hlrScore.toFixed(2)} (${prov.floodRiskHigh ? "Yüksek Risk=1" : "Düşük Risk=0"})</strong>
      </div>
      <div class="prov-meta-item">
        <span>Ham TL Kayıp Skoru (Nüfus Yanlı)</span>
        <strong class="mono">${prov.rawDollarLossScore.toFixed(2)} (${prov.rawLossHigh ? "Yüksek=1" : "Düşük=0"})</strong>
      </div>
      <div class="prov-meta-item">
        <span>Nüfus / Bina Maruziyeti</span>
        <strong>${prov.populationK.toLocaleString("tr-TR")} bin / ${prov.buildingValueB} Mr TL</strong>
      </div>
      <div class="prov-meta-item">
        <span>Sosyal Kırılganlık / Dirençlilik</span>
        <strong>SOVI: %${prov.soviScore} • RESL: %${prov.reslScore}</strong>
      </div>
      <div class="prov-meta-item">
        <span>Lojistik Regresyon P(Taşkın)</span>
        <strong class="mono">${simPred.probLR.toFixed(3)}</strong>
      </div>
      <div class="prov-meta-item">
        <span>Random Forest P(Taşkın)</span>
        <strong class="mono">${rfModel.prob.toFixed(3)}</strong>
      </div>
    </div>
  `;
}

function renderProvinceTable() {
  const tbody = document.getElementById("tbody-provinces");
  if (!tbody) return;

  const q = state.searchQuery.trim().toLowerCase();
  const filtered = TURKIYE_PROVINCES.filter((p) => {
    const matchRegion = state.regionFilter === "ALL" || p.region === state.regionFilter;
    const matchQuery =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.plate.includes(q) ||
      p.basin.toLowerCase().includes(q) ||
      p.region.toLowerCase().includes(q);
    return matchRegion && matchQuery;
  }).sort((a, b) => getProvinceDisplayScore(b, state.mapMode) - getProvinceDisplayScore(a, state.mapMode));

  tbody.innerHTML = filtered
    .map(
      (p) => `
      <tr data-code="${p.code}" class="${p.code === state.selectedProvinceCode ? "win-cell" : ""}">
        <td><strong>${p.plate}</strong> ${p.name}</td>
        <td>${p.region} <small>(${p.basin})</small></td>
        <td class="mono">${p.hlrScore.toFixed(2)}</td>
        <td class="mono">${p.rawDollarLossScore.toFixed(2)}</td>
      </tr>
    `
    )
    .join("");

  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => {
      selectProvince(Number(tr.getAttribute("data-code")));
    });
  });
}

// 2. CANLI 20-GÖSTERGE VE 6-ML SİMÜLATÖRÜ (SEKME 2)
function initSimulatorControls() {
  const presetSelect = document.getElementById("select-preset");
  if (presetSelect) {
    presetSelect.innerHTML =
      `<option value="">-- Arketip Seçin veya İlden Yükleyin --</option>` +
      TURKIYE_PRESETS.map((pr) => `<option value="${pr.id}">${pr.name}</option>`).join("");

    presetSelect.addEventListener("change", () => {
      const found = TURKIYE_PRESETS.find((pr) => pr.id === presetSelect.value);
      if (found) {
        state.simTitle = found.name;
        state.simScores = { ...found.scores };
        syncSlidersToState();
        updateSimulatorResults();
      }
    });
  }

  const domains = [
    { key: "hydro", title: "1. Hidro-Meteorolojik Sürücüler" },
    { key: "env", title: "2. Çevresel ve Jeomorfolojik Faktörler" },
    { key: "infra", title: "3. Altyapı ve Hidrolik Yönetim" },
    { key: "socio", title: "4. Sosyo-Ekonomik ve Planlama Göstergeleri" }
  ];

  const container = document.getElementById("sliders-domains-container");
  if (!container) return;

  container.innerHTML = domains
    .map((dom) => {
      const preds = STAGE1_PREDICTORS.filter((p) => p.domain === dom.key);
      return `
        <div class="domain-box">
          <h3>${dom.title}</h3>
          ${preds
            .map(
              (p) => `
            <div class="slider-row">
              <div class="slider-label-line">
                <label for="slider-${p.id}" title="${p.descTr}">${p.nameTr} <small>(β=${p.beta.toFixed(2)})</small></label>
                <span id="val-${p.id}" class="slider-val-badge">${state.simScores[p.id] ?? 5}</span>
              </div>
              <input type="range" id="slider-${p.id}" data-pred="${p.id}" min="0" max="19" step="1" value="${state.simScores[p.id] ?? 5}">
            </div>
          `
            )
            .join("")}
        </div>
      `;
    })
    .join("");

  container.querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener("input", () => {
      const predId = input.getAttribute("data-pred");
      const val = Number(input.value);
      state.simScores[predId] = val;
      const badge = document.getElementById(`val-${predId}`);
      if (badge) badge.textContent = String(val);
      updateSimulatorResults();
    });
  });
}

function syncSlidersToState() {
  for (const pred of STAGE1_PREDICTORS) {
    const val = state.simScores[pred.id] ?? 5;
    const input = document.getElementById(`slider-${pred.id}`);
    const badge = document.getElementById(`val-${pred.id}`);
    if (input) input.value = String(val);
    if (badge) badge.textContent = String(val);
  }
}

function updateSimulatorResults() {
  const res = predictStage1AllModels(state.simScores, state.threshold, state.applyPlatt);

  const titleEl = document.getElementById("sim-active-title");
  if (titleEl) titleEl.textContent = state.simTitle;

  const probEl = document.getElementById("sim-lr-prob");
  if (probEl) probEl.textContent = res.probLR.toFixed(3);

  const badgeEl = document.getElementById("sim-class-badge");
  if (badgeEl) {
    const isFlood = res.probLR >= state.threshold;
    badgeEl.textContent = isFlood
      ? `TAŞKIN RİSKİ YÜKSEK (Sınıf 1 • p ≥ ${state.threshold.toFixed(2)})`
      : `TAŞKIN RİSKİ DÜŞÜK (Sınıf 0 • p < ${state.threshold.toFixed(2)})`;
    badgeEl.className = `status-pill ${isFlood ? "high" : "low"}`;
  }

  // Hidrolojik vekil metrikler (SCS-CN ve Rasyonel Metot)
  document.getElementById("hydro-cn").textContent = String(res.hydrologyMetrics.cnSurrogate);
  document.getElementById("hydro-p").textContent = `${res.hydrologyMetrics.designRainMm} mm`;
  document.getElementById("hydro-q").textContent = `${res.hydrologyMetrics.directRunoffMm} mm`;
  document.getElementById("hydro-ratio").textContent = `%${res.hydrologyMetrics.runoffRatioPct}`;

  // 6 Sınıflandırıcı Çubukları
  const modelsListEl = document.getElementById("sim-models-list");
  if (modelsListEl) {
    modelsListEl.innerHTML = res.models
      .map((m) => {
        const pct = Math.round(m.prob * 100);
        const color = m.prob >= state.threshold ? "#ef4444" : "#10b981";
        return `
          <div class="model-bar-row">
            <div class="model-bar-top">
              <div>
                <strong>${m.name}</strong>
                <small style="color:#94a3b8; margin-left:6px;">(${m.tag} • Holdout AUC: ${m.holdoutAUC.toFixed(2)} • MCC: ${m.holdoutMCC.toFixed(2)})</small>
              </div>
              <div class="mono">
                <strong>P = ${m.prob.toFixed(3)}</strong> →
                <span style="color:${color}; font-weight:700;">${m.pred === 1 ? "SINIF 1 (TAŞKIN)" : "SINIF 0"}</span>
              </div>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width:${pct}%; background-color:${color};"></div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // En Baskın 8 Log-Odds Gösterge Katkısı
  const contribEl = document.getElementById("chart-contributions");
  if (contribEl) {
    const topContribs = [...res.contributions]
      .sort((a, b) => b.absContrib - a.absContrib)
      .slice(0, 8);
    contribEl.innerHTML = topContribs
      .map((c) => {
        const isPos = c.logOddsContrib >= 0;
        const widthPct = Math.min(100, Math.round((c.absContrib / 4.5) * 100));
        const color = isPos ? "#ef4444" : "#38bdf8";
        return `
          <div class="contrib-row">
            <span title="${c.nameTr}">${c.nameTr.slice(0, 22)} (x=${c.score})</span>
            <div class="contrib-bar-wrap">
              <div class="contrib-bar-fill" style="width:${widthPct}%; background:${color};"></div>
            </div>
            <span class="mono" style="text-align:right; color:${color};">${isPos ? "+" : ""}${c.logOddsContrib.toFixed(2)}</span>
          </div>
        `;
      })
      .join("");
  }

  renderCalibrationChart(res.probLR, state.threshold);
}

// Güvenilirlik Diyagramı (Şekil 14) ve Eşik Duyarlılık Eğrisi (Tablo 5)
function renderCalibrationChart(currentProb, threshold) {
  const svg = document.getElementById("svg-calibration-chart");
  if (!svg) return;

  const padL = 42, padR = 20, padT = 22, padB = 34;
  const w = 420 - padL - padR;
  const h = 230 - padT - padB;

  const toX = (v) => padL + v * w;
  const toY = (v) => padT + (1 - v) * h;

  // Makale Bölüm 3.4.1: 5 eşit frekanslı (quantile) güvenilirlik kutusu: (0.03, 0.19, 0.53, 0.89, 0.99)
  const relBins = [
    [0.03, 0.04],
    [0.19, 0.21],
    [0.53, 0.54],
    [0.89, 0.88],
    [0.99, 0.98]
  ];
  const relPoints = relBins.map(([px, py]) => `${toX(px).toFixed(1)},${toY(py).toFixed(1)}`).join(" ");

  // Tablo 5 F1 ve Recall eğrileri
  const f1Points = THRESHOLD_SENSITIVITY_TABLE.map((r) => `${toX(r.threshold).toFixed(1)},${toY(r.f1).toFixed(1)}`).join(" ");
  const recPoints = THRESHOLD_SENSITIVITY_TABLE.map((r) => `${toX(r.threshold).toFixed(1)},${toY(r.recall).toFixed(1)}`).join(" ");

  const thrX = toX(threshold);
  const probX = toX(currentProb);

  svg.innerHTML = `
    <rect x="${padL}" y="${padT}" width="${w}" height="${h}" fill="#0f172a" stroke="rgba(148,163,184,0.2)"/>
    <!-- Kusursuz Kalibrasyon Diyagonal Çizgisi -->
    <line x1="${toX(0)}" y1="${toY(0)}" x2="${toX(1)}" y2="${toY(1)}" stroke="#64748b" stroke-dasharray="4 4" stroke-width="1.2"/>
    <!-- F1 Eğrisi (Tablo 5) -->
    <polyline fill="none" stroke="#10b981" stroke-width="2" points="${f1Points}"/>
    <!-- Recall Eğrisi (Tablo 5) -->
    <polyline fill="none" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="3 2" points="${recPoints}"/>
    <!-- Güvenilirlik Eğrisi (5 Quantile Bin - Şekil 14) -->
    <polyline fill="none" stroke="#38bdf8" stroke-width="2.2" points="${relPoints}"/>
    ${relBins.map(([px, py]) => `<circle cx="${toX(px)}" cy="${toY(py)}" r="3.5" fill="#38bdf8"/>`).join("")}

    <!-- Seçili Karar Eşiği (τ) Dikey Çizgisi -->
    <line x1="${thrX}" y1="${padT}" x2="${thrX}" y2="${padT + h}" stroke="#f43f5e" stroke-width="1.8"/>
    <text x="${thrX + 4}" y="${padT + 13}" fill="#fda4af" font-size="10" font-weight="700">τ=${threshold.toFixed(2)}</text>

    <!-- Mevcut Havza Tahmin Olasılığı İşaretçisi -->
    <circle cx="${probX}" cy="${toY(currentProb)}" r="5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>

    <!-- Eksen Etiketleri -->
    <text x="${padL + w / 2}" y="222" fill="#94a3b8" font-size="10.5" text-anchor="middle">Tahmin Olasılığı (p̂) / Karar Eşiği (τ)</text>
    <text x="12" y="${padT + h / 2}" fill="#94a3b8" font-size="10.5" text-anchor="middle" transform="rotate(-90 12 ${padT + h / 2})">Gözlenen Oran / F1 / Recall</text>

    <!-- Lejant -->
    <g font-size="9.5" fill="#cbd5e1">
      <rect x="${padL + 8}" y="${padT + 6}" width="8" height="3" fill="#38bdf8"/>
      <text x="${padL + 20}" y="${padT + 10}">Kalibrasyon (BS=0.11)</text>
      <rect x="${padL + 125}" y="${padT + 6}" width="8" height="3" fill="#10b981"/>
      <text x="${padL + 137}" y="${padT + 10}">F1 (Zirve τ=0.60)</text>
      <rect x="${padL + 230}" y="${padT + 6}" width="8" height="3" fill="#f59e0b"/>
      <text x="${padL + 242}" y="${padT + 10}">Recall (Duyarlılık)</text>
    </g>
  `;
}

// 3. MEKÂNSAL BÖLGE-DIŞI ÇAPRAZ DOĞRULAMA (LORO-CV) LABORATUVARI (SEKME 3)
function renderSpatialExperiment() {
  const exp = runTurkiyeSpatialExperiment(state.spatialScale, state.spatialTarget);

  const tbody = document.getElementById("tbody-spatial-folds");
  if (tbody) {
    tbody.innerHTML =
      exp.spatialCV.folds
        .map((f) => {
          const lrBest = f.aucLR >= f.aucRF;
          return `
          <tr>
            <td><strong>${f.region}</strong></td>
            <td class="mono">${f.nTrain}</td>
            <td class="mono">${f.nTest}</td>
            <td class="mono">%${(f.prevalence * 100).toFixed(1)}</td>
            <td class="mono ${lrBest ? "win-cell" : ""}">${f.aucLR.toFixed(3)}</td>
            <td class="mono ${!lrBest ? "win-cell" : ""}">${f.aucRF.toFixed(3)}</td>
            <td class="mono">${f.aucLGBM.toFixed(3)}</td>
          </tr>
        `;
        })
        .join("") +
      `
      <tr style="background:rgba(14,165,233,0.12); font-weight:700;">
        <td>ORTALAMA (Mekânsal LORO-CV)</td>
        <td class="mono">—</td>
        <td class="mono">${exp.nTotal}</td>
        <td class="mono">—</td>
        <td class="mono ${exp.spatialCV.meanAucLR >= exp.spatialCV.meanAucRF ? "win-cell" : ""}">${exp.spatialCV.meanAucLR.toFixed(3)}</td>
        <td class="mono ${exp.spatialCV.meanAucRF > exp.spatialCV.meanAucLR ? "win-cell" : ""}">${exp.spatialCV.meanAucRF.toFixed(3)}</td>
        <td class="mono">${exp.spatialCV.meanAucLGBM.toFixed(3)}</td>
      </tr>
    `;
  }

  // SVG Karşılaştırma Grafiği: Rastgele Bölme vs Mekânsal LORO-CV (Şekil 22, 25, 26)
  const svg = document.getElementById("svg-spatial-collapse");
  if (!svg) return;

  const groups = [
    {
      label: "Lojistik Regresyon (LR)",
      rand: state.spatialScale === "district" ? 0.74 : 0.67,
      spat: exp.spatialCV.meanAucLR
    },
    {
      label: "Random Forest (RF)",
      rand: state.spatialScale === "district" ? 0.85 : 0.79,
      spat: exp.spatialCV.meanAucRF
    },
    {
      label: "LightGBM (LGBM)",
      rand: state.spatialScale === "district" ? 0.84 : 0.78,
      spat: exp.spatialCV.meanAucLGBM
    }
  ];

  const padL = 55, padB = 42, padT = 28;
  const chartH = 215;
  const toY = (auc) => padT + (1 - (auc - 0.40) / 0.60) * chartH;
  const chanceY = toY(0.50);

  let barsHtml = `
    <rect x="${padL}" y="${padT}" width="490" height="${chartH}" fill="#0f172a" stroke="rgba(148,163,184,0.2)"/>
    <line x1="${padL}" y1="${chanceY}" x2="${padL + 490}" y2="${chanceY}" stroke="#ef4444" stroke-dasharray="5 4" stroke-width="1.4"/>
    <text x="${padL + 482}" y="${chanceY - 5}" fill="#fca5a5" font-size="10" text-anchor="end">Şans Seviyesi (AUC = 0.50)</text>
  `;

  groups.forEach((g, idx) => {
    const gx = padL + 55 + idx * 155;
    const yRand = toY(g.rand);
    const ySpat = toY(g.spat);
    const hRand = padT + chartH - yRand;
    const hSpat = padT + chartH - ySpat;
    const ratioPct = Math.round(((g.spat - g.rand) / g.rand) * 100);

    barsHtml += `
      <rect x="${gx}" y="${yRand}" width="42" height="${hRand}" rx="4" fill="#38bdf8"/>
      <text x="${gx + 21}" y="${yRand - 6}" fill="#38bdf8" font-size="11" font-weight="700" text-anchor="middle">${g.rand.toFixed(2)}</text>

      <rect x="${gx + 48}" y="${ySpat}" width="42" height="${hSpat}" rx="4" fill="#f59e0b"/>
      <text x="${gx + 69}" y="${ySpat - 6}" fill="#fbbf24" font-size="11" font-weight="700" text-anchor="middle">${g.spat.toFixed(2)}</text>

      <text x="${gx + 45}" y="${padT + chartH + 18}" fill="#e2e8f0" font-size="11" font-weight="600" text-anchor="middle">${g.label}</text>
      <text x="${gx + 45}" y="${padT + chartH + 32}" fill="#94a3b8" font-size="10" text-anchor="middle">Transfer Kaybı: ${ratioPct}%</text>
    `;
  });

  barsHtml += `
    <g font-size="10.5" fill="#cbd5e1">
      <rect x="${padL + 14}" y="${padT + 8}" width="12" height="10" rx="2" fill="#38bdf8"/>
      <text x="${padL + 30}" y="${padT + 17}">Rastgele 70/30 Bölme AUC (İç İnterpolasyon)</text>
      <rect x="${padL + 260}" y="${padT + 8}" width="12" height="10" rx="2" fill="#f59e0b"/>
      <text x="${padL + 276}" y="${padT + 17}">Mekânsal LORO-CV AUC (Yeni Bölgeye Transfer)</text>
    </g>
  `;

  svg.innerHTML = barsHtml;
}

// 4. KENDİ CSV VERİNİ TEST ET VE TOPLU 81 İL SINIFLANDIRMASI (SEKME 4)
function runBatchClassification(rows) {
  const container = document.getElementById("csv-results-container");
  if (!container) return;

  const evaluated = rows.map((r) => {
    const res = predictStage1AllModels(r.scores, state.threshold, state.applyPlatt);
    const rf = res.models.find((m) => m.name === "Random Forest");
    const lgbm = res.models.find((m) => m.name === "LightGBM");
    return {
      name: r.name,
      region: r.region || "Özel Havza",
      probLR: res.probLR,
      probRF: rf.prob,
      probLGBM: lgbm.prob,
      predClass: res.probLR >= state.threshold ? 1 : 0,
      runoffMm: res.hydrologyMetrics.directRunoffMm
    };
  });

  const highCount = evaluated.filter((e) => e.predClass === 1).length;

  container.innerHTML = `
    <div style="margin-bottom:10px; font-size:13px; color:#cbd5e1;">
      Toplam <strong>${evaluated.length}</strong> birim analiz edildi •
      Karar Eşiği (τ = ${state.threshold.toFixed(2)}) altında Yüksek Taşkın Riskli Birim Sayısı:
      <strong style="color:#f87171;">${highCount} (%${((highCount / evaluated.length) * 100).toFixed(1)})</strong>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Havza / İl / Birim</th>
            <th>Bölge</th>
            <th>LR P(Taşkın)</th>
            <th>LightGBM P</th>
            <th>RF P</th>
            <th>SCS-CN Akış (mm)</th>
            <th>Sınıflandırma (τ=${state.threshold.toFixed(2)})</th>
          </tr>
        </thead>
        <tbody>
          ${evaluated
            .map(
              (e) => `
            <tr>
              <td><strong>${e.name}</strong></td>
              <td>${e.region}</td>
              <td class="mono">${e.probLR.toFixed(3)}</td>
              <td class="mono">${e.probLGBM.toFixed(3)}</td>
              <td class="mono">${e.probRF.toFixed(3)}</td>
              <td class="mono">${e.runoffMm} mm</td>
              <td><span class="status-pill ${e.predClass ? "high" : "low"}">${e.predClass ? "Yüksek Risk (1)" : "Düşük Risk (0)"}</span></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function downloadSampleCSV() {
  const headers = ["Name", "Region", ...STAGE1_PREDICTORS.map((p) => p.id)];
  const sampleRows = TURKIYE_PROVINCES.slice(0, 15).map((p) => [
    p.name,
    p.region,
    ...STAGE1_PREDICTORS.map((pred) => p.ordinalScores[pred.id])
  ]);
  const csvContent = [headers.join(","), ...sampleRows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "turkiye_taskin_risk_sablon.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseUploadedCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return;
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < 3) continue;
    const scores = {};
    STAGE1_PREDICTORS.forEach((p, idx) => {
      const colIdx = headers.indexOf(p.id);
      scores[p.id] = colIdx >= 0 ? Number(cols[colIdx] || 5) : Number(cols[idx + 2] || 5);
    });
    rows.push({
      name: cols[0] || `Birim-${i}`,
      region: cols[1] || "Yüklenen CSV",
      scores
    });
  }
  runBatchClassification(rows);
}

// ============================================================================
// ANA SAYFA: VATANDAŞ & LİSE MEZUNU SEL KARNESİ DASHBOARD MANTIĞI
// ============================================================================
const PLAIN_REASON_EXPLANATIONS = {
  MonsoonIntensity: {
    title: "Ani ve Şiddetli Sağanak Yağışlar",
    desc: "Bu ilde yağmurlar kısa sürede çok yoğun yağdığı için toprak ve rögarlar suyu emmeye yetişemiyor."
  },
  Deforestation: {
    title: "Orman ve Bitki Örtüsü Kaybı",
    desc: "Yukarı yamaçlarda suyu tutacak ağaç ve bitki örtüsü azaldığı için yağmur suyu hızla aşağı akıyor."
  },
  InadequatePlanning: {
    title: "Dere Yatağı Yakınında Yapılaşma",
    desc: "Eski dere yatakları ve taşkın ovaları yapılaşmaya açıldığı için su kendi doğal yolunu arıyor."
  },
  DisasterPreparedness: {
    title: "Erken Uyarı ve Hazırlık Eksikliği",
    desc: "Mahalle bazlı sel erken uyarı sistemleri ve tahliye hazırlıkları henüz tüm riskli sokakları kapsamıyor."
  },
  ClimateChange: {
    title: "İklim Değişikliği ve Fırtına Artışı",
    desc: "Son yıllarda alışılmışın dışında, çok daha sert ve düzensiz fırtına/sağanak yağışlar görülüyor."
  },
  Siltation: {
    title: "Dere Yataklarının Kum ve Çamurla Dolması",
    desc: "Akarsu ve dere yataklarının dibi taş, kum ve rusubatla dolduğu için su taşma seviyesine çok çabuk ulaşıyor."
  },
  RiverManagement: {
    title: "Dere Islahı ve Koruma Duvarı Yetersizliği",
    desc: "Dere kenarlarındaki koruma duvarları (seddeler) ve yatak temizliği şiddetli taşkınlar için yetersiz kalabiliyor."
  },
  TopographyDrainage: {
    title: "Arazi Eğimi ve Çukur Alan Etkisi",
    desc: "Dik yamaçlardan hızla inen sular veya çukur ova tabanında biriken sular doğal yoldan kolay tahliye olamıyor."
  },
  Watersheds: {
    title: "Yukarı Havza Su Tutma Zayıflığı",
    desc: "İlin beslendiği yan dereler aynı anda kabardığında ana nehir kollarında su seviyesi hızla yükseliyor."
  },
  CoastalVulnerability: {
    title: "Deniz Kabarması ve Kıyı Geri Tepmesi",
    desc: "Fırtınalı havalarda deniz seviyesi yükseldiği için derelerin denize dökülmesi zorlaşıyor ve su geriye şişiyor."
  },
  Urbanization: {
    title: "Yoğun Betonlaşma ve Asfalt Yüzeyler",
    desc: "Toprak alanların yerini asfalt ve beton aldığı için yağmur suyu toprağa sızamayıp sokaklarda sel oluşturuyor."
  },
  DrainageSystems: {
    title: "Yağmur Suyu Izgara ve Kanal Yetersizliği",
    desc: "Şehir içi yağmur suyu boruları ve cadde ızgaraları kuvvetli sağanaklarda kapasiteyi kaldıramıyor."
  },
  DamsQuality: {
    title: "Baraj, Gölet ve Bent Güvenlik Riski",
    desc: "Akarsu üzerindeki su tutucu yapıların ve menfezlerin aşırı yağışta doluluk ve kapak yönetimi kritik önem taşıyor."
  },
  AgriculturalPractices: {
    title: "Tarım Arazilerinde Yüzey Akışı",
    desc: "Yanlış toprak işleme ve drenaj kanallarının kapanması nedeniyle tarım alanlarından yerleşimlere çamurlu su akıyor."
  },
  Encroachments: {
    title: "Dere Yataklarının Daraltılması ve Kapatılması",
    desc: "Derelerin üstünün kapatılması, dar köprü/menfezler yapılması suyun geçişini tıkayarak taşkına yol açıyor."
  },
  IneffectiveDisasterPreparedness: {
    title: "Müdahale ve Tahliye Koordinasyon Güçlüğü",
    desc: "Sel anında alt geçitlerin kapatılması ve mahalle tahliyesinde gecikmeler yaşanabiliyor."
  },
  Landslides: {
    title: "Heyelan ve Çamur Akıntısı Tehlikesi",
    desc: "Toprak suya doyduğunda dik yamaçlardan kopan toprak ve ağaçlar dere yataklarını tıkayarak seli büyütüyor."
  },
  WetlandLoss: {
    title: "Doğal Sünger Alanların (Sulak Alan) Kaybı",
    desc: "Fazla suyu bir sünger gibi emen sazlık, gölet ve taşkın çayırları kurutulduğu için su doğrudan şehre iniyor."
  },
  PopulationScore: {
    title: "Yüksek Nüfus ve Bina Yoğunluğu",
    desc: "Çok sayıda insan ve araç aynı dar cadde ve alt geçitleri kullandığı için sel anında etkilenme oranı artıyor."
  },
  DeterioratingInfrastructure: {
    title: "Eskiyen Köprü, Menfez ve Altyapı",
    desc: "Eski köprü ayakları ve dar büzler sel sularının getirdiği dal ve çöplerle tıkanarak suyu sokağa taşırıyor."
  }
};

function computeCitizenAdjustedScores(prov) {
  const custom = { ...prov.ordinalScores };
  const ans = state.citizenAnswers;

  // 1. Dere yakınlığı -> Encroachments, RiverManagement, TopographyDrainage
  const streamDelta = ans.streamDist === "risky" ? 4 : ans.streamDist === "safe" ? -3 : 0;
  custom.Encroachments = Math.max(0, Math.min(18, custom.Encroachments + streamDelta));
  custom.RiverManagement = Math.max(0, Math.min(18, custom.RiverManagement + streamDelta));

  // 2. Kat durumu -> IneffectiveDisasterPreparedness, InadequatePlanning
  const floorDelta = ans.floorLevel === "risky" ? 4 : ans.floorLevel === "medium" ? 2 : -2;
  custom.InadequatePlanning = Math.max(0, Math.min(18, custom.InadequatePlanning + floorDelta));
  custom.DisasterPreparedness = Math.max(0, Math.min(18, custom.DisasterPreparedness + floorDelta));

  // 3. Sokak ve rögar durumu -> DrainageSystems, DeterioratingInfrastructure
  const drainDelta = ans.streetDrain === "risky" ? 4 : ans.streetDrain === "safe" ? -3 : 0;
  custom.DrainageSystems = Math.max(0, Math.min(18, custom.DrainageSystems + drainDelta));
  custom.DeterioratingInfrastructure = Math.max(0, Math.min(18, custom.DeterioratingInfrastructure + drainDelta));

  // 4. Yeşil alan vs Betonlaşma -> Urbanization, Deforestation
  const greenDelta = ans.greenCover === "risky" ? 3 : ans.greenCover === "safe" ? -3 : 0;
  custom.Urbanization = Math.max(0, Math.min(18, custom.Urbanization + greenDelta));
  custom.Deforestation = Math.max(0, Math.min(18, custom.Deforestation + greenDelta));

  // 5. Yamaç / Kıyı durumu -> Landslides, CoastalVulnerability, TopographyDrainage
  const slopeDelta = ans.slopeCoast === "risky" ? 4 : ans.slopeCoast === "medium" ? 2 : -2;
  custom.Landslides = Math.max(0, Math.min(18, custom.Landslides + slopeDelta));
  custom.TopographyDrainage = Math.max(0, Math.min(18, custom.TopographyDrainage + slopeDelta));

  return custom;
}

function renderCitizenDashboard() {
  const container = document.getElementById("citizen-report-container");
  const prov = TURKIYE_PROVINCES.find((p) => p.code === state.selectedProvinceCode);
  if (!container || !prov) return;

  // Hızlı il butonlarının aktiflik durumu
  document.querySelectorAll(".chip-btn").forEach((chip) => {
    chip.classList.toggle("active", Number(chip.getAttribute("data-prov")) === prov.code);
  });

  // 81 il içinde HLRR sıralaması
  const sortedByHlr = [...TURKIYE_PROVINCES].sort((a, b) => b.hlrScore - a.hlrScore);
  const provRank = sortedByHlr.findIndex((p) => p.code === prov.code) + 1;
  const trAvgPct = Math.round(
    (TURKIYE_PROVINCES.reduce((acc, p) => acc + p.hlrScore, 0) / TURKIYE_PROVINCES.length) * 100
  );

  // İlin temel risk yüzdesi (0–100)
  const provBasePct = Math.round(prov.hlrScore * 100);

  // Kullanıcının 5 cevabına göre mahalle/bina bazlı kişisel risk yüzdesi
  const ans = state.citizenAnswers;
  let localModifier = 0;
  if (ans.streamDist === "risky") localModifier += 14;
  else if (ans.streamDist === "safe") localModifier -= 10;

  if (ans.floorLevel === "risky") localModifier += 16;
  else if (ans.floorLevel === "medium") localModifier += 7;
  else localModifier -= 8;

  if (ans.streetDrain === "risky") localModifier += 11;
  else if (ans.streetDrain === "safe") localModifier -= 7;

  if (ans.greenCover === "risky") localModifier += 6;
  else if (ans.greenCover === "safe") localModifier -= 5;

  if (ans.slopeCoast === "risky") localModifier += 10;
  else if (ans.slopeCoast === "medium") localModifier += 4;
  else localModifier -= 4;

  // Bilimsel model olasılığı ile birleştirilmiş kişisel risk skoru (5 ile 98 arası)
  const customScores = computeCitizenAdjustedScores(prov);
  const customPred = predictStage1AllModels(customScores, state.threshold, state.applyPlatt);
  const personalPct = Math.max(
    5,
    Math.min(98, Math.round(provBasePct * 0.65 + customPred.probLR * 100 * 0.35 + localModifier))
  );

  // Risk seviyesi etiketi ve rengi
  let gradeLabel = "DÜŞÜK RİSK (Güvenli Konum)";
  let gradeColor = "#10b981";
  let gradeBg = "rgba(16, 185, 129, 0.18)";
  if (personalPct >= 78) {
    gradeLabel = "ÇOK YÜKSEK RİSK (Acil Önlem Gerekli)";
    gradeColor = "#ef4444";
    gradeBg = "rgba(239, 68, 68, 0.22)";
  } else if (personalPct >= 60) {
    gradeLabel = "YÜKSEK RİSK (Dikkatli Olunmalı)";
    gradeColor = "#f97316";
    gradeBg = "rgba(249, 115, 22, 0.22)";
  } else if (personalPct >= 42) {
    gradeLabel = "ORTA RİSK (Tedbirli Olunmalı)";
    gradeColor = "#eab308";
    gradeBg = "rgba(234, 179, 8, 0.20)";
  }

  // Üst Hero kutularını güncelle
  const heroRankEl = document.getElementById("cit-hero-rank");
  const heroProvEl = document.getElementById("cit-hero-provname");
  const heroPersEl = document.getElementById("cit-hero-personal-score");
  const heroSubEl = document.getElementById("cit-hero-personal-sub");
  if (heroRankEl) heroRankEl.textContent = `${provRank}. / 81 İl`;
  if (heroProvEl) heroProvEl.textContent = `${prov.plate} ${prov.name} (${prov.region})`;
  if (heroPersEl) {
    heroPersEl.textContent = `%${personalPct} — ${personalPct >= 78 ? "Çok Yüksek" : personalPct >= 60 ? "Yüksek" : personalPct >= 42 ? "Orta" : "Düşük"}`;
    heroPersEl.style.color = gradeColor;
  }
  if (heroSubEl) {
    const diff = personalPct - provBasePct;
    heroSubEl.textContent = `İl geneli %${provBasePct} (${diff >= 0 ? "+" + diff : diff} puan bina/sokak etkisi)`;
  }

  // İlin en yüksek 4 risk göstergesini bul ve sade Türkçeye çevir
  const top4Predictors = [...STAGE1_PREDICTORS]
    .map((p) => ({
      ...p,
      val: prov.ordinalScores[p.id],
      plain: PLAIN_REASON_EXPLANATIONS[p.id] || { title: p.nameTr, desc: p.descTr }
    }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 4);

  // Kişiselleştirilmiş yorum cümlesi
  let verdictText = "";
  if (provBasePct >= 62 && personalPct >= 65) {
    verdictText = `<strong>${prov.name}</strong> ili Türkiye'de taşkın tehlikesi en yüksek iller arasındadır (81 ilde <strong>${provRank}. sıra</strong>). Üstelik işaretlediğiniz mahalle ve bina özellikleri de riskinizi <strong>%${personalPct}</strong> seviyesinde tutuyor. Şiddetli yağış uyarılarında su baskınına karşı mutlaka hazırlıklı olmalısınız.`;
  } else if (provBasePct < 55 && personalPct >= 60) {
    verdictText = `<strong>${prov.name}</strong> ilinin genel sel riski Türkiye ortalamasının altında veya orta düzeydedir (<strong>%${provBasePct}</strong>). <strong>Ancak dikkat:</strong> Seçtiğiniz bina/sokak konumu (dereye yakınlık, bodrum/zemin kat veya rögar taşması) sizin kişisel su baskını riskinizi <strong>%${personalPct} (Yüksek Risk)</strong> seviyesine çıkarıyor!`;
  } else if (provBasePct >= 62 && personalPct < 58) {
    verdictText = `<strong>${prov.name}</strong> ili genel olarak yüksek sel tehlikesine sahiptir (<strong>%${provBasePct}</strong>, Türkiye'de ${provRank}. sıra). Ancak evinizin <strong>üst katta ve dere yatağından uzakta</strong> olması daire içi su baskını riskinizi <strong>%${personalPct}</strong> seviyesine düşürüyor. Yine de sel anında mahalle yolları ve bina girişi kapanabilir.`;
  } else {
    verdictText = `<strong>${prov.name}</strong> ilinin genel taşkın duyarlılığı (<strong>%${provBasePct}</strong>) ve işaretlediğiniz ev/sokak konumu (<strong>%${personalPct}</strong>) güvenli/ılımlı aralıktadır. Temel yağmur suyu ve bina tedbirlerini korumanız yeterlidir.`;
  }

  // 3 Sütunlu Kişiselleştirilmiş Önlem Listesi
  const homeActions = [];
  if (ans.floorLevel === "risky" || ans.floorLevel === "medium") {
    homeActions.push("<strong>Geri Tepme Ventili (Çekvalf):</strong> Zemin/bodrum katta olduğunuz için şiddetli yağmurda kanalizasyonun evin içinden taşmasını önleyen çekvalf mutlaka taktırın.");
    homeActions.push("<strong>Kapı ve Pencere Su Bariyeri:</strong> Bina girişine ve bodrum pencerelerine takıp çıkarılabilen su bendi veya kum torbası hazırlayın.");
  } else {
    homeActions.push("<strong>Bina Bodrumu ve Elektrik Panosu:</strong> Üst katta otursanız bile binanın elektrik panosu ve asansör kuyusu su alırsa günlerce elektriksiz kalabilirsiniz; panoyu yüksek kota aldırın.");
  }
  homeActions.push("<strong>Sigorta ve Evrak Güvenliği:</strong> Konut/iş yeri sigortanızda <em>Sel ve Su Baskını</em> klozunun aktif olduğunu kontrol edin; tapu ve önemli belgeleri alt çekmecelerde bırakmayın.");

  const emergencyActions = [];
  if (ans.streamDist === "risky" || ans.streamDist === "medium") {
    emergencyActions.push("<strong>Dere Kenarından Uzaklaşın:</strong> MGM <em>Turuncu/Kırmızı</em> yağış uyarısı verdiğinde dere kenarındaki yolları kullanmayın, su seviyesi birkaç dakikada yükselebilir.");
  }
  if (ans.slopeCoast === "risky") {
    emergencyActions.push("<strong>Yamaç / Kıyı Tehlikesi:</strong> Dik yamaç altındaysanız toprak kayması (heyelan) seslerine ve bulanık çamurlu su akışına karşı hemen üst katlara veya güvenli alana geçin.");
  }
  emergencyActions.push("<strong>Araç ve Alt Geçit Kuralı:</strong> Yağış başlamadan aracınızı bodrum otoparktan veya dere boyundan yüksek bir caddeye çekin. Su birikmiş alt geçitlere araçla asla girmeyin.");
  emergencyActions.push("<strong>Acil Durum:</strong> Su binaya giriyorsa önce elektrik şalterini ve doğalgaz vanasını kapatın, asansörü kullanmayın ve <strong>112 Acil Çağrı Merkezi</strong>'ni arayın.");

  const civicActions = [
    `<strong>Yağmur Suyu Izgara Temizliği:</strong> ${prov.name} Belediyesi / Su ve Kanalizasyon İdaresinden sonbahar ve ilkbahar yağışları öncesi sokağınızdaki rögarların temizlenmesini talep edin.`,
    `<strong>DSİ Dere Islahı ve Rüsubat Temizliği:</strong> ${prov.basin} Havzası'ndaki dere yataklarında biriken çamur, taş ve çöplerin temizlenmesi için DSİ Bölge Müdürlüğüne başvurabilirsiniz.`,
    `<strong>AFAD İl Risk Planı (İRAP):</strong> ${prov.name} AFAD İl Müdürlüğünün hazırladığı İl Afet Risk Azaltma Planı'nda mahallenizin taşkın haritasını sorgulayın.`
  ];

  // Aynı bölgedeki komşu illerle hızlı kıyaslama
  const regionPeers = TURKIYE_PROVINCES
    .filter((p) => p.region === prov.region)
    .sort((a, b) => b.hlrScore - a.hlrScore)
    .slice(0, 5);

  container.innerHTML = `
    <div class="report-karne-header">
      <div>
        <span class="badge-stage">${prov.region} Bölgesi • ${prov.basin} Su Havzası</span>
        <div class="report-karne-title">${prov.plate} ${prov.name} — Kişisel Sel ve Su Baskını Karnesi</div>
      </div>
      <div class="karne-grade-badge" style="background:${gradeBg};color:${gradeColor};border:1px solid ${gradeColor}">
        ${gradeLabel}
      </div>
    </div>

    <div class="karne-meters-grid">
      <div class="karne-meter-box">
        <div class="m-label">1. ${prov.name} İlinin Genel Sel Tehlikesi</div>
        <div class="m-score" style="color:${getRiskColor(prov.hlrScore)}">%${provBasePct} <small style="font-size:12px;color:#94a3b8">(81 İlde ${provRank}. Sıra)</small></div>
        <div class="thermo-bar">
          <div class="thermo-fill" style="width:${provBasePct}%;background:${getRiskColor(prov.hlrScore)}"></div>
        </div>
        <small style="color:#cbd5e1;font-size:11.5px">Türkiye Ortalaması: <strong>%${trAvgPct}</strong> • Resmi Sınıf: <strong>${prov.hlrrRating}</strong></small>
      </div>

      <div class="karne-meter-box">
        <div class="m-label">2. Sizin Evinizin / Sokağınızın Kişisel Riski</div>
        <div class="m-score" style="color:${gradeColor}">%${personalPct} <small style="font-size:12px;color:#94a3b8">(5 Cevabınız Dahil)</small></div>
        <div class="thermo-bar">
          <div class="thermo-fill" style="width:${personalPct}%;background:${gradeColor}"></div>
        </div>
        <small style="color:#cbd5e1;font-size:11.5px">Yapay Zekâ (LR) Tahmini: <strong>%${Math.round(customPred.probLR * 100)}</strong> • Kat ve Dere Etkisi: <strong>${localModifier >= 0 ? "+" + localModifier : localModifier} Puan</strong></small>
      </div>
    </div>

    <div class="karne-verdict-box">
      💬 <strong>Sizin İçin Sonuç Özeti:</strong> ${verdictText}
    </div>

    <h4>🔍 ${prov.name} İlinde Sel Riskini Artıran En Önemli 4 Sebep (Sade Anlatım)</h4>
    <div class="citizen-reasons-list">
      ${top4Predictors
        .map((r, i) => {
          const score10 = Math.round((r.val / 18) * 100) / 10;
          return `
            <div class="reason-item">
              <div class="reason-top">
                <span>${i + 1}. ${r.plain.title}</span>
                <span class="mono" style="color:${score10 >= 6.5 ? "#f97316" : "#38bdf8"}">${score10.toFixed(1)} / 10</span>
              </div>
              <p class="reason-desc">${r.plain.desc}</p>
            </div>
          `;
        })
        .join("")}
    </div>

    <h4>🛠️ Bu Sonuca Göre Sizin İçin 3 Adımlı Önlem ve Eylem Rehberi</h4>
    <div class="citizen-actions-grid">
      <div class="action-col">
        <h5>🏠 1. Evinizde ve Binanızda</h5>
        <ul>
          ${homeActions.map((a) => `<li>${a}</li>`).join("")}
        </ul>
      </div>
      <div class="action-col">
        <h5>⛈️ 2. Yağış Uyarısı Geldiğinde</h5>
        <ul>
          ${emergencyActions.map((a) => `<li>${a}</li>`).join("")}
        </ul>
      </div>
      <div class="action-col">
        <h5>🏛️ 3. Resmi Kurumlardan Talep</h5>
        <ul>
          ${civicActions.map((a) => `<li>${a}</li>`).join("")}
        </ul>
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding-top:10px;border-top:1px solid rgba(148,163,184,0.16)">
      <div style="font-size:12px;color:#94a3b8">
        <strong>${prov.region} Bölgesi Karşılaştırması:</strong>
        ${regionPeers
          .map(
            (p) =>
              `<span style="margin-left:6px;color:${p.code === prov.code ? "#38bdf8" : "#cbd5e1"};font-weight:${p.code === prov.code ? "700" : "400"}">${p.name}: %${Math.round(p.hlrScore * 100)}</span>`
          )
          .join(" • ")}
      </div>
      <button type="button" id="btn-citizen-to-sim" class="btn btn-primary">
        Bu Cevapları 20 Göstergeli Mühendislik Simülatörüne Aktar →
      </button>
    </div>
  `;

  document.getElementById("btn-citizen-to-sim")?.addEventListener("click", () => {
    state.simTitle = `${prov.name} (${prov.plate}) — Kişisel Mahalle/Bina Profili`;
    state.simScores = computeCitizenAdjustedScores(prov);
    syncSlidersToState();
    updateSimulatorResults();
    document.querySelector('[data-tab="tab-simulator"]')?.click();
  });
}

function initCitizenDashboard() {
  const selectEl = document.getElementById("select-citizen-province");
  if (selectEl) {
    selectEl.innerHTML = TURKIYE_PROVINCES.map(
      (p) =>
        `<option value="${p.code}" ${p.code === state.selectedProvinceCode ? "selected" : ""}>${p.plate} — ${p.name} (${p.region} • Genel Risk: %${Math.round(p.hlrScore * 100)})</option>`
    ).join("");

    selectEl.addEventListener("change", (e) => {
      selectProvince(Number(e.target.value));
    });
  }

  // Hızlı il çipleri
  document.querySelectorAll(".chip-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = Number(btn.getAttribute("data-prov"));
      selectProvince(code);
    });
  });

  // 5 Basit Soru seçim butonları
  document.querySelectorAll(".citizen-choice-grid").forEach((grid) => {
    const qKey = grid.getAttribute("data-question");
    grid.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-val");
        state.citizenAnswers[qKey] = val;
        grid.querySelectorAll(".choice-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderCitizenDashboard();
      });
    });
  });

  // Standart daireye sıfırlama
  document.getElementById("btn-citizen-reset")?.addEventListener("click", () => {
    state.citizenAnswers = {
      streamDist: "medium",
      floorLevel: "safe",
      streetDrain: "medium",
      greenCover: "medium",
      slopeCoast: "safe"
    };
    document.querySelectorAll(".citizen-choice-grid").forEach((grid) => {
      const qKey = grid.getAttribute("data-question");
      const targetVal = state.citizenAnswers[qKey];
      grid.querySelectorAll(".choice-btn").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-val") === targetVal);
      });
    });
    renderCitizenDashboard();
  });

  // Alt bölümdeki diğer sekmelere hızlı geçiş butonları
  document.querySelectorAll(".citizen-jump-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-target-tab");
      document.querySelector(`[data-tab="${targetTab}"]`)?.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  renderCitizenDashboard();
}

// BAŞLATMA VE OLAY DİNLEYİCİLERİ
function initApp() {
  // Maruziyet-Büyüklük Karıştırıcı Tanısı hesapla ve göster
  const diag = runExposureConfoundDiagnostic();
  document.getElementById("stat-r-pop-raw").textContent = diag.rPopRawCont.toFixed(2);
  document.getElementById("stat-r-pop-hlr").textContent = diag.rPopHlrBin.toFixed(2);
  document.getElementById("stat-r-collinear").textContent = diag.rPopBldgDensity.toFixed(2);

  // Sekme geçişleri
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");
  const sciKpiStrip = document.getElementById("scientific-kpi-strip");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      tabBtns.forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      tabPanels.forEach((panel) => {
        const isMatch = panel.id === targetId;
        panel.classList.toggle("active", isMatch);
        panel.hidden = !isMatch;
      });
      // Bilimsel KPI şeridi yalnızca 4 teknik sekmede gösterilir, Vatandaş Ana Sayfasında kafa karıştırmaz
      if (sciKpiStrip) {
        sciKpiStrip.hidden = targetId === "tab-citizen-home";
      }
    });
  });

  // Harita kontrolleri
  document.getElementById("select-map-mode")?.addEventListener("change", (e) => {
    state.mapMode = e.target.value;
    renderTurkiyeMap();
  });

  document.getElementById("select-region-filter")?.addEventListener("change", (e) => {
    state.regionFilter = e.target.value;
    renderTurkiyeMap();
  });

  document.getElementById("input-province-search")?.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    renderProvinceTable();
  });

  // Seçili ili simülatöre aktar
  document.getElementById("btn-load-province-to-sim")?.addEventListener("click", () => {
    const prov = TURKIYE_PROVINCES.find((p) => p.code === state.selectedProvinceCode);
    if (!prov) return;
    state.simTitle = `${prov.name} (${prov.plate}) — ${prov.region} / ${prov.basin} Havzası`;
    state.simScores = { ...prov.ordinalScores };
    syncSlidersToState();
    updateSimulatorResults();
    document.querySelector('[data-tab="tab-simulator"]')?.click();
  });

  // Simülatör sıfırlama, eşik ve Platt ölçekleme
  document.getElementById("btn-reset-sliders")?.addEventListener("click", () => {
    state.simTitle = "Ulusal Ortalama Referans Havza (Tüm Göstergeler = 5)";
    STAGE1_PREDICTORS.forEach((p) => {
      state.simScores[p.id] = 5;
    });
    syncSlidersToState();
    updateSimulatorResults();
  });

  document.getElementById("input-threshold")?.addEventListener("input", (e) => {
    state.threshold = Number(e.target.value);
    document.getElementById("label-threshold-val").textContent = state.threshold.toFixed(2);
    updateSimulatorResults();
    renderTurkiyeMap();
    renderCitizenDashboard();
  });

  document.getElementById("check-platt-scaling")?.addEventListener("change", (e) => {
    state.applyPlatt = e.target.checked;
    updateSimulatorResults();
    renderCitizenDashboard();
  });

  // Mekânsal CV Kontrolleri
  document.getElementById("select-spatial-scale")?.addEventListener("change", (e) => {
    state.spatialScale = e.target.value;
    renderSpatialExperiment();
  });

  document.getElementById("select-spatial-target")?.addEventListener("change", (e) => {
    state.spatialTarget = e.target.value;
    renderSpatialExperiment();
  });

  document.getElementById("btn-run-spatial-cv")?.addEventListener("click", () => {
    renderSpatialExperiment();
  });

  // CSV ve Rapor Kontrolleri
  document.getElementById("btn-download-sample-csv")?.addEventListener("click", downloadSampleCSV);
  document.getElementById("btn-run-sample-batch")?.addEventListener("click", () => {
    runBatchClassification(
      TURKIYE_PROVINCES.map((p) => ({
        name: `${p.plate} - ${p.name}`,
        region: p.region,
        scores: p.ordinalScores
      }))
    );
  });

  document.getElementById("input-csv-file")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => parseUploadedCSV(String(ev.target?.result || ""));
    reader.readAsText(file);
  });

  // Native Dialog Modal
  const dialog = document.getElementById("dialog-paper-summary");
  document.getElementById("btn-open-paper-modal")?.addEventListener("click", () => {
    dialog?.showModal();
  });

  // Analiz Raporu İndir (JSON)
  document.getElementById("btn-export-report")?.addEventListener("click", () => {
    const prov = TURKIYE_PROVINCES.find((p) => p.code === state.selectedProvinceCode);
    const simResult = predictStage1AllModels(state.simScores, state.threshold, state.applyPlatt);
    const spatialResult = runTurkiyeSpatialExperiment(state.spatialScale, state.spatialTarget);
    const report = {
      generatedAt: new Date().toISOString(),
      referencePaper: PAPER_METADATA,
      selectedProvince: prov,
      citizenAnswers: state.citizenAnswers,
      activeSimulation: simResult,
      exposureConfoundDiagnostic: diag,
      turkiyeSpatialValidation: spatialResult
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TR-TaskinRisk-ML-Rapor-${prov?.name || "Havza"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // İlk çizimleri çalıştır
  initCitizenDashboard();
  initSimulatorControls();
  renderTurkiyeMap();
  updateSimulatorResults();
  renderSpatialExperiment();
  runBatchClassification(
    TURKIYE_PROVINCES.slice(0, 12).map((p) => ({
      name: `${p.plate} - ${p.name}`,
      region: p.region,
      scores: p.ordinalScores
    }))
  );
}

document.addEventListener("DOMContentLoaded", initApp);
