const map = L.map('map', { zoomControl: false }).setView([43.35, 6.2], 9);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(map);

const layer = L.layerGroup().addTo(map);
const communesLayer = L.layerGroup();
const epciLayer = L.layerGroup();

//const sel = document.getElementById("filter");
let selectedCategories = ["TOTAL"];
let selectedDACs = ["TOTAL"];
let selectedCPTS = ["TOTAL"];
const info = document.getElementById("info");
const modeSel = document.getElementById("mode");

// ✅ nouveaux selects temps
const yearSel = document.getElementById("year");
const periodTypeSel = document.getElementById("periodType");
const periodValueSel = document.getElementById("periodValue");
const parcoursSel = document.getElementById("parcours");
const dacSel = document.getElementById("dacSelect");
const dacContainer = document.getElementById("dac-filter-container");
const cptsContainer = document.getElementById("cpts-filter-container")

const csvFile = document.getElementById("csvFile");
const applyCsv = document.getElementById("applyCsv");
const csvStatus = document.getElementById("csvStatus");

const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_apoBZZyaQ7hVW2pT6xJlfkHWEr2rlHoeRGZsjty9wftpXYQCt-GXdeYd18gVVsdKh2FZtvnkZbgx/pub?gid=1819733423&single=true&output=csv";

let DATA = null;      // {categories, rows}
let EPCI_GEO = null;
let ROWS_WITH_EPCI = null;
let COMMUNES_GEO = null;
let DAC_MAP = null;
let communesGeoLayer = null;
let CPTS_MAP = null;
let CPTS_BY_DEP = null;
let allUniqueCPTS = [];

const COL_TS = "Horodateur";
const COL_COMMUNE = "Commune du domicile"; // Le nouveau CSV utilise la commune sans espace final grâce au trim()
const COL_DATE = "Date de survenue de la rupture (indiquez la date de l'évènement ou le 1er du mois concerné)";
const COL_ORIG = "Selon vous, qu'est ce qui est à l'origine de la situation ?";
const COL_DETAIL = "Détail de la difficulté";
const COL_PARCOURS = "Parcours"

// -------------------------
// Helpers UI
// -------------------------
function setOptions(selectEl, options, { placeholder = null } = {}) {
  selectEl.innerHTML = "";
  if (placeholder) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = placeholder;
    selectEl.appendChild(o);
  }
  options.forEach(({ value, label }) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    selectEl.appendChild(o);
  });
}

// function setCategoryOptions(categories){
//   sel.innerHTML = "";
//   categories.forEach(c => {
//     const o = document.createElement("option");
//     o.value = c;
//     o.textContent = (c === "TOTAL") ? "Total (toutes difficultés)" : c;
//     sel.appendChild(o);
//   });
// }

function setCategoryOptions(categories) {
  const container = document.getElementById("custom-options-container");
  if (!container) return;

  container.innerHTML = "";

  categories.forEach(c => {
    const optionDiv = document.createElement("div");
    optionDiv.className = "custom-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = c;
    checkbox.id = `chk-${c.replace(/[^a-zA-Z0-9]/g, "-")}`;
    checkbox.checked = selectedCategories.includes(c);

    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.textContent = (c === "TOTAL") ? "Total (toutes difficultés)" : c;

    optionDiv.appendChild(checkbox);
    optionDiv.appendChild(label);
    container.appendChild(optionDiv);

    // Événement quand on clique sur une difficulté
    checkbox.addEventListener("change", () => {
      handleCategorySelectionChange(c, checkbox.checked, categories);
    });
  });

  updateSelectTriggerText();
}

function handleCategorySelectionChange(category, isChecked, allCategories) {
  if (category === "TOTAL") {
    if (isChecked) {
      selectedCategories = ["TOTAL"];
    } else {
      selectedCategories = ["TOTAL"];
    }
  } else {
    if (isChecked) {
      selectedCategories = selectedCategories.filter(c => c !== "TOTAL");
      selectedCategories.push(category);
    } else {
      selectedCategories = selectedCategories.filter(c => c !== category);
      if (selectedCategories.length === 0) {
        selectedCategories = ["TOTAL"];
      }
    }
  }

  // Synchroniser l'état coché de toutes les cases graphiquement
  const checkboxes = document.querySelectorAll("#custom-options-container input[type='checkbox']");
  checkboxes.forEach(chk => {
    chk.checked = selectedCategories.includes(chk.value);
  });

  updateSelectTriggerText();
  render(); // Mettre à jour la carte immédiatement !
}

function updateSelectTriggerText() {
  const triggerSpan = document.querySelector("#select-trigger span");
  if (!triggerSpan) return;

  if (selectedCategories.includes("TOTAL")) {
    triggerSpan.textContent = "Total (toutes difficultés)";
  } else {
    if (selectedCategories.length === 1) {
      triggerSpan.textContent = "1 difficulté sélectionnée";
    } else {
      triggerSpan.textContent = `${selectedCategories.length} difficultés sélectionnées`;
    }
  }
}

function closeAllDropdowns() {
  document.getElementById("custom-options-container")?.classList.remove("show");
  document.getElementById("dac-custom-options-container")?.classList.remove("show");
  document.getElementById("cpts-custom-options-container")?.classList.remove("show");
}

// Ouvrir/fermer le menu au clic sur le déclencheur
document.getElementById("select-trigger")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const options = document.getElementById("custom-options-container");
  const willShow = !options?.classList.contains("show");
  closeAllDropdowns();
  if (willShow) {
    options?.classList.add("show");
  }
});

// Fermer le menu si on clique en dehors
document.addEventListener("click", () => {
  closeAllDropdowns();
});

// Empêcher la fermeture si on clique à l'intérieur du menu d'options
document.getElementById("custom-options-container")?.addEventListener("click", (e) => {
  e.stopPropagation();
});

function setDacOptions(dacList) {
  const container = document.getElementById("dac-custom-options-container");
  if (!container) return;

  container.innerHTML = "";

  const allOptions = ["TOTAL", ...dacList];

  allOptions.forEach(d => {
    const optionDiv = document.createElement("div");
    optionDiv.className = "custom-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = d;
    checkbox.id = `chk-dac-${d.replace(/[^a-zA-Z0-9]/g, "-")}`;
    checkbox.checked = selectedDACs.includes(d);

    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.textContent = (d === "TOTAL") ? "Tous les DAC (vue globale)" : d;

    optionDiv.appendChild(checkbox);
    optionDiv.appendChild(label);
    container.appendChild(optionDiv);

    checkbox.addEventListener("change", () => {
      handleDacSelectionChange(d, checkbox.checked, dacList);
    });
  });

  updateDacSelectTriggerText();
}

function handleDacSelectionChange(dac, isChecked, allDacs) {
  if (dac === "TOTAL") {
    selectedDACs = ["TOTAL"];
  } else {
    if (isChecked) {
      selectedDACs = selectedDACs.filter(d => d !== "TOTAL");
      selectedDACs.push(dac);
    } else {
      selectedDACs = selectedDACs.filter(d => d !== dac);
      if (selectedDACs.length === 0) {
        selectedDACs = ["TOTAL"];
      }
    }
  }

  const checkboxes = document.querySelectorAll("#dac-custom-options-container input[type='checkbox']");
  checkboxes.forEach(chk => {
    chk.checked = selectedDACs.includes(chk.value);
  });

  updateDacSelectTriggerText();
  render();
}

function updateDacSelectTriggerText() {
  const triggerSpan = document.querySelector("#dac-select-trigger span");
  if (!triggerSpan) return;

  if (selectedDACs.includes("TOTAL")) {
    triggerSpan.textContent = "Tous les DAC (vue globale)";
  } else {
    if (selectedDACs.length === 1) {
      triggerSpan.textContent = selectedDACs[0];
    } else {
      triggerSpan.textContent = `${selectedDACs.length} DAC sélectionnés`;
    }
  }
}

// Gestion des clics pour ouvrir/fermer le menu déroulant DAC
document.getElementById("dac-select-trigger")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const options = document.getElementById("dac-custom-options-container");
  const willShow = !options?.classList.contains("show");
  closeAllDropdowns();
  if (willShow) {
    options?.classList.add("show");
  }
});

document.getElementById("dac-custom-options-container")?.addEventListener("click", (e) => {
  e.stopPropagation();
});

// Gestion de l'affichage du menu déroulant CPTS
document.getElementById("cpts-select-trigger")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const options = document.getElementById("cpts-custom-options-container");
  const willShow = !options?.classList.contains("show");
  closeAllDropdowns();
  if (willShow) {
    options?.classList.add("show");
  }
});

document.getElementById("cpts-custom-options-container")?.addEventListener("click", (e) => {
  e.stopPropagation();
});


// -------------------------
// Parsing date
// -------------------------
// On essaye d'être robuste si tu as des formats type:
// - "2026-01-14" (ISO)
// - "14/01/2026"
// - "14/01/2026 10:32:11"
// - "2026-01-14T10:32:11.000Z"
function parseToDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  // 1. Tester le format français dd/mm/yyyy (avec ou sans heure) EN PREMIER
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10) - 1; // En JS, les mois vont de 0 à 11
    const yy = parseInt(m[3], 10);
    const hh = m[4] ? parseInt(m[4], 10) : 0;
    const mi = m[5] ? parseInt(m[5], 10) : 0;
    const ss = m[6] ? parseInt(m[6], 10) : 0;
    const d = new Date(yy, mm, dd, hh, mi, ss);
    return isNaN(d.getTime()) ? null : d;
  }
  // 2. Fallback sur le format ISO direct (si la date vient d'une autre source)
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  return null;
}

function yearOfRow(r) {
  const d = parseToDate(r.date);
  return d ? d.getFullYear() : null;
}

function monthOfRow(r) {
  const d = parseToDate(r.date);
  return d ? (d.getMonth() + 1) : null; // 1..12
}

function quarterFromMonth(m) { // m 1..12
  return Math.floor((m - 1) / 3) + 1; // 1..4
}

function semesterFromMonth(m) {
  return (m <= 6) ? 1 : 2;
}

// -------------------------
// Time filter logic
// -------------------------
function buildTimeUI(rows) {
  // Années dispo
  const years = Array.from(new Set(rows.map(yearOfRow).filter(Boolean))).sort((a, b) => a - b);

  // Année: "ALL" + liste
  setOptions(yearSel, [
    { value: "ALL", label: "Toutes années" },
    ...years.map(y => ({ value: String(y), label: String(y) }))
  ]);

  yearSel.value = "ALL";

  // Période type : par défaut tout
  setOptions(periodTypeSel, [
    { value: "ALL", label: "Toute l’année" },
    { value: "SEMESTER", label: "Semestre" },
    { value: "QUARTER", label: "Trimestre" },
    { value: "MONTH", label: "Mois" }
  ]);
  periodTypeSel.value = "ALL";

  // Période value vide au départ
  setOptions(periodValueSel, [{ value: "ALL", label: "—" }]);
  periodValueSel.value = "ALL";

  syncPeriodUIState();
}

function syncPeriodUIState() {
  const y = yearSel.value;

  if (y === "ALL") {
    periodTypeSel.disabled = true;
    periodValueSel.disabled = true;
    periodTypeSel.value = "ALL";
    setOptions(periodValueSel, [{ value: "ALL", label: "—" }]);
    periodValueSel.value = "ALL";
    return;
  }

  periodTypeSel.disabled = false;

  // si "ALL" => pas de choix de période
  if (periodTypeSel.value === "ALL") {
    periodValueSel.disabled = true;
    setOptions(periodValueSel, [{ value: "ALL", label: "—" }]);
    periodValueSel.value = "ALL";
    return;
  }

  periodValueSel.disabled = false;

  if (periodTypeSel.value === "SEMESTER") {
    setOptions(periodValueSel, [
      { value: "1", label: "Semestre 1 (Jan–Juin)" },
      { value: "2", label: "Semestre 2 (Juil–Déc)" }
    ]);
    periodValueSel.value = "1";
  }

  if (periodTypeSel.value === "QUARTER") {
    setOptions(periodValueSel, [
      { value: "1", label: "Trimestre 1 (Jan–Mar)" },
      { value: "2", label: "Trimestre 2 (Avr–Juin)" },
      { value: "3", label: "Trimestre 3 (Juil–Sep)" },
      { value: "4", label: "Trimestre 4 (Oct–Déc)" }
    ]);
    periodValueSel.value = "1";
  }

  if (periodTypeSel.value === "MONTH") {
    setOptions(periodValueSel, [
      { value: "1", label: "Janvier" },
      { value: "2", label: "Février" },
      { value: "3", label: "Mars" },
      { value: "4", label: "Avril" },
      { value: "5", label: "Mai" },
      { value: "6", label: "Juin" },
      { value: "7", label: "Juillet" },
      { value: "8", label: "Août" },
      { value: "9", label: "Septembre" },
      { value: "10", label: "Octobre" },
      { value: "11", label: "Novembre" },
      { value: "12", label: "Décembre" }
    ]);
    periodValueSel.value = "1";
  }
}

function filterRowsByTime(rows) {
  const y = yearSel.value;

  // toutes années => pas de filtrage temps
  if (y === "ALL") return rows;

  const year = parseInt(y, 10);
  let out = rows.filter(r => yearOfRow(r) === year);

  const type = periodTypeSel.value;
  if (type === "ALL") return out;

  const pv = parseInt(periodValueSel.value, 10);

  if (type === "SEMESTER") {
    out = out.filter(r => {
      const m = monthOfRow(r);
      return m && semesterFromMonth(m) === pv;
    });
  }

  if (type === "QUARTER") {
    out = out.filter(r => {
      const m = monthOfRow(r);
      return m && quarterFromMonth(m) === pv;
    });
  }

  if (type === "MONTH") {
    out = out.filter(r => monthOfRow(r) === pv);
  }

  return out;
}

function filterRowsByParcours(rows) {
  if (!parcoursSel) return rows;
  const selected = parcoursSel.value;

  if (!selected || selected === "ALL") return rows;

  return rows.filter(r => {
    if (Array.isArray(r.parcours)) {
      return r.parcours.includes(selected);
    }
    return r.parcours === selected;
  });
}

function filterRowsByDAC(rows) {
  if (modeSel.value !== "dac") return rows;
  if (selectedDACs.includes("TOTAL") || selectedDACs.length === 0 || !DAC_MAP) return rows;
  return rows.filter(r => {
    const dacName = DAC_MAP[r.label] || DAC_MAP[normalizeName(r.label)] || DAC_MAP[r.cp];
    return selectedDACs.includes(dacName);
  });
}

function handleDACZoom() {
  if (modeSel.value !== "dac" || !dacSel) {
    map.setMinZoom(0);
    return;
  }
  const selectedDAC = dacSel.value;
  if (selectedDAC === "ALL" || !selectedDAC) {
    map.setMinZoom(0);
    map.setView([43.35, 6.2], 9);
    return;
  }

  if (COMMUNES_GEO && DAC_MAP) {
    const features = COMMUNES_GEO.features.filter(f => {
      const cp = f.properties?.DCOE_C_COD || f.properties?.code_insee || "";
      const name = f.properties?.DCOE_L_LIB || f.properties?.nom || "";
      return (DAC_MAP[cp] || DAC_MAP[name] || DAC_MAP[normalizeName(name)]) === selectedDAC;
    });

    if (features.length > 0) {
      const tempLayer = L.geoJSON({ type: "FeatureCollection", features });
      const bounds = tempLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
        // Verrouille le dézoom minimum sur l'emprise du DAC sélectionné
        const zoomLevel = map.getBoundsZoom(bounds, false, [40, 40]);
        map.setMinZoom(Math.max(1, Math.min(zoomLevel - 1, 9)));
      }
    }
  }
}

// ----------------------------
//  Logique de filtrage d'options CPTS
// ----------------------------
function filterRowsByCPTS(rows){
  if (modeSel.value !== "cpts") return rows;
  if (selectedCPTS.includes("TOTAL") || selectedCPTS.length === 0 || !CPTS_MAP) return rows;
  return rows.filter(r => {
    const cptsName = CPTS_MAP[r.label] || CPTS_MAP[normalizeName(r.label)] || CPTS_MAP[r.cp];
    return selectedCPTS.includes(cptsName);
  });
}
function setCptsOptions(cptsByDpt) {
  const container = document.getElementById("cpts-custom-options-container");
  if (!container) return;
  container.innerHTML = "";
  // 1. Ajouter l'option globale TOTAL
  const totalDiv = document.createElement("div");
  totalDiv.className = "custom-option";
  const totalCheckbox = document.createElement("input");
  totalCheckbox.type = "checkbox";
  totalCheckbox.value = "TOTAL";
  totalCheckbox.id = "chk-cpts-TOTAL";
  totalCheckbox.checked = selectedCPTS.includes("TOTAL");
  const totalLabel = document.createElement("label");
  totalLabel.htmlFor = totalCheckbox.id;
  totalLabel.textContent = "Toutes les CPTS (vue globale)";
  totalDiv.appendChild(totalCheckbox);
  totalDiv.appendChild(totalLabel);
  container.appendChild(totalDiv);
  totalCheckbox.addEventListener("change", () => {
    handleCptsSelectionChange("TOTAL", totalCheckbox.checked, cptsByDpt);
  });
  // Correspondance des numéros et noms des départements de PACA
  const dptLabels = {
    "04": "04 - Alpes-de-Haute-Provence",
    "05": "05 - Hautes-Alpes",
    "06": "06 - Alpes-Maritimes",
    "13": "13 - Bouches-du-Rhône",
    "83": "83 - Var",
    "84": "84 - Vaucluse"
  };
  // 2. Parcourir les départements triés et ajouter leurs CPTS
  Object.keys(cptsByDpt).sort().forEach(dpt => {
    const list = cptsByDpt[dpt];
    if (list.length === 0) return;
    // Ajouter un séparateur/en-tête de département
    const dptHeader = document.createElement("div");
    dptHeader.className = "dpt-header";
    dptHeader.textContent = dptLabels[dpt] || `Département ${dpt}`;
    container.appendChild(dptHeader);
    // Ajouter chaque CPTS de ce département
    list.forEach(cpts => {
      const optionDiv = document.createElement("div");
      optionDiv.className = "custom-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = cpts;
      // ID unique combinant le département et le CPTS pour éviter des doublons d'IDs HTML
      const checkboxId = `chk-cpts-${dpt}-${cpts.replace(/[^a-zA-Z0-9]/g, "-")}`;
      checkbox.id = checkboxId;
      checkbox.checked = selectedCPTS.includes(cpts);
      const label = document.createElement("label");
      label.htmlFor = checkboxId;
      label.textContent = cpts;
      optionDiv.appendChild(checkbox);
      optionDiv.appendChild(label);
      container.appendChild(optionDiv);
      checkbox.addEventListener("change", () => {
        handleCptsSelectionChange(cpts, checkbox.checked, cptsByDpt);
      });
    });
  });
  updateCptsSelectTriggerText();
}
function handleCptsSelectionChange(cpts, isChecked, cptsByDpt) {
  if (cpts === "TOTAL") {
    selectedCPTS = ["TOTAL"];
  } else {
    if (isChecked) {
      selectedCPTS = selectedCPTS.filter(c => c !== "TOTAL");
      if (!selectedCPTS.includes(cpts)) {
        selectedCPTS.push(cpts);
      }
    } else {
      selectedCPTS = selectedCPTS.filter(c => c !== cpts);
      if (selectedCPTS.length === 0) {
        selectedCPTS = ["TOTAL"];
      }
    }
  }
  // Synchroniser graphiquement l'état coché de tous les doublons (puisqu'un CPTS peut être dans plusieurs dpts)
  const checkboxes = document.querySelectorAll("#cpts-custom-options-container input[type='checkbox']");
  checkboxes.forEach(chk => {
    chk.checked = selectedCPTS.includes(chk.value);
  });
  updateCptsSelectTriggerText();
  render();
}
function updateCptsSelectTriggerText() {
  const triggerSpan = document.querySelector("#cpts-select-trigger span");
  if (!triggerSpan) return;
  if (selectedCPTS.includes("TOTAL")) {
    triggerSpan.textContent = "Toutes les CPTS (vue globale)";
  } else {
    if (selectedCPTS.length === 1) {
      triggerSpan.textContent = selectedCPTS[0];
    } else {
      triggerSpan.textContent = `${selectedCPTS.length} CPTS sélectionnées`;
    }
  }
}

// -------------------------
// Aggregation (commune / EPCI)
// ------------------------
function normStr(v) {
  return String(v ?? "").trim().replace(/\s+/g, " ").normalize("NFKC");
}

function matchesCategory(row, categories) {
  const catArray = Array.isArray(categories) ? categories : [categories];
  if (!catArray || catArray.length === 0 || catArray.includes("TOTAL")) {
    return true;
  }

  const rowOrigins = Array.isArray(row.origins) ? row.origins.map(normStr) : [];

  // Renvoie vrai si au moins une des difficultés est partagée
  return catArray.some(cat => {
    const target = normStr(cat);
    return rowOrigins.some(o => o === target);
  });
}

function aggregateByCommune(rows, category) {
  const byKey = new Map();

  rows.forEach(r => {
    if (!matchesCategory(r, category)) return;

    const key = `${r.cp}__${r.label}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        cp: r.cp,
        label: r.label,
        lat: r.lat,
        lng: r.lng,
        value: 0
      });
    }
    byKey.get(key).value += 1;
  });

  return Array.from(byKey.values()).filter(x => x.value > 0);
}

function aggregateByEPCI(rowsWithEpci, category) {
  const byEPCI = new Map();

  rowsWithEpci.forEach(r => {
    if (!matchesCategory(r, category)) return;

    const key = r.epciCode;
    if (!byEPCI.has(key)) {
      byEPCI.set(key, { epciCode: key, epciName: r.epciName, total: 0 });
    }
    byEPCI.get(key).total += 1;
  });

  return Array.from(byEPCI.values()).filter(x => x.total > 0);
}

// -------------------------
// Render
// -------------------------
function bubbleIconCommune(value) {
  // Taille dynamique selon le nombre de cas
  const size = Math.min(80, 25 + (value * 3));
  const radius = size / 2;
  return L.divIcon({
    className: "",
    html: `<div class="bubble" style="width:${size}px; height:${size}px; font-size:${Math.max(12, size / 2.5)}px;">${value}</div>`,
    iconSize: [size, size],
    iconAnchor: [radius, radius]
  });
}

function bubbleIconEPCI(value) {
  // Taille dynamique EPCI
  const size = Math.min(100, 35 + (value * 3));
  const radius = size / 2;
  return L.divIcon({
    className: "",
    html: `<div class="bubble-epci" style="width:${size}px; height:${size}px; font-size:${Math.max(14, size / 3)}px;">${value}</div>`,
    iconSize: [size, size],
    iconAnchor: [radius, radius]
  });
}

function updateInfoBadge(totalRuptures, timeLabel) {
  const mode = modeSel.value;
  
  // 1. Ruptures count header
  let html = `<div style="font-size: 15px; font-weight: 700; border-bottom: 1.5px solid rgba(255,255,255,0.3); padding-bottom: 8px; margin-bottom: 10px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px;">`;
  html += `<span>📊</span> <span>${totalRuptures} rupture${totalRuptures > 1 ? 's' : ''}</span>`;
  html += `</div>`;

  // 2. Info items container
  html += `<div style="display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; font-weight: 500; text-align: left; width: 100%;">`;

  // - Mode d'affichage
  let modeText = "Par commune";
  if (mode === "epci") modeText = "Par EPCI";
  else if (mode === "dac") modeText = "Par DAC";
  else if (mode === "cpts") modeText = "Par CPTS";
  html += `<div><span style="color: rgba(255,255,255,0.7); font-weight: 600;">Affichage :</span> <span style="font-weight: 600;">${modeText}</span></div>`;

  // - Période
  html += `<div><span style="color: rgba(255,255,255,0.7); font-weight: 600;">Période :</span> <span style="font-weight: 600;">${timeLabel}</span></div>`;

  // - Parcours
  const selectedParcours = parcoursSel ? parcoursSel.value : "ALL";
  html += `<div><span style="color: rgba(255,255,255,0.7); font-weight: 600;">Parcours :</span> <span style="font-weight: 600;">${selectedParcours === "ALL" ? "Tous les parcours" : selectedParcours}</span></div>`;

  // - Difficultés
  if (selectedCategories.includes("TOTAL")) {
    html += `<div><span style="color: rgba(255,255,255,0.7); font-weight: 600;">Difficultés :</span> <span style="font-weight: 600;">Toutes</span></div>`;
  } else {
    html += `<div style="margin-top: 2px;"><span style="color: rgba(255,255,255,0.7); font-weight: 600; display: block; margin-bottom: 2px;">Difficultés (${selectedCategories.length}) :</span>`;
    html += `<ul style="margin: 0 0 0 16px; padding: 0; list-style-type: disc;">`;
    selectedCategories.forEach(cat => {
      html += `<li style="line-height: 1.4; margin-bottom: 2px; font-weight: 600;">${cat}</li>`;
    });
    html += `</ul></div>`;
  }

  // - DAC sélectionné(s) (si mode DAC)
  if (mode === "dac") {
    if (selectedDACs.includes("TOTAL")) {
      html += `<div><span style="color: rgba(255,255,255,0.7); font-weight: 600;">Filtre DAC :</span> <span style="font-weight: 600;">Tous les DAC</span></div>`;
    } else {
      html += `<div style="margin-top: 2px;"><span style="color: rgba(255,255,255,0.7); font-weight: 600; display: block; margin-bottom: 2px;">DAC sélectionné(s) (${selectedDACs.length}) :</span>`;
      html += `<ul style="margin: 0 0 0 16px; padding: 0; list-style-type: disc;">`;
      selectedDACs.forEach(dac => {
        html += `<li style="line-height: 1.4; margin-bottom: 2px; font-weight: 600;">${dac}</li>`;
      });
      html += `</ul></div>`;
    }
  }

  // - CPTS sélectionné(s) (si mode CPTS)
  if (mode === "cpts") {
    if (selectedCPTS.includes("TOTAL")) {
      html += `<div><span style="color: rgba(255,255,255,0.7); font-weight: 600;">Filtre CPTS :</span> <span style="font-weight: 600;">Toutes les CPTS</span></div>`;
    } else {
      html += `<div style="margin-top: 2px;"><span style="color: rgba(255,255,255,0.7); font-weight: 600; display: block; margin-bottom: 2px;">CPTS sélectionnée(s) (${selectedCPTS.length}) :</span>`;
      html += `<ul style="margin: 0 0 0 16px; padding: 0; list-style-type: disc;">`;
      selectedCPTS.forEach(cpts => {
        html += `<li style="line-height: 1.4; margin-bottom: 2px; font-weight: 600;">${cpts}</li>`;
      });
      html += `</ul></div>`;
    }
  }

  html += `</div>`;
  info.innerHTML = html;
}

function render() {
  layer.clearLayers();
  const mode = modeSel.value;
  // Afficher le filtre DAC uniquement en mode "dac"
  if (dacContainer) {
    dacContainer.style.display = (mode === "dac") ? "inline-flex" : "none";
  }
  if(cptsContainer){
    cptsContainer.style.display = (mode === "cpts") ? "inline-flex" : "none";
  }
  if (mode !== "dac" && mode !== "cpts") {
    map.setMinZoom(0); // Réinitialise la possibilité de dézoomer en sortant du mode DAC
  }

  // GESTION DU FOND DE CARTE DYNAMIQUE (COMMUNES VS EPCI)
  if (mode === "commune" || mode === "dac" || mode === "cpts" ||mode === "epci") {
    map.removeLayer(epciLayer);     // Masque les EPCI
    communesLayer.addTo(map);      // Affiche le fond des Communes
    updateCommunesStyle();         // Adapte la couleur (par commune ou par DAC)
  } else if (mode === "epci") {
    map.removeLayer(communesLayer); // Masque les Communes
    epciLayer.addTo(map);          // Affiche le fond des EPCI
  }
  // Texte d'affichage de la période
  const timeLabel = (() => {
    const y = yearSel.value;
    if (y === "ALL") return "Toutes années";
    if (periodTypeSel.value === "ALL") return `Année ${y}`;
    const pv = periodValueSel.options[periodValueSel.selectedIndex]?.textContent || "";
    return `${y} – ${pv}`;
  })();
  // Filtrage temporel initial
  const rowsTime = filterRowsByCPTS(filterRowsByDAC(filterRowsByParcours(filterRowsByTime(DATA.rows))));
  // Libellé textuel simplifié du filtre actif pour le badge d'info
  const filterText = selectedCategories.includes("TOTAL")
    ? "Toutes"
    : (selectedCategories.length > 2
      ? `${selectedCategories.length} diff.`
      : selectedCategories.join(", "));
  // -------------------------
  // MODE COMMUNE (CLUSTERING & SPIDERFY)
  // -------------------------
  if (mode === "commune" || mode === "dac" || mode === "cpts") {
    // A. Créer le groupe de clusters Leaflet MarkerCluster
    const markerClusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true, // Écarte les marqueurs identiques au zoom maximum
      maxClusterRadius: 40,   // Rayon d'attraction des clusters
      // Personnalisation graphique du cluster pour garder tes jolies bulles d'origine
      iconCreateFunction: function (cluster) {
        const childCount = cluster.getChildCount();
        const size = Math.min(80, 25 + (childCount * 3));
        const radius = size / 2;
        return L.divIcon({
          className: "",
          html: `<div class="bubble" style="width:${size}px; height:${size}px; font-size:${Math.max(12, size / 2.5)}px;">${childCount}</div>`,
          iconSize: [size, size],
          iconAnchor: [radius, radius]
        });
      }
    });
    // B. Filtrer les lignes selon les difficultés sélectionnées
    const matchingRows = rowsTime.filter(r => matchesCategory(r, selectedCategories));
    // C. Mettre à jour l'info-badge avec toutes les sélections bien organisées
    updateInfoBadge(matchingRows.length, timeLabel);
    // D. Créer un marqueur individuel par rupture
    matchingRows.forEach(r => {
      // Notre joli point rouge défini dans style.css
      const miniIcon = L.divIcon({
        className: "",
        html: `<div class="mini-marker-bubble" title="${r.label}"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      // Contenu stylisé et détaillé du popup
      const popupContent = `
        <div style="font-family: 'Outfit', sans-serif; min-width: 220px; max-width: 300px;">
          <b style="color: var(--blue-dark); font-size: 15px;">${r.label}</b> (CP: ${r.cp})<br>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 8px 0;">
          <b>Date de survenue :</b>${formatToFrDate(r.date)}<br>
          <b>Parcours :</b> ${r.parcours || "Non renseigné"}<br>
          <b style="color: var(--blue-dark); display: block; margin-top: 8px; font-size: 13px;">Difficultés rencontrées :</b>
          <ul style="margin: 4px 0; padding-left: 18px; color: var(--text-dark); font-size: 13px;">
            ${r.origins.map(o => `<li>${o}</li>`).join("")}
          </ul>
          <!-- Encart esthétique pour le détail (s'il existe) -->
          ${r.detail ? `
            <b style="color: var(--blue-dark); display: block; margin-top: 10px; font-size: 13px;">Précisions :</b>
            <div style="margin-top: 4px; padding: 8px 10px; background: #f8fafc; border-left: 3px solid var(--blue-light); border-radius: 4px; font-size: 12.5px; color: var(--text-muted); font-style: italic; line-height: 1.4; max-height: 100px; overflow-y: auto; box-sizing: border-box;">
              "${r.detail}"
            </div>
          ` : ""}
        </div>
      `;
      const marker = L.marker([r.lat, r.lng], { icon: miniIcon })
        .bindPopup(popupContent);

      markerClusterGroup.addLayer(marker);
    });
    // E. Ajouter l'ensemble du groupe de clusters sur la carte
    layer.addLayer(markerClusterGroup);
    return;
  }
  // -------------------------
  // MODE EPCI (AGRÉGATION PAR ZONE)
  // -------------------------
  if (mode === "epci" && (!EPCI_GEO || !ROWS_WITH_EPCI)) {
    info.textContent = "Chargement des EPCI…";
    return;
  }
  const rowsWithEpciTime = filterRowsByParcours(filterRowsByTime(ROWS_WITH_EPCI));
  const epciItems = aggregateByEPCI(rowsWithEpciTime, selectedCategories);
  // Somme totale des cas EPCI filtrés
  const totalRupturesEPCI = epciItems.reduce((sum, item) => sum + item.total, 0);
  // Mettre à jour l'info-badge avec toutes les sélections bien organisées
  updateInfoBadge(totalRupturesEPCI, timeLabel);
  epciItems.forEach(item => {
    const center = getEPCICenter(item.epciCode);
    if (!center) return;
    L.marker([center.lat, center.lng], { icon: bubbleIconEPCI(item.total) })
      .addTo(layer)
      .bindPopup(
        `<div style="font-family: 'Outfit', sans-serif;">
          <b style="font-size:15px;">${item.epciName}</b><br>
          <b>Code EPCI :</b> ${item.epciCode}<br>
          <b>Période :</b> ${timeLabel}<br>
          <b>Difficultés :</b> ${filterText}<br>
          <hr style="border:0; border-top:1px solid #eee; margin:8px 0;">
          <b style="color:var(--blue-dark); font-size:14px;">${item.total} ruptures</b>
        </div>`
      );
  });
}

// -------------------------
// EPCI geometry / center
// -------------------------
function normalizeGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") return geometry;

  if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
    return geometry.geometries.find(g => g.type === "Polygon" || g.type === "MultiPolygon") || null;
  }
  return null;
}

function getEPCICenter(epciCode) {
  const f = EPCI_GEO.features.find(ft => String(ft.properties?.EPCI_CODE) === String(epciCode));
  if (!f) return null;

  const geom = normalizeGeometry(f.geometry);
  if (!geom) return null;

  try {
    const c = turf.centroid(turf.feature(geom));
    const [lng, lat] = c.geometry.coordinates;
    return { lat, lng };
  } catch (e) {
    const lyr = L.geoJSON({ type: "Feature", geometry: geom });
    const center = lyr.getBounds().getCenter();
    return { lat: center.lat, lng: center.lng };
  }
}

function colorForEPCI(code) {
  if (!code || code === "UNKNOWN") return "#cbd5e0";
  
  // Génère un hash numérique unique et stable à partir du code de l'EPCI
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = code.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Conjugué du nombre d'or pour un espacement maximal
  const goldenRatio = 0.618033988749895;
  const hue = Math.floor(((Math.abs(hash) * goldenRatio) % 1) * 360);
  
  // Teinte pastel stable et lumineuse pour la carte des communes
  return `hsl(${hue}, 65%, 68%)`;
}

function colorForCommune(codeOrName) {
  const palette = [
    "#d1dff2", "#d9f0f7", "#fde8b8", "#f9d1ca",
    "#ebf2fb", "#c5e6f1", "#fae3ac", "#e2e8f0",
    "#d5f5e3", "#fef9e7", "#e8daef", "#d4efdf"
  ];
  const str = String(codeOrName ?? "UNKNOWN");
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return palette[h % palette.length];
}

function colorForDAC(dacName) {
  const dacColors = {
    "DAC 13 Sud": "#f6e05e",
    "DAC Cap Azur Santé": "#f6ad55",
    "DAC Centre de Soutien Santé Social (C3S)": "#68d391",
    "DAC Est Azur": "#b794f4",
    "DAC Hautes-Alpes": "#63b3ed",
    "DAC Provence Santé Coordination": "#fc8181",
    "DAC Ressources Santé Vaucluse": "#4fd1c5",
    "DAC Var Est": "#f687b3",
    "DAC Var Ouest": "#4299e1"
  };
  return dacColors[dacName] || "#cbd5e0";
}

function colorForCPTS(cptsName) {
  if (cptsName === "CPTS inconnu" || cptsName === "Non renseigné") return "#cbd5e0";
  
  // Si la liste globale est chargée, on distribue les teintes via le nombre d'or
  if (allUniqueCPTS && allUniqueCPTS.length > 0) {
    const idx = allUniqueCPTS.indexOf(cptsName);
    if (idx !== -1) {
      // Conjugué du nombre d'or (~0.618033) pour obtenir un espacement maximal des teintes
      const goldenRatio = 0.618033988749895;
      const hue = Math.floor(((idx * goldenRatio) % 1) * 360);
      
      // Légère variation déterministe de la saturation et luminosité pour diversifier les rendus
      const saturation = 70 + (idx % 3) * 5; // Rendus vifs mais pastel entre 70% et 80%
      const lightness = 55 + (idx % 2) * 6;  // Luminosités douces entre 55% et 61%
      
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
  }
  
  // Fallback de sécurité (hachage classique) si la liste n'est pas encore initialisée
  let hash = 0;
  for (let i = 0; i < cptsName.length; i++) {
    hash = cptsName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

function updateCommunesStyle() {
  if (!communesGeoLayer) return;
  const mode = modeSel.value;

  communesGeoLayer.setStyle((feature) => {
    const cp = feature.properties?.DCOE_C_COD || feature.properties?.code_insee || "";
    const name = feature.properties?.DCOE_L_LIB || feature.properties?.nom || "";
    const codeOrName = cp || name || "UNKNOWN";

    let fillColor;
    let fillOpacity = 0.45;
    let strokeColor = "#2b6cb0";
    let strokeWidth = 1;
    let dashArray = "2 2";

    if (mode === "dac" && DAC_MAP) {
      const dacName = DAC_MAP[cp] || DAC_MAP[name] || "DAC inconnu";
      const isAllSelected = selectedDACs.includes("TOTAL");
      const isThisDacSelected = selectedDACs.includes(dacName);
      if (isAllSelected) {
        fillColor = colorForDAC(dacName);
        fillOpacity = 0.65;
        strokeColor = "#2d3748";
        strokeWidth = 1.5;
        dashArray = "";
      } else if (isThisDacSelected) {
        fillColor = colorForDAC(dacName);
        fillOpacity = 0.8;
        strokeColor = "#1a202c";
        strokeWidth = 2.2;
        dashArray = "";
      } else {
        fillColor = colorForCommune(codeOrName);
        fillOpacity = 0.35;
        strokeColor = "#cbd5e0";
        strokeWidth = 0.8;
        dashArray = "2 2";
      }
    } else if (mode === "cpts" && CPTS_MAP) {
      const cptsName = CPTS_MAP[cp] || CPTS_MAP[name] || "CPTS inconnu";
      const isAllSelected = selectedCPTS.includes("TOTAL");
      const isThisCptsSelected = selectedCPTS.includes(cptsName);
      if (isAllSelected) {
        fillColor = colorForCPTS(cptsName);
        fillOpacity = 0.65;
        strokeColor = "#2d3748";
        strokeWidth = 1.5;
        dashArray = "";
      } else if (isThisCptsSelected) {
        // La CPTS cochée conserve sa propre couleur vive !
        fillColor = colorForCPTS(cptsName);
        fillOpacity = 0.8;
        strokeColor = "#1a202c";
        strokeWidth = 2.2;
        dashArray = "";
      } else {
        // Les CPTS non cochées reprennent la couleur du mode commune en transparence
        fillColor = colorForCommune(codeOrName);
        fillOpacity = 0.35;
        strokeColor = "#cbd5e0";
        strokeWidth = 0.8;
        dashArray = "2 2";
      }
    } else if (mode === "epci") {
      // Coloration par EPCI
      const epciCode = feature.properties?.EPCI_CODE || "UNKNOWN";
      fillColor = colorForEPCI(epciCode);
      fillOpacity = 0.60;
      strokeColor = "#1f3b63";
      strokeWidth = 1;
      dashArray = "";
    } else {
      fillColor = colorForCommune(codeOrName);
    }

    return {
      color: strokeColor,
      weight: strokeWidth,
      dashArray: dashArray,
      fillColor: fillColor,
      fillOpacity: fillOpacity
    };
  });
}



function attachEPCIToRows(rows, epciGeo) {
  const features = epciGeo.features;

  return rows.map(r => {
    const pt = turf.point([r.lng, r.lat]);

    let found = null;
    for (const f of features) {
      const geom = normalizeGeometry(f.geometry);
      if (!geom) continue;

      const polyFeat = turf.feature(geom, f.properties);
      if (turf.booleanPointInPolygon(pt, polyFeat)) {
        found = f.properties;
        break;
      }
    }

    return {
      ...r,
      epciCode: (found?.EPCI_CODE ?? "UNKNOWN").toString(),
      epciName: (found?.EPCI ?? "EPCI inconnu").toString()
    };
  });
}

// -------------------------
// Load Google Sheet en direct
// -------------------------
async function loadLiveGoogleSheet() {
  try {
    info.textContent = "Téléchargement des données en direct...";

    // 1. On charge d'abord le dictionnaire des communes
    const cpGeo = await loadCpGeo();

    // 2. On va chercher le CSV en direct depuis Google Sheets
    const response = await fetch(GOOGLE_SHEET_CSV_URL);
    const csvText = await response.text();

    // 3. On utilise tes fonctions existantes pour parser !
    const table = parseCSV(csvText);
    const objs = toObjects(table);

    // 4. On construit les lignes utilisables par la carte
    const built = buildRowsFromGoogleForms(objs, cpGeo);
    DATA = built;

    // 5. On met à jour l'interface (Filtres, Temps...)
    setCategoryOptions(DATA.categories);
    //sel.value = "TOTAL";
    selectedCategories = ['TOTAL'];
    buildTimeUI(DATA.rows);

    //Remplir dynamiquement la liste des parcours
    if (parcoursSel && DATA.parcoursList) {
      setOptions(parcoursSel, [
        { value: "ALL", label: "Tous les parcours" },
        ...DATA.parcoursList.map(p => ({ value: p, label: p }))
      ]);
      parcoursSel.value = "ALL";
    }

    // 6. On attache les EPCI si la couche est déjà chargée
    if (EPCI_GEO) {
      ROWS_WITH_EPCI = attachEPCIToRows(DATA.rows, EPCI_GEO);
    }

    render(); // On affiche la carte
  } catch (error) {
    console.error("Erreur lors de la récupération des données :", error);
    info.textContent = "Erreur : " + error.message;
  }
}
// La fonction loadLiveGoogleSheet() sera appelée tout à la fin du fichier !
// -------------------------
// Load geojson
// -------------------------
Promise.all([
  fetch("./communes_2026.geojson").then(r => r.json()),
  fetch("./EPCI_2025.geojson").then(r => r.json()),
  fetch("./dac_communes.json").then(r => r.json()),
  fetch("./cpts_communes.json").then(r => r.json())
]).then(([communesGeo, epciGeo, dacMap, cptsData]) => {
  COMMUNES_GEO = communesGeo;
  EPCI_GEO = epciGeo;
  DAC_MAP = dacMap;
  CPTS_MAP = cptsData.cptsMap;
  CPTS_BY_DEP = cptsData.cptsByDpt

  // Générer la liste ordonnée de toutes les CPTS uniques pour maximiser l'écart des couleurs
  const tempSet = new Set();
  Object.keys(CPTS_BY_DEP).sort().forEach(dpt => {
    CPTS_BY_DEP[dpt].forEach(cpts => tempSet.add(cpts));
  });
  allUniqueCPTS = Array.from(tempSet);
  // 1. Extraire automatiquement les codes des EPCI qui appartiennent à la région PACA (Code 93)
  const pacaEpciCodes = new Set(
    communesGeo.features
      .filter(f => f.properties?.REGION_COD === "93" || f.properties?.REGION === "Provence-Alpes-Côte d'Azur")
      .map(f => String(f.properties?.EPCI_CODE))
      .filter(Boolean)
  );
  // 2. Afficher le GeoJSON des Communes (filtré PACA)
  communesGeoLayer = L.geoJSON(communesGeo, {
    filter: (f) => f.properties?.REGION_COD === "93" || f.properties?.REGION === "Provence-Alpes-Côte d'Azur",
    style: (feature) => {
      const codeOrName = feature.properties?.DCOE_C_COD ||
        feature.properties?.DCOE_L_LIB ||
        feature.properties?.code_insee ||
        feature.properties?.nom ||
        "UNKNOWN";
      return {
        color: "#2b6cb0",
        weight: 1,
        dashArray: "2 2",
        fillColor: colorForCommune(codeOrName),
        fillOpacity: 0.45
      };
    },
    onEachFeature: (feature, layer) => {
      const name = feature.properties?.DCOE_L_LIB || feature.properties?.nom || "Commune";
      const cp = feature.properties?.DCOE_C_COD || feature.properties?.code_insee || "";
      layer.on('mouseover', () => {
        const mode = modeSel.value;
        let label = `${name} (${cp})`;
        if (mode === "dac" && DAC_MAP) {
          const dacName = DAC_MAP[cp] || "Non renseigné";
          label += ` — ${dacName}`;
        } else if (mode === "cpts" && CPTS_MAP) {
          const cptsName = CPTS_MAP[cp] || CPTS_MAP[name] || "Non renseigné";
          label += ` — ${cptsName}`;
        } else if (mode === "epci") {
          const epciName = feature.properties?.EPCI || "Non renseigné";
          label += ` — ${epciName}`;
        }
        layer.bindTooltip(label, { sticky: true });
      });
    }
  }).addTo(communesLayer);
  // 3. Afficher le GeoJSON des EPCI (filtré pour ne garder QUE les EPCI de PACA !)
  L.geoJSON(epciGeo, {
    filter: (f) => pacaEpciCodes.has(String(f.properties?.EPCI_CODE)),
    style: (feature) => {
      const code = String(feature.properties?.EPCI_CODE ?? "UNKNOWN");
      return {
        color: "#1f3b63",
        weight: 2,
        dashArray: "4 3",
        fillColor: colorForEPCI(code),
        fillOpacity: 0.55
      };
    },
    onEachFeature: (feature, layer) => {
      const name = feature.properties?.EPCI ?? "EPCI";
      const code = feature.properties?.EPCI_CODE ?? "";
      layer.bindTooltip(`${name} (${code})`, { sticky: true });
    }
  }).addTo(epciLayer);
  //Remplir menu déroulant DAC
  if (DAC_MAP) {
    const uniqueDacs = Array.from(new Set(Object.values(DAC_MAP))).sort();
    setDacOptions(uniqueDacs);
  }

  if(CPTS_BY_DEP){
    setCptsOptions(CPTS_BY_DEP);
  }

  // 4. Rattacher les EPCI aux données si elles sont chargées
  if (DATA && !ROWS_WITH_EPCI) {
    ROWS_WITH_EPCI = attachEPCIToRows(DATA.rows, EPCI_GEO);
  }
  render(); // Mise à jour finale de l'affichage de la carte
})
  .catch(err => console.error("Erreur lors du chargement des fichiers GeoJSON :", err));

// -------------------------
// Events
// -------------------------
modeSel.addEventListener("change", render);
//sel.addEventListener("change", render);

yearSel.addEventListener("change", () => {
  syncPeriodUIState();
  render();
});

periodTypeSel.addEventListener("change", () => {
  syncPeriodUIState();
  render();
});

periodValueSel.addEventListener("change", render);

if (parcoursSel) {
  parcoursSel.addEventListener("change", render);
}

if (dacSel) {
  dacSel.addEventListener("change", render);
}



//---------------------------------------
//   Load CSV
//---------------------------------------
// Gère les virgules et champs
function parseCSV(text) {
  //Gérer les virgules et espaces 
  const rows = [];
  let i = 0, field = "", row = [];
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { // escape ""
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += c;
        i++;
        continue;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ",") {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      if (c === "\r") {
        i++; // ignore
        continue;
      }
      if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      }
      field += c;
      i++;
    }
  }

  // dernier champ
  row.push(field);
  rows.push(row);

  return rows;

}

function toObjects(table) {
  const header = table[0].map(h => String(h ?? "").trim());
  const out = [];
  for (let r = 1; r < table.length; r++) {
    if (table[r].length === 1 && String(table[r][0] ?? "").trim() === "") continue;
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = table[r][c] ?? "";
    }
    out.push(obj);
  }
  return out;
}

// Parse date et split multi et extraire les CP
function extractCP(v) {
  const m = String(v ?? "").match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

function splitMulti(v) {
  if (!v) return [];
  const str = String(v);
  const result = [];
  let current = "";
  let parenDepth = 0; // Permet de savoir si on est dans des parenthèses (...)
  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === '(') {
      parenDepth++;
      current += char;
    } else if (char === ')') {
      parenDepth--;
      current += char;
    } else if ((char === ',' || char === ';' || char === '\n') && parenDepth === 0) {
      // On découpe UNIQUEMENT si on croise un séparateur hors des parenthèses !
      if (current.trim()) {
        result.push(current.trim());
      }
      current = ""; // On réinitialise pour l'élément suivant
    } else {
      current += char;
    }
  }

  // Ne pas oublier d'ajouter le dernier élément après la dernière virgule
  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

function parseToISODate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;

  // 1. Tester le format français dd/mm/yyyy EN PREMIER
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = String(m[1]).padStart(2, '0');
    const mm = String(m[2]).padStart(2, '0');
    const yy = m[3];
    return `${yy}-${mm}-${dd}`; // Renvoie directement "AAAA-MM-JJ" de manière ultra-fiable
  }

  // 2. Fallback sur le format ISO direct
  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) {
    const yy = d1.getFullYear();
    const mm = String(d1.getMonth() + 1).padStart(2, '0');
    const dd = String(d1.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }
  return null;
}

function formatToFrDate(isoDateStr) {
  if (!isoDateStr) return "";
  const parts = isoDateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDateStr;
}

function normalizeName(str) {
  let s = String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Supprime les accents
    .trim()
    .replace(/[-']/g, " ")           // Remplace les tirets et apostrophes par des espaces
    .replace(/\s+/g, " ");           // Nettoie les doubles espaces
  // 👈 LE CODE MAGIQUE DU MENTOR :
  // Remplace "st" par "saint" et "ste" par "sainte" lorsqu'ils forment des mots entiers (\b)
  s = s.replace(/\bst\b/g, "saint")
    .replace(/\bste\b/g, "sainte");
  return s;
}

function findBestGeoMatch(communeName, cpGeo) {
  const normInput = normalizeName(communeName);
  if (!normInput) return null;

  // 1. Check exact match first
  if (cpGeo[normInput]) {
    return cpGeo[normInput];
  }

  const getWords = (str) => str.split(/\s+/).filter(Boolean);
  const inputWords = getWords(normInput);
  if (inputWords.length === 0) return null;

  let bestKey = null;
  let bestScore = 0;

  for (const key of Object.keys(cpGeo)) {
    let score = 0;
    const keyWords = getWords(key);

    if (key === normInput) {
      score = 100;
    } else if (key.startsWith(normInput)) {
      // Input is a prefix of the city name (e.g., "six fours" -> "six fours les plages")
      score = 80 + (normInput.length / key.length) * 10;
    } else if (normInput.startsWith(key)) {
      // City name is a prefix of the input (e.g., "six fours les plages..." -> "six fours les plages")
      score = 80 + (key.length / normInput.length) * 10;
    } else {
      // Check word inclusion
      const matchesAllInput = inputWords.every(w => keyWords.includes(w));
      const matchesAllKey = keyWords.every(w => inputWords.includes(w));

      if (matchesAllInput) {
        // e.g. "six fours plages" -> "six fours les plages"
        score = 60 + (inputWords.length / keyWords.length) * 20;
      } else if (matchesAllKey) {
        score = 60 + (keyWords.length / inputWords.length) * 20;
      } else {
        // Partial word overlap
        const commonWords = inputWords.filter(w => keyWords.includes(w));
        if (commonWords.length > 0) {
          const significantMatches = commonWords.filter(w => !["la", "les", "sur", "des", "du", "en", "le", "aux", "d", "et", "sous"].includes(w));
          if (significantMatches.length > 0) {
            score = 30 + (commonWords.length / Math.max(inputWords.length, keyWords.length)) * 20;
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  // Threshold: only accept if score is at least 50
  if (bestScore >= 50 && bestKey) {
    return cpGeo[bestKey];
  }

  return null;
}

//Charger var_communes
let CP_GEO = null;
async function loadCpGeo() {
  if (CP_GEO) return CP_GEO;
  const res = await fetch("./var_communes.csv");
  const text = await res.text();
  const table = parseCSV(text);
  const objs = toObjects(table);

  const map = {};
  objs.forEach(o => {
    const cp = String(o.CP ?? "").trim();
    if (!cp) return;
    const lat = parseFloat(String(o.LAT).replace(",", "."));
    const lng = parseFloat(String(o.LNG).replace(",", "."));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const label = o.LABEL || cp;
      // On indexe par le nom normalisé de la commune au lieu du code postal seul
      map[normalizeName(label)] = { cp, lat, lng, label };
    }
  });
  CP_GEO = map;
  return CP_GEO;
}

//construire rows depuis le google sheet

function buildRowsFromGoogleForms(objs, cpGeo) {
  const rows = [];
  const catsSet = new Set();
  const parcoursSet = new Set();

  // On va détecter dynamiquement les clés du premier objet s'il existe pour être robuste aux variations de colonnes
  let keyCommune = COL_COMMUNE;
  let keyDate = COL_DATE;
  let keyOrig = COL_ORIG;
  let keyDetail = COL_DETAIL;
  let keyParcours = COL_PARCOURS;

  if (objs.length > 0) {
    const keys = Object.keys(objs[0]);
    
    // Fonction utilitaire pour trouver la clé correspondante par correspondance de sous-chaîne
    const findKey = (sub) => keys.find(k => k.toLowerCase().includes(sub.toLowerCase()));

    const colCommune = findKey("commune");
    const colDate = findKey("date de survenue");
    const colOrig = findKey("origine de la situation");
    const colDetail = findKey("difficult") || findKey("detail") || findKey("précision");
    const colParcours = findKey("parcours");

    if (colCommune) keyCommune = colCommune;
    if (colDate) keyDate = colDate;
    if (colOrig) keyOrig = colOrig;
    if (colDetail) keyDetail = colDetail;
    if (colParcours) keyParcours = colParcours;

    console.log("Clés détectées dynamiquement :", {
      keyCommune,
      keyDate,
      keyOrig,
      keyDetail,
      keyParcours
    });
  }

  for (const o of objs) {
    const communeName = String(o[keyCommune] ?? "").trim();
    if (!communeName) continue;

    const geo = findBestGeoMatch(communeName, cpGeo);
    if (!geo) {
      console.warn("Commune non trouvée dans le référentiel :", communeName);
      continue;
    }

    const date = parseToISODate(o[keyDate]);
    if (!date) continue;

    const origins = splitMulti(o[keyOrig]);
    origins.forEach(x => catsSet.add(x));

    const parcours = splitMulti(o[keyParcours]);
    parcours.forEach(p => parcoursSet.add(p));

    rows.push({
      ts: String(o[COL_TS] ?? o["Horodateur"] ?? "").trim(),
      date,
      cp: geo.cp,
      label: geo.label,
      lat: geo.lat,
      lng: geo.lng,
      origins,
      parcours,
      detail: String(o[keyDetail] ?? "").trim()
    });
  }

  return {
    rows,
    categories: ["TOTAL", ...Array.from(catsSet).filter(Boolean).sort()],
    parcoursList: Array.from(parcoursSet).filter(Boolean).sort()
  };
}

//Merge sans doublons

function rowKey(r) {
  // clé de dédoublonnage (adaptable)
  // horodateur est idéal s'il est toujours unique
  const origins = Array.isArray(r.origins) ? r.origins.slice().sort().join("|") : "";
  return [r.ts || "", r.date || "", r.cp || "", origins].join("::");
}

function mergeRows(existing, incoming) {
  const seen = new Set(existing.map(rowKey));
  const out = existing.slice();

  let added = 0;
  for (const r of incoming) {
    const k = rowKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    added++;
  }
  return { rows: out, added };
}

function rebuildCategoriesFromRows(rows) {
  const set = new Set();
  rows.forEach(r => (Array.isArray(r.origins) ? r.origins : []).forEach(x => set.add(x)));
  return ["TOTAL", ...Array.from(set).sort()];
}

// btn charger le csv 

if (applyCsv) {
  applyCsv.addEventListener("click", async () => {
    if (!csvFile.files || !csvFile.files[0]) {
      csvStatus.textContent = "Choisis un fichier CSV.";
      return;
    }

    csvStatus.textContent = "Lecture du CSV…";

    const cpGeo = await loadCpGeo();

    const file = csvFile.files[0];
    const text = await file.text();

    const table = parseCSV(text);
    const objs = toObjects(table);

    const built = buildRowsFromGoogleForms(objs, cpGeo);

    // DATA doit exister (sinon on initialise)
    if (!DATA) DATA = { categories: ["TOTAL"], rows: [] };

    const merged = mergeRows(DATA.rows, built.rows);
    DATA.rows = merged.rows;
    DATA.categories = rebuildCategoriesFromRows(DATA.rows);

    // reset options filtre catégories
    selectedCategories = ["TOTAL"];
    setCategoryOptions(DATA.categories);

    // si EPCI déjà chargé : on ré-attache
    if (EPCI_GEO) {
      ROWS_WITH_EPCI = attachEPCIToRows(DATA.rows, EPCI_GEO);
    }

    csvStatus.textContent = `OK: ${built.rows.length} lignes lues, +${merged.added} ajoutées (total ${DATA.rows.length}).`;
    render();
  });
}

// On lance le téléchargement au démarrage maintenant que tout est initialisé !
loadLiveGoogleSheet();

/* ==========================================================================
   LOGIQUE DE SÉCURITÉ ET DE CONNEXION
   ========================================================================== */

// 1. Fonction pour chiffrer en SHA-256 (méthode de sécurité native du navigateur)
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 2. Vérification de la session existante au chargement
function checkSession() {
  const isAuth = localStorage.getItem("orp_authenticated");
  const loginScreen = document.getElementById("login-screen");
  if (isAuth === "true" && loginScreen) {
    loginScreen.classList.add("hidden");
  }
}

// 3. Gestionnaire des événements pour l'écran de connexion
function initLogin() {
  const loginBtn = document.getElementById("login-button");
  const passwordInput = document.getElementById("password-input");
  const errorMsg = document.getElementById("login-error");
  const togglePasswordBtn = document.getElementById("toggle-password");
  const loginScreen = document.getElementById("login-screen");

  if (!loginBtn || !passwordInput || !togglePasswordBtn || !loginScreen) return;

  // Afficher / Masquer le mot de passe
  togglePasswordBtn.addEventListener("click", () => {
    const isPassword = passwordInput.getAttribute("type") === "password";
    passwordInput.setAttribute("type", isPassword ? "text" : "password");
    togglePasswordBtn.textContent = isPassword ? "🙈" : "👁️";
  });

  // Valider en appuyant sur la touche "Entrée"
  passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      loginBtn.click();
    }

  });

  // Clic sur le bouton de connexion
  loginBtn.addEventListener("click", async () => {
    const password = passwordInput.value;

    // Calcul du hash SHA-256 du texte saisi
    const inputHash = await sha256(password);

    // Hash SHA-256 correspondant au mot de passe "ORP2026"
    const correctHash = "fe04b3ec2a429362ac1ffd3c6aae75f6488af17fa7a937c508cd530e803038ec";

    if (inputHash === correctHash) {
      // Connexion réussie : on sauvegarde la session et on cache l'écran
      localStorage.setItem("orp_authenticated", "true");
      loginScreen.classList.add("hidden");
      errorMsg.textContent = "";
    } else {
      // Échec : message d'erreur
      errorMsg.textContent = "Mot de passe incorrect.";
      passwordInput.value = "";
      passwordInput.focus();
    }
  });
  // Bouton de déconnexion
  const logoutBtn = document.getElementById("logout-button");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      // 1. Supprime la sauvegarde de session
      localStorage.removeItem("orp_authenticated");

      // 2. Vibe et réaffiche l'écran de connexion
      if (loginScreen) {
        loginScreen.classList.remove("hidden");
      }
      if (passwordInput) {
        passwordInput.value = ""; // Vide le champ pour la prochaine fois
      }
    });
  }
}

// Lancement automatique au chargement
checkSession();
initLogin();

/* ==========================================================================
   LOGIQUE D'OUVERTURE / FERMETURE DE LA SIDEBAR DE FILTRES
   ========================================================================== */
function initSidebar() {
  const sidebar = document.getElementById("topbar");
  const toggleBtn = document.getElementById("sidebar-toggle");
  const closeBtn = document.getElementById("sidebar-close");

  if (!sidebar || !toggleBtn || !closeBtn) return;

  // Ouvrir la sidebar
  toggleBtn.addEventListener("click", () => {
    sidebar.classList.remove("hidden");
    toggleBtn.style.display = "none";
  });

  // Fermer la sidebar
  closeBtn.addEventListener("click", () => {
    sidebar.classList.add("hidden");
    toggleBtn.style.display = "flex";
  });
}

// Lancement de la sidebar
initSidebar();
