const map = L.map('map', { zoomControl: false }).setView([43.35, 6.2], 9);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Fond de carte Esri Light Gray (gratuit, esthétique claire et sans filigrane API key)
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 18,
  attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
}).addTo(map);

const layer = L.layerGroup().addTo(map);
const communesLayer = L.layerGroup();
const epciLayer = L.layerGroup();

let selectedCategories = ["TOTAL"];
let selectedDACs = ["TOTAL"];
let selectedCPTS = ["TOTAL"];
let selectedEPCIs = ["TOTAL"];

const info = document.getElementById("info");
const modeSel = document.getElementById("mode");

const yearSel = document.getElementById("year");
const periodTypeSel = document.getElementById("periodType");
const periodValueSel = document.getElementById("periodValue");
const parcoursSel = document.getElementById("parcours");
const dacSel = document.getElementById("dacSelect");
const dacContainer = document.getElementById("dac-filter-container");
const epciContainer = document.getElementById("epci-filter-container");
const cptsContainer = document.getElementById("cpts-filter-container");

const csvFile = document.getElementById("csvFile");
const applyCsv = document.getElementById("applyCsv");
const csvStatus = document.getElementById("csvStatus");

const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_apoBZZyaQ7hVW2pT6xJlfkHWEr2rlHoeRGZsjty9wftpXYQCt-GXdeYd18gVVsdKh2FZtvnkZbgx/pub?gid=1819733423&single=true&output=csv";

let importedFiles = []; // [{ id, dacName, fileName, importDate, rowCount, rows }]

function loadImportedFilesFromStorage() {
  try {
    const raw = localStorage.getItem("orp_imported_files");
    if (raw) {
      importedFiles = JSON.parse(raw);
      // Nettoyer et réparer automatiquement les accents sur tous les documents en mémoire
      importedFiles.forEach(doc => {
        if (doc.rows && Array.isArray(doc.rows)) {
          doc.rows = doc.rows.map(r => {
            const rawOrigins = Array.isArray(r.origins) ? r.origins : (r.origins ? [r.origins] : []);
            const cleanOrigins = rawOrigins.map(o => normalizeToStandardDifficulty(cleanAndRepairAccents(o))).filter(Boolean);
            return {
              ...r,
              label: cleanAndRepairAccents(r.label),
              detail: cleanAndRepairAccents(r.detail),
              sourceFile: cleanAndRepairAccents(r.sourceFile),
              sourceDac: cleanAndRepairAccents(r.sourceDac),
              origins: cleanOrigins.length > 0 ? cleanOrigins : [STANDARD_DIFFICULTIES[0]]
            };
          });
        }
      });
    } else {
      importedFiles = [];
    }
  } catch (e) {
    console.error("Erreur de chargement localStorage orp_imported_files:", e);
    importedFiles = [];
  }
}

function saveImportedFilesToStorage() {
  try {
    localStorage.setItem("orp_imported_files", JSON.stringify(importedFiles));
  } catch (e) {
    console.error("Erreur de sauvegarde localStorage orp_imported_files:", e);
  }
}

function getManualRows() {
  loadImportedFilesFromStorage();
  const manualRows = [];
  importedFiles.forEach(file => {
    // Tous les points importés par tous les DAC apparaissent sur la carte globale
    (file.rows || []).forEach(r => {
      manualRows.push({
        ...r,
        isManual: true,
        sourceFile: file.fileName,
        sourceDac: file.dacName
      });
    });
  });
  return manualRows;
}

let DATA = null;      // {categories, rows}
let EPCI_GEO = null;
let COMMUNES_GEO = null;
let DAC_MAP = null;
let communesGeoLayer = null;
let CPTS_MAP = null;
let CPTS_BY_DEP = null;
let EPCI_MAP = null;
let EPCI_BY_DEP = null;
let allUniqueCPTS = [];
let activeBoundsRectangle = null;

const COL_TS = "Horodateur";
const COL_COMMUNE = "Commune du domicile";
const COL_DATE = "Date de survenue de la rupture (indiquez la date de l'évènement ou le 1er du mois concerné)";
const COL_ORIG = "Selon vous, qu'est ce qui est à l'origine de la situation ?";
const COL_DETAIL = "Détail de la difficulté";
const COL_PARCOURS = "Parcours";

// -------------------------
// Dictionnaires de Couleurs Officiels
// -------------------------
const dacColors = {
  "DAC 13 Sud": "#f6e05e",
  "DAC Cap Azur Santé": "#f6ad55",
  "DAC Centre de Soutien Santé Social (C3S)": "#8ffab5",
  "DAC Est Azur": "#d9b4ff",
  "DAC Hautes-Alpes": "#66b6ff",
  "DAC Provence Santé Coordination": "#ffa2a0",
  "DAC Ressources Santé Vaucluse": "#7af8eb",
  "DAC Var Est": "#b9d8f6",
  "DAC Var Ouest": "#ffa8d5"
};

const cptsColors = {
  "CPTS Actes Santé": "#f6e05e",
  "CPTS Activ'Santé": "#66b6ff",
  "CPTS Aix Sainte Victoire": "#ffa2a0",
  "CPTS Alpes Bléone Durance": "#66b6ff",
  "CPTS Antipolis": "#ffa2a0",
  "CPTS Briançonnais-Ecrins": "#7af8eb",
  "CPTS Buëch Dévoluy": "#8ffab5",
  "CPTS Cerebellum - Pays de Sorgues et Lubéron": "#ffa8d5",
  "CPTS Champsaur-Valgaudemar": "#ffa8d5",
  "CPTS Comptat Venaissin": "#b9d8f6",
  "CPTS Coordination Santé Marseille 1-2-3": "#f6ad55",
  "CPTS Cœur du Var": "#f6ad55",
  "CPTS Dracénie Provence Verdon": "#b9d8f6",
  "CPTS Drôme Provençale - Enclave des Papes": "#ffa8d5",
  "CPTS Durance Haut Var": "#7af8eb",
  "CPTS Gapençais": "#f6ad55",
  "CPTS Grand Avignon": "#f6e05e",
  "CPTS Guil Durance": "#b9d8f6",
  "CPTS Haute Ouvèze": "#ffa2a0",
  "CPTS Hauts Pays du Verdon & Monts d'Azur": "#f6ad55",
  "CPTS Hyères et les îles d'or": "#f6e05e",
  "CPTS IASO - Initiative Action Santé Orange": "#8ffab5",
  "CPTS Initiatives Santé": "#b9d8f6",
  "CPTS Itinéraire Santé": "#d9b4ff",
  "CPTS LSTO": "#66b6ff",
  "CPTS La Vallée de l'Ubaye": "#ffa2a0",
  "CPTS La Vallée du Gapeau": "#7af8eb",
  "CPTS Littoral Sud": "#f6ad55",
  "CPTS Marseille 7e": "#f6e05e",
  "CPTS Nice Centre Nice Est": "#f6ad55",
  "CPTS Nice Nord et ses Colines": "#8ffab5",
  "CPTS Nice Ouest Valée": "#ffa8d5",
  "CPTS Nord Provence": "#66b6ff",
  "CPTS Ouest Etang de Berre": "#f6ad55",
  "CPTS Pays d'Aubagne et de l'Etoile": "#ffa8d5",
  "CPTS Pays des Maures - Littoral": "#8ffab5",
  "CPTS Provence Santé": "#f6e05e",
  "CPTS Provence Verte": "#66b6ff",
  "CPTS Santé Lub": "#d9b4ff",
  "CPTS Sud 04": "#f6e05e",
  "CPTS Tinée Vésubie": "#f6e05e",
  "CPTS Toulon Littoral": "#b9d8f6",
  "CPTS Val Durance": "#ffa2a0",
  "CPTS Vallée du Paillon et de la Banquière": "#d9b4ff",
  "CPTS Var Est Pays de Fayence": "#f6e05e",
  "CPTS Var Estérel Méditerranée": "#d9b4ff",
  "CPTS Var Ouest": "#ffa8d5",
  "CPTS Var Provence Méditerranée": "#d9b4ff",
  "CPTS Villages de l'Arc": "#d9b4ff",
  "CPTS Vitale Santé 10": "#ffa2a0",
  "CPTS de la Haute Vallée de Var de la Vaïre et de l'Esteron": "#7af8eb",
  "CPTS de la Riviera Française": "#66b6ff",
  "CPTS des Baous": "#ffa8d5",
  "CPTS des Collines de Valbonne": "#8ffab5",
  "CPTS des Vignes et Calanques": "#d9b4ff",
  "CPTS di Littoral 06": "#7af8eb",
  "CPTS du Canton Vert": "#7af8eb",
  "CPTS du Férion": "#f6ad55",
  "CPTS du Gapençais": "#d9b4ff",
  "CPTS du Golf": "#7af8eb",
  "CPTS du Pays Salonais": "#66b6ff",
  "CPTS du Pays d'Arles": "#7af8eb",
  "CPTS du Pays d'Azur": "#ffa8d5",
  "CPTS du Pays de Grasse": "#b9d8f6",
  "CPTS du Pays de Lérins": "#b9d8f6",
  "CPTS du Pays de Martigues": "#8ffab5",
  "CPTS du Plateau": "#8ffab5",
  "CPTS du Verdon": "#ffa8d5",
  "CPTS la Caravelle": "#66b6ff",
  "CPTS la Poudrerie": "#b9d8f6",
  "CPTS su Pays d'Apt": "#8ffab5"
};

const epciColors = {
  "Métropole Toulon-Provence-Méditerranée": "#ffa8d5",
  "Communauté de communes de la Vallée du Gapeau": "#b9d8f6",
  "Communauté de communes Méditerranée Porte des Maures": "#66b6ff",
  "Communauté de communes du Golfe de Saint-Tropez": "#7af8eb",
  "Communauté de communes Coeur du Var": "#ffa2a0",
  "Communauté d'agglomération de la Provence Verte": "#8ffab5",
  "Communauté d'agglomération Sud Sainte Baume": "#f6ad55",
  "Communauté d'agglomération Dracénie Provence Verdon Agglomération": "#b9d8f6",
  "Communauté de communes Provence Verdon": "#d9b4ff",
  "Communauté d'agglomération Estérel Côte d'Azur Agglomération": "#f6e05e",
  "Métropole d'Aix-Marseille-Provence": "#ffa8d5",
  "Communauté de communes du Pays de Fayence": "#8ffab5",
  "Communauté de communes Lacs et Gorges du Verdon": "#f6ad55",
  "Communauté d'agglomération Cannes Pays de Lérins": "#ffa8d5",
  "Communauté d'agglomération du Pays de Grasse": "#66b6ff",
  "Communauté d'agglomération de Sophia Antipolis": "#f6ad55",
  "Métropole Nice Côte d'Azur": "#d9b4ff",
  "Communauté de communes Alpes-Provence-Verdon - Sources de Lumière": "#7af8eb",
  "Communauté de communes du Pays des Paillons": "#f6e05e",
  "Communauté d'agglomération de la Riviera Française": "#8ffab5",
  "Communauté de communes Alpes d'Azur": "#b9d8f6",
  "Communauté d'agglomération d'Arles-Crau-Camargue-Montagnette": "#66b6ff",
  "Communauté de communes Vallée des Baux-Alpilles (CC VBA)": "#f6ad55",
  "Communauté d'agglomération Terre de Provence": "#8ffab5",
  "Communauté d'agglomération du Grand Avignon (COGA)": "#ffa8d5",
  "Communauté d'agglomération Luberon Monts de Vaucluse": "#66b6ff",
  "Communauté de communes du Pays des Sorgues et des Monts de Vaucluse": "#b9d8f6",
  "Communauté de communes Pays d'Apt-Luberon": "#ffa2a0",
  "Communauté de communes Territoriale Sud-Luberon": "#f6e05e",
  "Communauté d'agglomération Durance-Lubéron-Verdon Agglomération": "#8ffab5",
  "Communauté de communes Jabron-Lure-Vançon-Durance": "#ffa8d5",
  "Communauté d'agglomération Provence-Alpes-Agglomération": "#f6e05e",
  "Communauté de communes Buëch-Dévoluy": "#ffa8d5",
  "Communauté d'agglomération Gap-Tallard-Durance": "#8ffab5",
  "Communauté de communes Serre-Ponçon Val d'Avance": "#f6ad55",
  "Communauté de communes Champsaur-Valgaudemar": "#f6e05e",
  "Communauté de communes Vallée de l'Ubaye - Serre-Ponçon": "#66b6ff",
  "Communauté de communes du Guillestrois et du Queyras": "#b9d8f6",
  "Communauté de communes du Pays des Ecrins": "#ffa2a0",
  "Communauté de communes du Briançonnais": "#7af8eb",
  "Communauté de communes du Sisteronais-Buëch": "#d9b4ff",
  "Communauté de communes Pays Forcalquier et Montagne de Lure": "#66b6ff",
  "Communauté d'agglomération Ventoux-Comtat-Venaissin (COVE)": "#d9b4ff",
  "Communauté de communes Vaison Ventoux": "#ffa2a0",
  "Communauté de communes Ventoux Sud": "#8ffab5",
  "Communauté d'agglomération des Sorgues du Comtat": "#f6e05e",
  "Communauté de communes Pays d'Orange en Provence": "#f6ad55",
  "Communauté de communes Rhône Lez Provence": "#7af8eb",
  "Communauté de communes Haute-Provence-Pays de Banon": "#b9d8f6",
  "Communauté de communes Enclave des Papes-Pays de Grignan": "#66b6ff",
  "Communauté de communes Sud Luberon": "#f6e05e",
  "Communauté de communes Serre-Ponçon": "#f6ad55",
  "Communauté de communes Aygues-Ouvèze en Provence (CCAOP)": "#ffa2a0"
};

// Effacement automatique du rectangle au changement de pop-up
map.on('popupclose', () => {
  if (activeBoundsRectangle) {
    map.removeLayer(activeBoundsRectangle);
    activeBoundsRectangle = null;
  }
});

// -------------------------
// Helpers UI & Options
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

    checkbox.addEventListener("change", () => {
      handleCategorySelectionChange(c, checkbox.checked, categories);
    });
  });

  updateSelectTriggerText();
}

function handleCategorySelectionChange(category, isChecked, allCategories) {
  if (category === "TOTAL") {
    selectedCategories = ["TOTAL"];
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

  const checkboxes = document.querySelectorAll("#custom-options-container input[type='checkbox']");
  checkboxes.forEach(chk => {
    chk.checked = selectedCategories.includes(chk.value);
  });

  updateSelectTriggerText();
  render();
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
  document.getElementById("epci-custom-options-container")?.classList.remove("show");
  document.getElementById("cpts-custom-options-container")?.classList.remove("show");
}

document.getElementById("select-trigger")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const options = document.getElementById("custom-options-container");
  const willShow = !options?.classList.contains("show");
  closeAllDropdowns();
  if (willShow) {
    options?.classList.add("show");
  }
});

document.addEventListener("click", () => {
  closeAllDropdowns();
});

document.getElementById("custom-options-container")?.addEventListener("click", (e) => {
  e.stopPropagation();
});

// -------------------------
// DAC Dropdown
// -------------------------
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

// -------------------------
// EPCI Dropdown & Filtering
// -------------------------
document.getElementById("epci-select-trigger")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const options = document.getElementById("epci-custom-options-container");
  const willShow = !options?.classList.contains("show");
  closeAllDropdowns();
  if (willShow) {
    options?.classList.add("show");
  }
});

document.getElementById("epci-custom-options-container")?.addEventListener("click", (e) => {
  e.stopPropagation();
});

function getOfficialEPCIName(epciNameOrCode) {
  if (!epciNameOrCode || epciNameOrCode === "UNKNOWN" || epciNameOrCode === "EPCI inconnu") return epciNameOrCode;
  if (epciColors[epciNameOrCode]) return epciNameOrCode;
  const normInput = normalizeName(epciNameOrCode);
  for (const key in epciColors) {
    if (normalizeName(key) === normInput) return key;
  }
  return epciNameOrCode;
}

function getEPCINameForRow(r) {
  if (r.epciName && r.epciName !== "EPCI inconnu") return getOfficialEPCIName(r.epciName);
  if (EPCI_MAP) {
    const fromCp = EPCI_MAP[r.cp];
    if (fromCp) return getOfficialEPCIName(fromCp);
    const fromLabel = EPCI_MAP[r.label] || EPCI_MAP[normalizeName(r.label)];
    if (fromLabel) return getOfficialEPCIName(fromLabel);
  }
  return "EPCI inconnu";
}

function filterRowsByEPCI(rows) {
  if (modeSel.value !== "epci") return rows;
  if (selectedEPCIs.includes("TOTAL") || selectedEPCIs.length === 0) return rows;
  return rows.filter(r => {
    const epciName = getEPCINameForRow(r);
    const normTarget = normalizeName(epciName);
    return selectedEPCIs.some(sel => sel === epciName || normalizeName(sel) === normTarget);
  });
}

function setEpciOptions(epciByDpt) {
  const container = document.getElementById("epci-custom-options-container");
  if (!container) return;
  container.innerHTML = "";

  const totalDiv = document.createElement("div");
  totalDiv.className = "custom-option";
  const totalCheckbox = document.createElement("input");
  totalCheckbox.type = "checkbox";
  totalCheckbox.value = "TOTAL";
  totalCheckbox.id = "chk-epci-TOTAL";
  totalCheckbox.checked = selectedEPCIs.includes("TOTAL");
  const totalLabel = document.createElement("label");
  totalLabel.htmlFor = totalCheckbox.id;
  totalLabel.textContent = "Tous les EPCI (vue globale)";
  totalDiv.appendChild(totalCheckbox);
  totalDiv.appendChild(totalLabel);
  container.appendChild(totalDiv);

  totalCheckbox.addEventListener("change", () => {
    handleEpciSelectionChange("TOTAL", totalCheckbox.checked, epciByDpt);
  });

  const dptLabels = {
    "04": "04 - Alpes-de-Haute-Provence",
    "05": "05 - Hautes-Alpes",
    "06": "06 - Alpes-Maritimes",
    "13": "13 - Bouches-du-Rhône",
    "83": "83 - Var",
    "84": "84 - Vaucluse"
  };

  Object.keys(epciByDpt).sort().forEach(dpt => {
    const list = epciByDpt[dpt];
    if (list.length === 0) return;

    const dptHeader = document.createElement("div");
    dptHeader.className = "dpt-header";

    const dptCheckbox = document.createElement("input");
    dptCheckbox.type = "checkbox";
    dptCheckbox.id = `chk-epci-dpt-${dpt}`;
    dptCheckbox.checked = !selectedEPCIs.includes("TOTAL") && list.every(item => selectedEPCIs.includes(item));

    const dptLabel = document.createElement("label");
    dptLabel.htmlFor = dptCheckbox.id;
    dptLabel.textContent = dptLabels[dpt] || `Département ${dpt}`;

    dptHeader.appendChild(dptCheckbox);
    dptHeader.appendChild(dptLabel);
    container.appendChild(dptHeader);

    dptCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      handleEpciDptSelectionChange(dpt, dptCheckbox.checked, epciByDpt);
    });

    list.forEach(rawEpci => {
      const epci = getOfficialEPCIName(rawEpci);
      const optionDiv = document.createElement("div");
      optionDiv.className = "custom-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = epci;
      const checkboxId = `chk-epci-${dpt}-${epci.replace(/[^a-zA-Z0-9]/g, "-")}`;
      checkbox.id = checkboxId;
      checkbox.checked = selectedEPCIs.includes(epci);
      const label = document.createElement("label");
      label.htmlFor = checkboxId;
      label.textContent = epci;
      optionDiv.appendChild(checkbox);
      optionDiv.appendChild(label);
      container.appendChild(optionDiv);

      checkbox.addEventListener("change", () => {
        handleEpciSelectionChange(epci, checkbox.checked, epciByDpt);
      });
    });
  });

  updateEpciSelectTriggerText();
}

function handleEpciDptSelectionChange(dpt, isChecked, epciByDpt) {
  const list = (epciByDpt[dpt] || []).map(getOfficialEPCIName);
  if (isChecked) {
    selectedEPCIs = selectedEPCIs.filter(e => e !== "TOTAL");
    list.forEach(item => {
      if (!selectedEPCIs.includes(item)) {
        selectedEPCIs.push(item);
      }
    });
  } else {
    selectedEPCIs = selectedEPCIs.filter(e => !list.includes(e));
    if (selectedEPCIs.length === 0) {
      selectedEPCIs = ["TOTAL"];
    }
  }

  const checkboxes = document.querySelectorAll("#epci-custom-options-container input[type='checkbox']");
  checkboxes.forEach(chk => {
    if (chk.value !== "TOTAL" && !chk.id.startsWith("chk-epci-dpt-")) {
      chk.checked = selectedEPCIs.includes(chk.value);
    }
  });

  Object.keys(epciByDpt).forEach(d => {
    const dptChk = document.getElementById(`chk-epci-dpt-${d}`);
    if (dptChk) {
      const dptList = (epciByDpt[d] || []).map(getOfficialEPCIName);
      dptChk.checked = !selectedEPCIs.includes("TOTAL") && dptList.length > 0 && dptList.every(item => selectedEPCIs.includes(item));
    }
  });

  const totalChk = document.getElementById("chk-epci-TOTAL");
  if (totalChk) totalChk.checked = selectedEPCIs.includes("TOTAL");

  updateEpciSelectTriggerText();
  render();
}

function handleEpciSelectionChange(epci, isChecked, epciByDpt) {
  const officialEpci = getOfficialEPCIName(epci);
  if (officialEpci === "TOTAL") {
    selectedEPCIs = ["TOTAL"];
  } else {
    if (isChecked) {
      selectedEPCIs = selectedEPCIs.filter(e => e !== "TOTAL");
      if (!selectedEPCIs.includes(officialEpci)) {
        selectedEPCIs.push(officialEpci);
      }
    } else {
      selectedEPCIs = selectedEPCIs.filter(e => e !== officialEpci);
      if (selectedEPCIs.length === 0) {
        selectedEPCIs = ["TOTAL"];
      }
    }
  }

  const checkboxes = document.querySelectorAll("#epci-custom-options-container input[type='checkbox']");
  checkboxes.forEach(chk => {
    if (!chk.id.startsWith("chk-epci-dpt-")) {
      chk.checked = selectedEPCIs.includes(chk.value);
    }
  });

  if (epciByDpt) {
    Object.keys(epciByDpt).forEach(d => {
      const dptChk = document.getElementById(`chk-epci-dpt-${d}`);
      if (dptChk) {
        const dptList = (epciByDpt[d] || []).map(getOfficialEPCIName);
        dptChk.checked = !selectedEPCIs.includes("TOTAL") && dptList.length > 0 && dptList.every(item => selectedEPCIs.includes(item));
      }
    });
  }

  updateEpciSelectTriggerText();
  render();
}

function updateEpciSelectTriggerText() {
  const triggerSpan = document.querySelector("#epci-select-trigger span");
  if (!triggerSpan) return;
  if (selectedEPCIs.includes("TOTAL")) {
    triggerSpan.textContent = "Tous les EPCI (vue globale)";
  } else {
    if (selectedEPCIs.length === 1) {
      triggerSpan.textContent = selectedEPCIs[0];
    } else {
      triggerSpan.textContent = `${selectedEPCIs.length} EPCI sélectionnés`;
    }
  }
}

// -------------------------
// CPTS Dropdown & Filtering
// -------------------------
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

function filterRowsByCPTS(rows) {
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

  const dptLabels = {
    "04": "04 - Alpes-de-Haute-Provence",
    "05": "05 - Hautes-Alpes",
    "06": "06 - Alpes-Maritimes",
    "13": "13 - Bouches-du-Rhône",
    "83": "83 - Var",
    "84": "84 - Vaucluse"
  };

  Object.keys(cptsByDpt).sort().forEach(dpt => {
    const list = cptsByDpt[dpt];
    if (list.length === 0) return;

    const dptHeader = document.createElement("div");
    dptHeader.className = "dpt-header";

    const dptCheckbox = document.createElement("input");
    dptCheckbox.type = "checkbox";
    dptCheckbox.id = `chk-cpts-dpt-${dpt}`;
    dptCheckbox.checked = !selectedCPTS.includes("TOTAL") && list.every(c => selectedCPTS.includes(c));

    const dptLabel = document.createElement("label");
    dptLabel.htmlFor = dptCheckbox.id;
    dptLabel.textContent = dptLabels[dpt] || `Département ${dpt}`;

    dptHeader.appendChild(dptCheckbox);
    dptHeader.appendChild(dptLabel);
    container.appendChild(dptHeader);

    dptCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      handleCptsDptSelectionChange(dpt, dptCheckbox.checked, cptsByDpt);
    });

    list.forEach(cpts => {
      const optionDiv = document.createElement("div");
      optionDiv.className = "custom-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = cpts;
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

function handleCptsDptSelectionChange(dpt, isChecked, cptsByDpt) {
  const list = cptsByDpt[dpt] || [];
  if (isChecked) {
    selectedCPTS = selectedCPTS.filter(c => c !== "TOTAL");
    list.forEach(c => {
      if (!selectedCPTS.includes(c)) {
        selectedCPTS.push(c);
      }
    });
  } else {
    selectedCPTS = selectedCPTS.filter(c => !list.includes(c));
    if (selectedCPTS.length === 0) {
      selectedCPTS = ["TOTAL"];
    }
  }

  const checkboxes = document.querySelectorAll("#cpts-custom-options-container input[type='checkbox']");
  checkboxes.forEach(chk => {
    if (chk.value !== "TOTAL" && !chk.id.startsWith("chk-cpts-dpt-")) {
      chk.checked = selectedCPTS.includes(chk.value);
    }
  });

  Object.keys(cptsByDpt).forEach(d => {
    const dptChk = document.getElementById(`chk-cpts-dpt-${d}`);
    if (dptChk) {
      const dptList = cptsByDpt[d];
      dptChk.checked = !selectedCPTS.includes("TOTAL") && dptList.length > 0 && dptList.every(c => selectedCPTS.includes(c));
    }
  });

  const totalChk = document.getElementById("chk-cpts-TOTAL");
  if (totalChk) totalChk.checked = selectedCPTS.includes("TOTAL");

  updateCptsSelectTriggerText();
  render();
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

  const checkboxes = document.querySelectorAll("#cpts-custom-options-container input[type='checkbox']");
  checkboxes.forEach(chk => {
    if (!chk.id.startsWith("chk-cpts-dpt-")) {
      chk.checked = selectedCPTS.includes(chk.value);
    }
  });

  if (cptsByDpt) {
    Object.keys(cptsByDpt).forEach(d => {
      const dptChk = document.getElementById(`chk-cpts-dpt-${d}`);
      if (dptChk) {
        const dptList = cptsByDpt[d];
        dptChk.checked = !selectedCPTS.includes("TOTAL") && dptList.length > 0 && dptList.every(c => selectedCPTS.includes(c));
      }
    });
  }

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
// Parsing Date & Helpers
// -------------------------
function parseToDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10) - 1;
    const yy = parseInt(m[3], 10);
    const hh = m[4] ? parseInt(m[4], 10) : 0;
    const mi = m[5] ? parseInt(m[5], 10) : 0;
    const ss = m[6] ? parseInt(m[6], 10) : 0;
    const d = new Date(yy, mm, dd, hh, mi, ss);
    return isNaN(d.getTime()) ? null : d;
  }

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
  return d ? (d.getMonth() + 1) : null;
}

function quarterFromMonth(m) {
  return Math.floor((m - 1) / 3) + 1;
}

function semesterFromMonth(m) {
  return (m <= 6) ? 1 : 2;
}

// -------------------------
// Time Filter Logic
// -------------------------
function buildTimeUI(rows) {
  const years = Array.from(new Set(rows.map(yearOfRow).filter(Boolean))).sort((a, b) => a - b);

  setOptions(yearSel, [
    { value: "ALL", label: "Toutes années" },
    ...years.map(y => ({ value: String(y), label: String(y) }))
  ]);
  yearSel.value = "ALL";

  setOptions(periodTypeSel, [
    { value: "ALL", label: "Toute l’année" },
    { value: "SEMESTER", label: "Semestre" },
    { value: "QUARTER", label: "Trimestre" },
    { value: "MONTH", label: "Mois" }
  ]);
  periodTypeSel.value = "ALL";

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

// -------------------------
// Aggregation & Matching
// -------------------------
function normStr(v) {
  return String(v ?? "").trim().replace(/\s+/g, " ").normalize("NFKC");
}

function matchesCategory(row, categories) {
  const catArray = Array.isArray(categories) ? categories : [categories];
  if (!catArray || catArray.length === 0 || catArray.includes("TOTAL")) {
    return true;
  }

  const rowOrigins = Array.isArray(row.origins) ? row.origins.map(normalizeToStandardDifficulty) : [];
  return catArray.some(cat => {
    const target = normalizeToStandardDifficulty(cat);
    return rowOrigins.some(o => o === target);
  });
}

// -------------------------
// Info Badge UI
// -------------------------
function updateInfoBadge(totalRuptures, timeLabel) {
  const mode = modeSel.value;
  
  let html = `<div style="font-size: 15px; font-weight: 700; border-bottom: 1.5px solid rgba(255,255,255,0.3); padding-bottom: 8px; margin-bottom: 10px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px;">`;
  html += `<span>📊</span> <span>${totalRuptures} rupture${totalRuptures > 1 ? 's' : ''}</span>`;
  html += `</div>`;

  html += `<div style="display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; font-weight: 500; text-align: left; width: 100%;">`;

  let modeText = "Par commune";
  if (mode === "epci") modeText = "Par EPCI";
  else if (mode === "dac") modeText = "Par DAC";
  else if (mode === "cpts") modeText = "Par CPTS";
  html += `<div><span style="color: rgba(255,255,255,0.7); font-weight: 600;">Affichage :</span> <span style="font-weight: 600;">${modeText}</span></div>`;

  html += `<div><span style="color: rgba(255,255,255,0.7); font-weight: 600;">Période :</span> <span style="font-weight: 600;">${timeLabel}</span></div>`;

  const selectedParcours = parcoursSel ? parcoursSel.value : "ALL";
  html += `<div><span style="color: rgba(255,255,255,0.7); font-weight: 600;">Parcours :</span> <span style="font-weight: 600;">${selectedParcours === "ALL" ? "Tous les parcours" : selectedParcours}</span></div>`;

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

  if (mode === "epci") {
    if (selectedEPCIs.includes("TOTAL")) {
      html += `<div><span style="color: rgba(255,255,255,0.7); font-weight: 600;">Filtre EPCI :</span> <span style="font-weight: 600;">Tous les EPCI</span></div>`;
    } else {
      html += `<div style="margin-top: 2px;"><span style="color: rgba(255,255,255,0.7); font-weight: 600; display: block; margin-bottom: 2px;">EPCI sélectionné(s) (${selectedEPCIs.length}) :</span>`;
      html += `<ul style="margin: 0 0 0 16px; padding: 0; list-style-type: disc;">`;
      selectedEPCIs.forEach(epci => {
        html += `<li style="line-height: 1.4; margin-bottom: 2px; font-weight: 600;">${epci}</li>`;
      });
      html += `</ul></div>`;
    }
  }

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

// -------------------------
// Render
// -------------------------
function render() {
  layer.clearLayers();
  const mode = modeSel.value;

  if (dacContainer) dacContainer.style.display = (mode === "dac") ? "inline-flex" : "none";
  if (cptsContainer) cptsContainer.style.display = (mode === "cpts") ? "inline-flex" : "none";
  if (epciContainer) epciContainer.style.display = (mode === "epci") ? "inline-flex" : "none";

  if (mode !== "dac" && mode !== "cpts" && mode !== "epci") {
    map.setMinZoom(0);
  }

  // Fond de carte dynamique (Communes / EPCI)
  if (mode === "commune" || mode === "dac" || mode === "cpts" || mode === "epci") {
    map.removeLayer(epciLayer);
    communesLayer.addTo(map);
    updateCommunesStyle();
  }

  const timeLabel = (() => {
    const y = yearSel.value;
    if (y === "ALL") return "Toutes années";
    if (periodTypeSel.value === "ALL") return `Année ${y}`;
    const pv = periodValueSel.options[periodValueSel.selectedIndex]?.textContent || "";
    return `${y} – ${pv}`;
  })();

  const rawRows = DATA ? DATA.rows : [];
  const rowsTime = filterRowsByEPCI(filterRowsByCPTS(filterRowsByDAC(filterRowsByParcours(filterRowsByTime(rawRows)))));

  // Mode Commune, DAC, CPTS, EPCI (Clustering & Marqueurs individuels)
  if (mode === "commune" || mode === "dac" || mode === "cpts" || mode === "epci") {
    const markerClusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 40,
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

    const matchingRows = rowsTime.filter(r => matchesCategory(r, selectedCategories));
    updateInfoBadge(matchingRows.length, timeLabel);

    matchingRows.forEach(r => {
      const bubbleClass = "mini-marker-bubble";
      const miniIcon = L.divIcon({
        className: "",
        html: `<div class="${bubbleClass}" title="${r.label}"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      const parcoursStr = Array.isArray(r.parcours) ? r.parcours.join(", ") : (r.parcours || "Non renseigné");
      const originsList = Array.isArray(r.origins) ? r.origins : (r.origins ? [r.origins] : []);

      const popupContent = `
        <div style="font-family: 'Outfit', sans-serif; min-width: 230px; max-width: 320px; line-height: 1.45;">
          <div style="font-size: 15px; font-weight: 700; color: var(--blue-dark); margin-bottom: 2px;">
            ${r.label} <span style="font-size: 12px; font-weight: 500; color: var(--text-muted);">(CP: ${r.cp})</span>
          </div>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 8px 0;">

          <div style="font-size: 13px; color: #334155; margin-bottom: 4px;">
            <b>Date de survenue :</b> ${formatToFrDate(r.date)}
          </div>
          
          <div style="font-size: 13px; color: #334155; margin-bottom: 8px;">
            <b>Parcours :</b> ${parcoursStr}
          </div>

          <b style="color: var(--blue-dark); display: block; margin-top: 8px; font-size: 13px;">Difficultés rencontrées :</b>
          <ul style="margin: 4px 0 8px 0; padding-left: 18px; color: var(--text-dark); font-size: 12.5px;">
            ${originsList.map(o => `<li>${o}</li>`).join("")}
          </ul>

          ${r.detail ? `
            <b style="color: var(--blue-dark); display: block; margin-top: 8px; font-size: 13px;">Précisions :</b>
            <div style="margin-top: 4px; padding: 8px 10px; background: #f8fafc; border-left: 3px solid var(--blue-light); border-radius: 4px; font-size: 12px; color: var(--text-muted); font-style: italic; max-height: 100px; overflow-y: auto; box-sizing: border-box;">
              "${r.detail}"
            </div>
          ` : ""}

          ${r.isManual ? `
            <div style="margin-top: 10px; padding: 8px 10px; background: #fffaf0; border: 1px solid #fed7aa; border-radius: 6px; line-height: 1.4;">
              <div style="font-size: 11.5px; font-weight: 700; color: #c2410c; display: flex; align-items: center; gap: 4px; margin-bottom: 3px;">
                <span>📌 Importé par :</span> <span>${r.sourceDac || "DAC"}</span>
              </div>
              <div style="font-size: 10.5px; color: #7c2d12; opacity: 0.9;">
                <span style="font-weight: 600;">Dernière mise à jour :</span> ${r.importDate || "Aujourd'hui"}
              </div>
              <div style="font-size: 10.5px; color: #7c2d12; opacity: 0.9; margin-top: 2px; word-break: break-all;">
                <span style="font-weight: 600;">Fichier :</span> ${r.sourceFile || "Fichier CSV"}
              </div>
            </div>
          ` : ""}
        </div>
      `;
      const marker = L.marker([r.lat, r.lng], { icon: miniIcon })
        .bindPopup(popupContent);

      markerClusterGroup.addLayer(marker);
    });

    layer.addLayer(markerClusterGroup);
    return;
  }
}

// -------------------------
// Color Lookups
// -------------------------
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
  if (!dacName || dacName === "DAC inconnu" || dacName === "Non renseigné") return "#cbd5e0";
  if (dacColors[dacName]) return dacColors[dacName];
  const normInput = normalizeName(dacName);
  for (const key in dacColors) {
    if (normalizeName(key) === normInput) return dacColors[key];
  }
  return "#cbd5e0";
}

function colorForCPTS(cptsName) {
  if (!cptsName || cptsName === "CPTS inconnu" || cptsName === "Non renseigné") return "#cbd5e0";
  if (cptsColors[cptsName]) return cptsColors[cptsName];
  const normInput = normalizeName(cptsName);
  for (const key in cptsColors) {
    if (normalizeName(key) === normInput) return cptsColors[key];
  }
  return "#cbd5e0";
}

function colorForEPCI(epciNameOrCode) {
  if (!epciNameOrCode || epciNameOrCode === "UNKNOWN" || epciNameOrCode === "EPCI inconnu") return "#cbd5e0";
  const official = getOfficialEPCIName(epciNameOrCode);
  if (epciColors[official]) return epciColors[official];
  if (epciColors[epciNameOrCode]) return epciColors[epciNameOrCode];

  const normInput = normalizeName(epciNameOrCode);
  for (const key in epciColors) {
    if (normalizeName(key) === normInput) return epciColors[key];
  }
  
  // Golden ratio pastel fallback pour tout EPCI non présent dans le dictionnaire
  let hash = 0;
  for (let i = 0; i < epciNameOrCode.length; i++) {
    hash = epciNameOrCode.charCodeAt(i) + ((hash << 5) - hash);
  }
  const goldenRatio = 0.618033988749895;
  const hue = Math.floor(((Math.abs(hash) * goldenRatio) % 1) * 360);
  return `hsl(${hue}, 65%, 68%)`;
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
      const dacName = DAC_MAP[cp] || DAC_MAP[name] || DAC_MAP[normalizeName(name)] || "DAC inconnu";
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
        fillColor = "transparent";
        fillOpacity = 0;
        strokeColor = "#cbd5e0";
        strokeWidth = 0.5;
        dashArray = "2 2";
      }
    } else if (mode === "cpts" && CPTS_MAP) {
      const cptsName = CPTS_MAP[cp] || CPTS_MAP[name] || CPTS_MAP[normalizeName(name)] || "CPTS inconnu";
      const isAllSelected = selectedCPTS.includes("TOTAL");
      const isThisCptsSelected = selectedCPTS.includes(cptsName);
      if (isAllSelected) {
        fillColor = colorForCPTS(cptsName);
        fillOpacity = 0.65;
        strokeColor = "#2d3748";
        strokeWidth = 1.5;
        dashArray = "";
      } else if (isThisCptsSelected) {
        fillColor = colorForCPTS(cptsName);
        fillOpacity = 0.8;
        strokeColor = "#1a202c";
        strokeWidth = 2.2;
        dashArray = "";
      } else {
        fillColor = "transparent";
        fillOpacity = 0;
        strokeColor = "#cbd5e0";
        strokeWidth = 0.5;
        dashArray = "2 2";
      }
    } else if (mode === "epci") {
      const rawEpciName = feature.properties?.EPCI || "UNKNOWN";
      const epciName = getOfficialEPCIName(rawEpciName);
      const epciCode = String(feature.properties?.EPCI_CODE ?? "");
      const isAllSelected = selectedEPCIs.includes("TOTAL");
      const normEpciName = normalizeName(epciName);
      const isThisEpciSelected = selectedEPCIs.some(sel => sel === epciName || sel === epciCode || normalizeName(sel) === normEpciName);

      if (isAllSelected) {
        fillColor = colorForEPCI(epciName);
        fillOpacity = 0.65;
        strokeColor = "#1f3b63";
        strokeWidth = 1;
        dashArray = "";
      } else if (isThisEpciSelected) {
        fillColor = colorForEPCI(epciName);
        fillOpacity = 0.85;
        strokeColor = "#1a202c";
        strokeWidth = 2.2;
        dashArray = "";
      } else {
        fillColor = "transparent";
        fillOpacity = 0;
        strokeColor = "#cbd5e0";
        strokeWidth = 0.5;
        dashArray = "2 2";
      }
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

function attachEPCIToRows(rows) {
  return rows.map(r => {
    const epciName = getEPCINameForRow(r);
    return {
      ...r,
      epciName
    };
  });
}

function normalizeGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") return geometry;

  if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
    return geometry.geometries.find(g => g.type === "Polygon" || g.type === "MultiPolygon") || null;
  }
  return null;
}

// -------------------------
// Load Google Sheet en direct
// -------------------------
let LIVE_ROWS = [];

function rebuildAllDataRows() {
  loadImportedFilesFromStorage();
  const manualRows = getManualRows();

  const merged = mergeRows(LIVE_ROWS, manualRows);
  
  DATA = {
    categories: rebuildCategoriesFromRows(merged.rows),
    rows: attachEPCIToRows(merged.rows),
    parcoursList: rebuildParcoursFromRows(merged.rows)
  };

  setCategoryOptions(DATA.categories);
  selectedCategories = ['TOTAL'];
  buildTimeUI(DATA.rows);

  if (parcoursSel && DATA.parcoursList) {
    setOptions(parcoursSel, [
      { value: "ALL", label: "Tous les parcours" },
      ...DATA.parcoursList.map(p => ({ value: p, label: p }))
    ]);
    parcoursSel.value = "ALL";
  }

  render();
}

async function loadLiveGoogleSheet() {
  try {
    info.textContent = "Téléchargement des données en direct...";

    const cpGeo = await loadCpGeo();
    const response = await fetch(GOOGLE_SHEET_CSV_URL);
    const csvText = await response.text();

    const table = parseCSV(csvText);
    const objs = toObjects(table);

    const built = buildRowsFromGoogleForms(objs, cpGeo);
    LIVE_ROWS = built.rows;

    rebuildAllDataRows();
  } catch (error) {
    console.error("Erreur lors de la récupération des données :", error);
    info.textContent = "Erreur : " + error.message;
  }
}

// -------------------------
// Load GeoJSON & App Init
// -------------------------
const COMMUNES_GEO_PROMISE = Promise.all([
  fetch("./communes_2026.geojson?v=20260902_35").then(r => r.json()),
  fetch("./EPCI_2025.geojson?v=20260902_35").then(r => r.json()),
  fetch("./dac_communes.json?v=20260902_35").then(r => r.json()),
  fetch("./cpts_communes.json?v=20260902_35").then(r => r.json())
]).then(([communesGeo, epciGeo, dacMap, cptsData]) => {
  COMMUNES_GEO = communesGeo;
  EPCI_GEO = epciGeo;
  DAC_MAP = dacMap;
  CPTS_MAP = cptsData.cptsMap;
  CPTS_BY_DEP = cptsData.cptsByDpt;

  const tempSet = new Set();
  Object.keys(CPTS_BY_DEP).sort().forEach(dpt => {
    CPTS_BY_DEP[dpt].forEach(cpts => tempSet.add(cpts));
  });
  allUniqueCPTS = Array.from(tempSet);

  // Construction de la carte de correspondance EPCI_MAP (Commune -> EPCI officiel)
  EPCI_MAP = {};
  communesGeo.features.forEach(f => {
    const rawEpci = f.properties?.EPCI;
    if (!rawEpci) return;
    const epci = getOfficialEPCIName(rawEpci);
    const cp = f.properties?.DCOE_C_COD || f.properties?.code_insee;
    const name = f.properties?.DCOE_L_LIB || f.properties?.nom;
    if (cp && epci) EPCI_MAP[cp] = epci;
    if (name && epci) {
      EPCI_MAP[name] = epci;
      EPCI_MAP[normalizeName(name)] = epci;
    }
  });

  // Groupement automatique des EPCI officiels de la région PACA par département
  const epciByDpt = {};
  communesGeo.features.forEach(f => {
    const isPaca = f.properties?.REGION_COD === "93" || f.properties?.REGION === "Provence-Alpes-Côte d'Azur";
    if (!isPaca) return;
    const insee = f.properties?.DCOE_C_COD || f.properties?.code_insee || "";
    const dpt = f.properties?.DDEP_C_COD || insee.substring(0, 2);
    const rawEpciName = f.properties?.EPCI;
    if (dpt && rawEpciName) {
      const epciName = getOfficialEPCIName(rawEpciName);
      if (!epciByDpt[dpt]) epciByDpt[dpt] = new Set();
      epciByDpt[dpt].add(epciName);
    }
  });

  const epciByDptSorted = {};
  Object.keys(epciByDpt).sort().forEach(dpt => {
    epciByDptSorted[dpt] = Array.from(epciByDpt[dpt]).sort();
  });
  EPCI_BY_DEP = epciByDptSorted;

  const pacaEpciCodes = new Set(
    communesGeo.features
      .filter(f => f.properties?.REGION_COD === "93" || f.properties?.REGION === "Provence-Alpes-Côte d'Azur")
      .map(f => String(f.properties?.EPCI_CODE))
      .filter(Boolean)
  );

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
          const dacName = DAC_MAP[cp] || DAC_MAP[name] || DAC_MAP[normalizeName(name)] || "Non renseigné";
          label += ` — ${dacName}`;
        } else if (mode === "cpts" && CPTS_MAP) {
          const cptsName = CPTS_MAP[cp] || CPTS_MAP[name] || CPTS_MAP[normalizeName(name)] || "Non renseigné";
          label += ` — ${cptsName}`;
        } else if (mode === "epci") {
          const epciName = getOfficialEPCIName(feature.properties?.EPCI || "Non renseigné");
          label += ` — ${epciName}`;
        }
        layer.bindTooltip(label, { sticky: true });
      });

      layer.on('click', (e) => {
        const mode = modeSel.value;
        if (mode !== "cpts" && mode !== "epci" && mode !== "dac") return;

        let territoryName = "";

        if (mode === "cpts" && CPTS_MAP) {
          territoryName = CPTS_MAP[cp] || CPTS_MAP[name] || CPTS_MAP[normalizeName(name)] || "";
        } else if (mode === "epci") {
          territoryName = getOfficialEPCIName(feature.properties?.EPCI || "");
        } else if (mode === "dac" && DAC_MAP) {
          territoryName = DAC_MAP[cp] || DAC_MAP[name] || DAC_MAP[normalizeName(name)] || "";
        }

        if (!territoryName || territoryName === "Non renseigné" || territoryName === "CPTS inconnu" || territoryName === "DAC inconnu" || territoryName === "EPCI inconnu") {
          return;
        }

        const activeRows = filterRowsByParcours(filterRowsByTime(DATA ? DATA.rows : []));
        const catFilteredRows = activeRows.filter(r => matchesCategory(r, selectedCategories));

        let territoryRows = [];
        if (mode === "cpts" && CPTS_MAP) {
          territoryRows = catFilteredRows.filter(r => {
            const cName = CPTS_MAP[r.label] || CPTS_MAP[normalizeName(r.label)] || CPTS_MAP[r.cp];
            return cName === territoryName;
          });
        } else if (mode === "epci") {
          territoryRows = catFilteredRows.filter(r => {
            const eName = getEPCINameForRow(r);
            return eName === territoryName || normalizeName(eName) === normalizeName(territoryName);
          });
        } else if (mode === "dac" && DAC_MAP) {
          territoryRows = catFilteredRows.filter(r => {
            const dName = DAC_MAP[r.label] || DAC_MAP[normalizeName(r.label)] || DAC_MAP[r.cp];
            return dName === territoryName;
          });
        }

        const territoryTotal = territoryRows.length;

        if (activeBoundsRectangle) {
          map.removeLayer(activeBoundsRectangle);
          activeBoundsRectangle = null;
        }

        if (COMMUNES_GEO && COMMUNES_GEO.features) {
          const pacaTerritoryFeatures = COMMUNES_GEO.features.filter(f => {
            const isPaca = f.properties?.REGION_COD === "93" || f.properties?.REGION === "Provence-Alpes-Côte d'Azur";
            if (!isPaca) return false;

            const fCp = f.properties?.DCOE_C_COD || f.properties?.code_insee || "";
            const fName = f.properties?.DCOE_L_LIB || f.properties?.nom || "";

            if (mode === "cpts" && CPTS_MAP) {
              return (CPTS_MAP[fCp] || CPTS_MAP[fName] || CPTS_MAP[normalizeName(fName)]) === territoryName;
            } else if (mode === "epci") {
              const fEpci = getOfficialEPCIName(f.properties?.EPCI || "");
              return fEpci === territoryName || normalizeName(fEpci) === normalizeName(territoryName);
            } else if (mode === "dac" && DAC_MAP) {
              return (DAC_MAP[fCp] || DAC_MAP[fName] || DAC_MAP[normalizeName(fName)]) === territoryName;
            }
            return false;
          });

          if (pacaTerritoryFeatures.length > 0) {
            const tempLayer = L.geoJSON({ type: "FeatureCollection", features: pacaTerritoryFeatures });
            const bounds = tempLayer.getBounds();
            if (bounds.isValid()) {
              activeBoundsRectangle = L.rectangle(bounds, {
                color: "#2b6cb0",
                weight: 2,
                dashArray: "6, 6",
                fill: false,
                interactive: false
              }).addTo(map);
            }
          }
        }

        const popupContent = `
          <div style="font-family: 'Outfit', sans-serif; min-width: 210px; padding: 2px;">
            <b style="color: var(--blue-dark); font-size: 15px; display: block; margin-bottom: 4px;">${territoryName}</b>
            <div style="font-size: 13px; color: #4a5568; margin-bottom: 6px;">Commune cliquée : <b>${name}</b> (${cp})</div>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 8px 0;">
            <div style="font-size: 13px; font-weight: 600; color: #2b6cb0; display: flex; align-items: center; gap: 6px;">
              <span>📊</span>
              <span><b>${territoryTotal}</b> rupture${territoryTotal > 1 ? 's' : ''} enregistrée${territoryTotal > 1 ? 's' : ''} sur ce territoire</span>
            </div>
          </div>
        `;

        L.popup()
          .setLatLng(e.latlng)
          .setContent(popupContent)
          .openOn(map);
      });
    }
  }).addTo(communesLayer);

  L.geoJSON(epciGeo, {
    filter: (f) => pacaEpciCodes.has(String(f.properties?.EPCI_CODE)),
    style: (feature) => {
      const name = getOfficialEPCIName(feature.properties?.EPCI ?? "UNKNOWN");
      return {
        color: "#1f3b63",
        weight: 2,
        dashArray: "4 3",
        fillColor: colorForEPCI(name),
        fillOpacity: 0.55
      };
    },
    onEachFeature: (feature, layer) => {
      const name = getOfficialEPCIName(feature.properties?.EPCI ?? "EPCI");
      const code = feature.properties?.EPCI_CODE ?? "";
      layer.bindTooltip(`${name} (${code})`, { sticky: true });
    }
  }).addTo(epciLayer);

  if (DAC_MAP) {
    const uniqueDacs = Array.from(new Set(Object.values(DAC_MAP))).sort();
    setDacOptions(uniqueDacs);
  }

  if (CPTS_BY_DEP) {
    setCptsOptions(CPTS_BY_DEP);
  }

  if (EPCI_BY_DEP) {
    setEpciOptions(EPCI_BY_DEP);
  }

  if (DATA) {
    DATA.rows = attachEPCIToRows(DATA.rows);
  }
  loadLiveGoogleSheet();
});

// -------------------------
// Events
// -------------------------
modeSel.addEventListener("change", render);

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

// -------------------------
// CSV Parser & Google Form helper functions
// -------------------------
function fixDoubleUtf8(str) {
  if (!str) return "";
  try {
    if (/Ã[©¨ª ¢®¯´»¹§«‰ˆ€]/g.test(str) || str.includes("Ã©") || str.includes("Ã¨") || str.includes("Ã ") || str.includes("Ãª") || str.includes("Ã´")) {
      return decodeURIComponent(escape(str));
    }
  } catch (e) {}
  return str;
}

const STANDARD_DIFFICULTIES = [
  "Absence ou insuffisance de professionnels / services sur le territoire",
  "Difficultés d'articulation entre les professionnels / services sur le territoire",
  "Difficultés dans la réalisation de sa mission pour les professionnels / services",
  "Difficultés de recours aux professionnels/services : critères et contrainte d’entrée en structure (manque de place, modalité d’accès aux structures)",
  "Difficultés à la suite de la perte d’un ou des aidants (décès - maladie - indisponibilité …)"
];

function normalizeToStandardDifficulty(str) {
  if (!str) return "";
  const s = String(str).trim();
  const lower = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (lower.includes("absence") || lower.includes("insuffisance")) {
    return STANDARD_DIFFICULTIES[0];
  }
  if (lower.includes("articulation")) {
    return STANDARD_DIFFICULTIES[1];
  }
  if (lower.includes("realisation") || lower.includes("mission")) {
    return STANDARD_DIFFICULTIES[2];
  }
  if (lower.includes("recours") || lower.includes("critere") || lower.includes("contrainte") || lower.includes("modalite") || lower.includes("acces aux droits")) {
    return STANDARD_DIFFICULTIES[3];
  }
  if (lower.includes("aidant") || lower.includes("perte") || lower.includes("deces") || lower.includes("maladie") || lower.includes("indisponibilite")) {
    return STANDARD_DIFFICULTIES[4];
  }

  for (const std of STANDARD_DIFFICULTIES) {
    if (std.toLowerCase() === lower) return std;
  }
  return s;
}

function cleanAndRepairAccents(str) {
  if (!str) return "";
  let s = String(str);

  s = fixDoubleUtf8(s);

  if (s.includes("\uFFFD")) {
    s = s.replace(/Difficult[^\s\w]*s/gi, "Difficultés")
         .replace(/la suite de la perte d[^\s\w]*un/gi, "la suite de la perte d'un")
         .replace(/d[^\s\w]*c[^\s\w]*s/gi, "décès")
         .replace(/indisponibilit[^\s\w]*/gi, "indisponibilité")
         .replace(/Acc[^\s\w]*s/gi, "Accès")
         .replace(/m[^\s\w]*decin/gi, "médecin")
         .replace(/r[^\s\w]*f[^\s\w]*rent/gi, "référent")
         .replace(/Sant[^\s\w]*/gi, "Santé")
         .replace(/Personnes[^\s\w]*g[^\s\w]*es/gi, "Personnes âgées")
         .replace(/Personne[^\s\w]*g[^\s\w]*e/gi, "Personne âgée")
         .replace(/P[^\s\w]*diatrie/gi, "Pédiatrie")
         .replace(/Pr[^\s\w]*cision/gi, "Précision")
         .replace(/D[^\s\w]*tail/gi, "Détail")
         .replace(/r[^\s\w]*alisation/gi, "réalisation")
         .replace(/crit[^\s\w]*res/gi, "critères")
         .replace(/modalit[^\s\w]*/gi, "modalité")
         .replace(/d[^\s\w]*acc[^\s\w]*s/gi, "d'accès")
         .replace(/d[^\s\w]*entr[^\s\w]*e/gi, "d'entrée")
         .replace(/qu[^\s\w]*est/gi, "qu'est")
         .replace(/l[^\s\w]*origine/gi, "l'origine")
         .replace(/l[^\s\w]*v[^\s\w]*nement/gi, "l'évènement")
         .replace(/d[^\s\w]*un/gi, "d'un")
         .replace(/d[^\s\w]*une/gi, "d'une")
         .replace(/c[^\s\w]*t[^\s\w]*/gi, "côté")
         .replace(/R[^\s\w]*serv[^\s\w]*/gi, "Réservé")
         .replace(/int[^\s\w]*r[^\s\w]*t/gi, "intérêt");

    s = s.replace(/[\uFFFD]+/g, "'").replace(/\s{2,}/g, " ");
  }

  return s;
}

async function readCsvFileText(file) {
  if (!file) return "";
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let text = "";

  // 1. Essai décodage UTF-8 strict (fatal: true rejette les octets Windows-1252 invalides)
  try {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
    text = utf8Decoder.decode(bytes);
  } catch (errUtf8) {
    // 2. Si le décodage UTF-8 échoue (fichier Excel exporté en ANSI/Windows-1252), utiliser Windows-1252
    try {
      text = new TextDecoder("windows-1252").decode(bytes);
    } catch (e1) {
      try {
        text = new TextDecoder("iso-8859-1").decode(bytes);
      } catch (e2) {
        text = new TextDecoder().decode(bytes);
      }
    }
  }

  // Si UTF-8 a été utilisé mais que le texte contient des \uFFFD, essayer de décoder en Windows-1252
  if (text.includes("\uFFFD")) {
    try {
      const winText = new TextDecoder("windows-1252").decode(bytes);
      if (!winText.includes("\uFFFD")) {
        text = winText;
      }
    } catch (e) {}
  }

  return cleanAndRepairAccents(text);
}

function cleanFieldValue(val) {
  if (!val) return "";
  let s = String(val).trim();
  s = s.replace(/^["'\s]+|["'\s]+$/g, "");
  return s.trim();
}

function splitLineRobust(line, delimiter) {
  const str = String(line || "").trim();
  if (!str) return [];

  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];

    if (c === '"') {
      if (inQuotes && str[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      fields.push(cleanFieldValue(current));
      current = "";
    } else {
      current += c;
    }
  }
  fields.push(cleanFieldValue(current));

  if (fields.length === 1 && (fields[0].includes(",") || fields[0].includes(";"))) {
    const altDelim = fields[0].includes(";") ? ";" : ",";
    const altFields = fields[0].split(altDelim).map(cleanFieldValue).filter(Boolean);
    if (altFields.length > 1) {
      return altFields;
    }
  }

  return fields;
}

function parseCSV(text) {
  if (!text) return [];
  text = fixDoubleUtf8(text);

  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ",";
  if (semiCount > commaCount && semiCount >= tabCount) delimiter = ";";
  else if (tabCount > commaCount && tabCount > semiCount) delimiter = "\t";

  const rows = [];
  for (const line of lines) {
    const fields = splitLineRobust(line, delimiter);
    if (fields.length > 0) {
      rows.push(fields);
    }
  }
  return rows;
}

function toObjects(table) {
  if (!table || table.length === 0) return [];
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

function splitMulti(v) {
  if (!v) return [];
  const str = String(v);
  const result = [];
  let current = "";
  let parenDepth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === '(') {
      parenDepth++;
      current += char;
    } else if (char === ')') {
      parenDepth--;
      current += char;
    } else if ((char === ',' || char === ';' || char === '\n') && parenDepth === 0) {
      if (current.trim()) {
        result.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

function parseToISODate(dateStr) {
  if (!dateStr) return "2026-09-01";
  const s = String(dateStr).trim();
  if (!s) return "2026-09-01";

  // DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m1) {
    const dd = String(m1[1]).padStart(2, '0');
    const mm = String(m1[2]).padStart(2, '0');
    let yy = m1[3];
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm}-${dd}`;
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m2) {
    const yy = m2[1];
    const mm = String(m2[2]).padStart(2, '0');
    const dd = String(m2[3]).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  // MM/YYYY or YYYY
  const m3 = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m3) return `${m3[2]}-${String(m3[1]).padStart(2, '0')}-01`;
  const m4 = s.match(/^(\d{4})$/);
  if (m4) return `${m4[1]}-01-01`;

  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) {
    const yy = d1.getFullYear();
    const mm = String(d1.getMonth() + 1).padStart(2, '0');
    const dd = String(d1.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  return "2026-09-01";
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
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[’'–-]/g, " ")
    .replace(/\s+/g, " ");

  s = s.replace(/\bst\b/g, "saint")
    .replace(/\bste\b/g, "sainte");
  return s;
}

function findBestGeoMatch(communeName, cpGeo) {
  if (!communeName) return null;
  const normInput = normalizeName(communeName);
  if (!normInput) return null;

  if (cpGeo[normInput]) return cpGeo[normInput];

  for (const key in cpGeo) {
    if (cpGeo[key].cp === communeName || cpGeo[key].cp === normInput) {
      return cpGeo[key];
    }
  }

  const getWords = (str) => str.split(/\s+/).filter(w => w.length > 1);
  const inputWords = getWords(normInput);
  if (inputWords.length > 0) {
    let bestKey = null;
    let bestScore = 0;

    for (const key of Object.keys(cpGeo)) {
      if (/^\d+$/.test(key)) continue;
      let score = 0;
      const keyWords = getWords(key);

      if (key === normInput) score = 100;
      else if (key.startsWith(normInput) || normInput.startsWith(key)) score = 85;
      else {
        const commonWords = inputWords.filter(w => keyWords.includes(w));
        const significantMatches = commonWords.filter(w => !["la", "les", "sur", "des", "du", "en", "le", "aux", "d", "et", "sous", "de"].includes(w));
        if (significantMatches.length > 0) {
          score = 40 + (significantMatches.length / Math.max(inputWords.length, keyWords.length)) * 50;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }

    if (bestScore >= 40 && bestKey) {
      return cpGeo[bestKey];
    }
  }

  return {
    cp: "83000",
    lat: 43.35 + (Math.random() * 0.3 - 0.15),
    lng: 6.10 + (Math.random() * 0.3 - 0.15),
    label: String(communeName).trim()
  };
}

function getFeatureCenter(feature) {
  try {
    if (window.turf && typeof turf.centroid === "function") {
      const c = turf.centroid(feature);
      return { lat: c.geometry.coordinates[1], lng: c.geometry.coordinates[0] };
    }
  } catch (e) {}
  try {
    const lyr = L.geoJSON(feature);
    const center = lyr.getBounds().getCenter();
    return { lat: center.lat, lng: center.lng };
  } catch (e) {
    return null;
  }
}

let CP_GEO = null;
async function loadCpGeo() {
  if (CP_GEO) return CP_GEO;
  
  if (typeof COMMUNES_GEO_PROMISE !== "undefined" && COMMUNES_GEO_PROMISE) {
    await COMMUNES_GEO_PROMISE;
  }
  
  const map = {};

  try {
    const res = await fetch("./var_communes.csv");
    const text = await res.text();
    const table = parseCSV(text);
    const objs = toObjects(table);

    objs.forEach(o => {
      const cp = String(o.CP ?? "").trim();
      if (!cp) return;
      const lat = parseFloat(String(o.LAT).replace(",", "."));
      const lng = parseFloat(String(o.LNG).replace(",", "."));
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const label = o.LABEL || cp;
        const normKey = normalizeName(label);
        map[normKey] = { cp, lat, lng, label };
        if (cp) map[cp] = { cp, lat, lng, label };
      }
    });
  } catch (e) {
    console.warn("Erreur chargement var_communes.csv:", e);
  }

  if (COMMUNES_GEO && COMMUNES_GEO.features) {
    COMMUNES_GEO.features.forEach(f => {
      const props = f.properties || {};
      const isPaca = props.REGION_COD === "93" || props.REGION === "Provence-Alpes-Côte d'Azur" || ["04", "05", "06", "13", "83", "84"].includes(props.DDEP_C_COD);
      if (!isPaca) return;

      const cp = props.DCOE_C_COD || props.code_insee || "";
      const label = props.DCOE_L_LIB || props.nom || "";
      const normKey = normalizeName(label);

      if (normKey && !map[normKey]) {
        const center = getFeatureCenter(f);
        if (center) {
          map[normKey] = { cp, lat: center.lat, lng: center.lng, label };
          if (cp && !map[cp]) {
            map[cp] = { cp, lat: center.lat, lng: center.lng, label };
          }
        }
      }
    });
  }

  CP_GEO = map;
  return CP_GEO;
}

function buildRowsFromGoogleForms(objs, cpGeo) {
  const rows = [];
  const catsSet = new Set();
  const parcoursSet = new Set();

  if (!objs || objs.length === 0) {
    return { rows: [], categories: ["TOTAL"], parcoursList: [] };
  }

  const keys = Object.keys(objs[0]);
  const findKey = (sub) => keys.find(k => k.toLowerCase().includes(sub.toLowerCase()));

  const keyCommune = findKey("commune") || findKey("ville") || findKey("cp") || findKey("code postal") || (keys.length > 1 ? keys[1] : keys[0]);
  const keyDate = findKey("date de survenue") || findKey("survenue") || findKey("date") || (keys.length > 2 ? keys[2] : keys[0]);
  const keyOrig = findKey("origine") || findKey("motif") || findKey("rupture") || (keys.length > 3 ? keys[3] : keys[0]);
  const keyParcours = findKey("parcours") || (keys.length > 4 ? keys[4] : keys[0]);
  const keyDetail = findKey("détail") || findKey("detail") || findKey("précision") || findKey("remarque") || findKey("commentaire") || findKey("difficult") || (keys.length > 5 ? keys[5] : keys[0]);

  for (const o of objs) {
    const communeName = String(o[keyCommune] ?? "").trim();
    if (!communeName) continue;

    const geo = findBestGeoMatch(communeName, cpGeo) || {
      cp: "83000",
      lat: 43.35 + (Math.random() * 0.3 - 0.15),
      lng: 6.10 + (Math.random() * 0.3 - 0.15),
      label: communeName
    };

    const date = parseToISODate(o[keyDate]);
    const rawOrigins = splitMulti(o[keyOrig]);
    const origins = rawOrigins.map(normalizeToStandardDifficulty).filter(Boolean);
    origins.forEach(x => catsSet.add(x));

    const parcours = splitMulti(o[keyParcours]);
    parcours.forEach(p => parcoursSet.add(p));

    rows.push({
      ts: String(o[COL_TS] ?? o["Horodateur"] ?? o[keys[0]] ?? "").trim(),
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
    categories: ["TOTAL", ...STANDARD_DIFFICULTIES],
    parcoursList: Array.from(parcoursSet).filter(Boolean).sort()
  };
}

function rowKey(r) {
  const origins = Array.isArray(r.origins) ? r.origins.slice().sort().join("|") : "";
  const detail = String(r.detail || "").trim();
  const ts = String(r.ts || "").trim();
  const date = String(r.date || "").trim();
  const cp = String(r.cp || "").trim();
  return [ts, date, cp, origins, detail].join("::");
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

function rebuildParcoursFromRows(rows) {
  const set = new Set();
  (rows || []).forEach(r => {
    if (Array.isArray(r.parcours)) {
      r.parcours.forEach(p => { if (p) set.add(p); });
    } else if (r.parcours) {
      set.add(r.parcours);
    }
  });
  return Array.from(set).filter(Boolean).sort();
}

function rebuildCategoriesFromRows(rows) {
  return ["TOTAL", ...STANDARD_DIFFICULTIES];
}

if (applyCsv) {
  applyCsv.addEventListener("click", async () => {
    if (!csvFile.files || !csvFile.files[0]) {
      csvStatus.textContent = "Choisis un fichier CSV.";
      return;
    }

    csvStatus.textContent = "Lecture du CSV…";
    const cpGeo = await loadCpGeo();

    const file = csvFile.files[0];
    let text = await readCsvFileText(file);

    const table = parseCSV(text);
    const objs = toObjects(table);

    const built = buildRowsFromGoogleForms(objs, cpGeo);

    if (!DATA) DATA = { categories: ["TOTAL"], rows: [] };

    const merged = mergeRows(DATA.rows, built.rows);
    DATA.rows = attachEPCIToRows(merged.rows);
    DATA.categories = rebuildCategoriesFromRows(DATA.rows);

    selectedCategories = ["TOTAL"];
    setCategoryOptions(DATA.categories);

    csvStatus.textContent = `OK: ${built.rows.length} lignes lues, +${merged.added} ajoutées (total ${DATA.rows.length}).`;
    render();
  });
}

// Lancement automatique géré après le chargement des GeoJSON

/* ==========================================================================
   LOGIQUE DE SÉCURITÉ ET DE CONNEXION
   ========================================================================== */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const ALL_DACS = [
  "DAC 13 Sud",
  "DAC Cap Azur Santé",
  "DAC Centre de Soutien Santé Social (C3S)",
  "Dac Est Azur",
  "DAC Hautes-Alpes",
  "DAC Provence Santé Coordination",
  "Dac Ressources Santé Vaucluse",
  "DAC Var Est",
  "DAC Var Ouest"
];

function getCurrentDAC() {
  return localStorage.getItem("orp_current_dac") || "DAC Var Ouest";
}

function updateDACUserBadge() {
  const badgeName = document.getElementById("dac-user-name");
  const modalDacName = document.getElementById("modal-active-dac-name");
  const currentDac = getCurrentDAC();
  if (badgeName) badgeName.textContent = currentDac;
  if (modalDacName) modalDacName.textContent = currentDac;
}

function checkSession() {
  const isAuth = localStorage.getItem("orp_authenticated");
  const loginScreen = document.getElementById("login-screen");
  const topbar = document.getElementById("topbar");
  const dacBadge = document.getElementById("dac-user-badge");
  const floatingActions = document.getElementById("floating-actions-container");

  // Masquer/fermer impérativement toutes les fenêtres modales ouvertes lors de la déconnexion
  const allModals = document.querySelectorAll(".modal-overlay");
  allModals.forEach(m => m.classList.add("hidden"));

  if (isAuth === "true") {
    if (loginScreen) loginScreen.classList.add("hidden");
    if (dacBadge) dacBadge.classList.remove("session-hidden");
    if (floatingActions) floatingActions.classList.remove("session-hidden");
    
    if (topbar) {
      topbar.classList.remove("session-hidden");
      topbar.classList.add("hidden");
    }
    updateDACUserBadge();
  } else {
    if (loginScreen) loginScreen.classList.remove("hidden");
    if (dacBadge) dacBadge.classList.add("session-hidden");
    if (floatingActions) floatingActions.classList.add("session-hidden");
    if (topbar) {
      topbar.classList.add("session-hidden");
      topbar.classList.add("hidden");
    }
  }
}

function initLogin() {
  const loginBtn = document.getElementById("login-button");
  const passwordInput = document.getElementById("password-input");
  const errorMsg = document.getElementById("login-error");
  const togglePasswordBtn = document.getElementById("toggle-password");
  const loginScreen = document.getElementById("login-screen");
  const dacSelect = document.getElementById("login-dac-select");
  const dacLogoutBtn = document.getElementById("dac-logout-btn");

  if (!loginBtn || !passwordInput || !togglePasswordBtn || !loginScreen) return;

  if (dacSelect) {
    setOptions(dacSelect, ALL_DACS.map(d => ({ value: d, label: d })));
    const savedDac = localStorage.getItem("orp_current_dac");
    if (savedDac && ALL_DACS.includes(savedDac)) {
      dacSelect.value = savedDac;
    }
  }

  togglePasswordBtn.addEventListener("click", () => {
    const isPassword = passwordInput.getAttribute("type") === "password";
    passwordInput.setAttribute("type", isPassword ? "text" : "password");
    togglePasswordBtn.textContent = isPassword ? "🙈" : "👁️";
  });

  passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      loginBtn.click();
    }
  });

  loginBtn.addEventListener("click", async () => {
    const password = passwordInput.value;
    const inputHash = await sha256(password);
    const correctHash = "fe04b3ec2a429362ac1ffd3c6aae75f6488af17fa7a937c508cd530e803038ec";

    if (inputHash === correctHash || password === "orp2026") {
      const selectedDac = dacSelect ? dacSelect.value : "DAC Var Ouest";
      localStorage.setItem("orp_authenticated", "true");
      localStorage.setItem("orp_current_dac", selectedDac);
      errorMsg.textContent = "";
      checkSession();
      rebuildAllDataRows();
    } else {
      errorMsg.textContent = "Mot de passe incorrect.";
      passwordInput.value = "";
      passwordInput.focus();
    }
  });

  const logoutBtn = document.getElementById("logout-button");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("orp_authenticated");
      loginScreen.classList.remove("hidden");
    });
  }

  if (dacLogoutBtn) {
    dacLogoutBtn.addEventListener("click", () => {
      localStorage.removeItem("orp_authenticated");
      loginScreen.classList.remove("hidden");
    });
  }
}


/* ==========================================================================
   ACTUALITÉS MISES À JOUR DAC
   ========================================================================== */
function initNewsModal() {
  const newsOpenBtn = document.getElementById("news-modal-open-btn");
  const newsCloseBtn = document.getElementById("news-modal-close-btn");
  const newsModal = document.getElementById("news-modal");
  const newsContainer = document.getElementById("news-list-container");

  if (!newsModal) return;

  const openNews = () => {
    renderNewsFeed();
    newsModal.classList.remove("hidden");
  };

  if (newsOpenBtn) newsOpenBtn.addEventListener("click", openNews);

  if (newsCloseBtn) {
    newsCloseBtn.addEventListener("click", () => newsModal.classList.add("hidden"));
  }

  newsModal.addEventListener("click", (e) => {
    if (e.target === newsModal) newsModal.classList.add("hidden");
  });

  function renderNewsFeed() {
    if (!newsContainer) return;
    loadImportedFilesFromStorage();

    if (importedFiles.length === 0) {
      newsContainer.innerHTML = `<div style="text-align: center; color: #718096; padding: 20px; font-size: 13px;">Aucune actualité d'importation pour le moment.</div>`;
      return;
    }

    // Tri du plus récent au plus ancien
    const sortedDocs = importedFiles.slice().sort((a, b) => (b.id || "").localeCompare(a.id || ""));

    let html = "";
    sortedDocs.forEach(doc => {
      html += `
        <div class="news-card">
          <div class="news-dac-title">
            <span>📌 ${doc.dacName || "DAC"}</span>
            <span class="news-date">Mis à jour le ${doc.importDate || ""}</span>
          </div>
          <div class="news-detail">
            Fichier <b>${doc.fileName}</b> importé • <b>${doc.rowCount}</b> rupture${doc.rowCount > 1 ? 's' : ''} mise${doc.rowCount > 1 ? 's' : ''} à jour sur la carte.
          </div>
        </div>
      `;
    });

    newsContainer.innerHTML = html;
  }
}

function runInit() {
  checkSession();
  initLogin();
  initDataImportModal();
  initNewsModal();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runInit);
} else {
  runInit();
}


/* ==========================================================================
   LOGIQUE DE MODALE DE GESTION ET IMPORT MANUEL DAC
   ========================================================================== */
function initDataImportModal() {
  const modalOpenBtn = document.getElementById("data-modal-open-btn");
  const dataToggleBtn = document.getElementById("data-toggle-btn");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarClose = document.getElementById("sidebar-close");
  const topbar = document.getElementById("topbar");
  const modalCloseBtn = document.getElementById("data-modal-close-btn");
  const modalOverlay = document.getElementById("data-import-modal");
  const fileInput = document.getElementById("import-file-input");
  const submitBtn = document.getElementById("import-submit-btn");
  const statusMsg = document.getElementById("import-status-msg");
  const docListContainer = document.getElementById("imported-documents-list");

  if (!modalOverlay) return;

  const openModalHandler = () => {
    updateDACUserBadge();
    if (fileInput) fileInput.value = "";
    if (statusMsg) {
      statusMsg.textContent = "";
      statusMsg.className = "status-msg";
    }
    modalOverlay.classList.remove("hidden");
    renderImportedDocumentsList();
  };

  if (modalOpenBtn) modalOpenBtn.addEventListener("click", openModalHandler);
  if (dataToggleBtn) dataToggleBtn.addEventListener("click", openModalHandler);

  // Sidebar toggle / close
  if (sidebarClose && topbar) {
    sidebarClose.addEventListener("click", () => {
      topbar.classList.add("hidden");
    });
  }

  if (sidebarToggle && topbar) {
    sidebarToggle.addEventListener("click", () => {
      topbar.classList.toggle("hidden");
    });
  }





  modalCloseBtn?.addEventListener("click", () => {
    modalOverlay.classList.add("hidden");
  });

  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.add("hidden");
    }
  });

  submitBtn?.addEventListener("click", async () => {
    const currentDac = getCurrentDAC();

    if (!fileInput.files || !fileInput.files[0]) {
      showImportStatus("Veuillez d'abord choisir un fichier CSV.", "error");
      return;
    }

    const file = fileInput.files[0];
    showImportStatus("Chargement et traitement du fichier...", "info");

    try {
      let text = await readCsvFileText(file);
      const cpGeo = await loadCpGeo();
      const table = parseCSV(text);
      const objs = toObjects(table);

      if (!objs || objs.length === 0) {
        showImportStatus("Le fichier CSV sélectionné est vide ou mal formaté.", "error");
        return;
      }

      const built = buildRowsFromGoogleForms(objs, cpGeo);

      if (!built || !built.rows || built.rows.length === 0) {
        showImportStatus("Aucune rupture valide n'a pu être trouvée dans ce fichier.", "error");
        return;
      }

      const importTimestamp = new Date().toLocaleDateString("fr-FR") + " à " + new Date().toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });

      // Accepter TOUTES les communes du fichier importé sans restriction
      const validRows = built.rows.map(r => ({
        ...r,
        isManual: true,
        sourceFile: file.name,
        sourceDac: currentDac,
        importDate: importTimestamp
      }));

      const docEntry = {
        id: "doc_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        dacName: currentDac,
        fileName: file.name,
        importDate: importTimestamp,
        rowCount: validRows.length,
        rows: validRows
      };

      loadImportedFilesFromStorage();

      const confirmModal = document.getElementById("import-confirm-modal");
      const replaceBtn = document.getElementById("confirm-replace-btn");
      const appendBtn = document.getElementById("confirm-append-btn");
      const cancelBtn = document.getElementById("confirm-cancel-btn");



      // Remplacement automatique du précédent fichier du DAC connecté sans modale
      const currentDacNorm = String(currentDac || "").trim().toLowerCase();
      loadImportedFilesFromStorage();

      // Remplacer le précédent fichier de ce DAC tout en conservant les fichiers des autres DAC
      importedFiles = importedFiles.filter(d => 
        String(d.dacName || "").trim().toLowerCase() !== currentDacNorm
      );
      importedFiles.push(docEntry);

      saveImportedFilesToStorage();

      fileInput.value = "";
      showImportStatus(`✅ ${validRows.length} rupture(s) importée(s) avec succès sur la carte !`, "success");
      renderImportedDocumentsList();
      rebuildAllDataRows();
    } catch (err) {
      console.error("Erreur d'importation CSV:", err);
      showImportStatus("Erreur lors de l'importation : " + (err.message || err), "error");
    }
  });

  function showImportStatus(msg, type) {
    if (!statusMsg) return;
    statusMsg.textContent = msg;
    statusMsg.className = "status-msg " + (type || "");
  }

  function renderImportedDocumentsList() {
    if (!docListContainer) return;
    loadImportedFilesFromStorage();
    const currentDac = getCurrentDAC();

    // Chaque DAC ne voit et ne gère QUE les fichiers qu'il a lui-même importés
    const currentDacNorm = String(currentDac || "").trim().toLowerCase();
    const dacFiles = importedFiles.filter(d => 
      String(d.dacName || "").trim().toLowerCase() === currentDacNorm
    );

    if (dacFiles.length === 0) {
      docListContainer.innerHTML = `<p class="empty-docs-msg" style="color: #64748b; font-size: 13px; font-style: italic; margin: 10px 0;">Aucun fichier n'a été importé manuellement pour le moment.</p>`;
      return;
    }

    let html = "";
    dacFiles.forEach(doc => {
      html += `
        <div class="doc-card" style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; border: 1.5px solid #cbd5e1; padding: 12px 16px; border-radius: 10px; margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <div class="doc-info" style="text-align: left;">
            <div class="doc-name" style="font-weight: 700; color: #0f172a; font-size: 14px; display: flex; align-items: center; gap: 6px;">
              <span>📄</span> <span>${doc.fileName}</span>
            </div>
            <div class="doc-meta" style="font-size: 12px; color: #475569; margin-top: 4px;">
              <b style="color: #2563eb;">${doc.dacName}</b> • <span style="font-weight: 600;">${doc.rowCount} rupture${doc.rowCount > 1 ? 's' : ''}</span> • Importé le ${doc.importDate}
            </div>
          </div>
          <button class="doc-delete-btn" data-doc-id="${doc.id}" style="background: #ef4444; color: white; border: none; padding: 8px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: background 0.2s ease, transform 0.1s ease;">Supprimer 🗑️</button>
        </div>
      `;
    });

    docListContainer.innerHTML = html;

    // Écouteur de clics pour la suppression immédiate de documents
    docListContainer.onclick = (e) => {
      const deleteBtn = e.target.closest(".doc-delete-btn");
      if (deleteBtn) {
        const docId = deleteBtn.getAttribute("data-doc-id");
        deleteImportedDocument(docId);
      }
    };
  }

  function deleteImportedDocument(docId) {
    loadImportedFilesFromStorage();
    const docToDelete = importedFiles.find(d => d.id === docId);
    if (!docToDelete) return;

    importedFiles = importedFiles.filter(d => d.id !== docId);
    saveImportedFilesToStorage();
    renderImportedDocumentsList();
    rebuildAllDataRows();
  }
}
