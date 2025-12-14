"use strict";

/**
 * @typedef {"month" | "ytd" | "range" | "prevMonth" | "prevYear" | "custom"} PeriodMode
 * @typedef {Object} PeriodState
 * @property {PeriodMode} mode
 * @property {number} year
 * @property {number} monthFrom
 * @property {number} monthTo
 * @property {boolean} [enabled]
 *
 * @typedef {Object} FiltersState
 * @property {string} department
 * @property {string} doctor
 * @property {string} contractType
 * @property {string} program
 * @property {string} serviceFlag
 * @property {string} paymentMethod
 *
 * @typedef {Object} ViewState
 * @property {string} activeDashboard
 * @property {boolean} doctorsShowAll
 * @property {number} doctorsPage
 * @property {number} doctorsPageSize
 * @property {string | null} selectedDoctor
 * @property {string} doctorSearch
 * @property {number} departmentsPage
 * @property {number} departmentsPageSize
 *
 * @typedef {Object} ServicesState
 * @property {"top" | "all" | "loss"} mode
 * @property {number} page
 *
 * @typedef {Object} PatientsServicesState
 * @property {"top" | "all"} mode
 * @property {number} page
 *
 * @typedef {Object} PatientsFlowState
 * @property {"departments" | "services"} mode
 *
 * @typedef {Object} ScenarioState
 * @property {number} motivationMultiplier
 *
 * @typedef {Object} CostsState
 * @property {"departments" | "services" | "doctors"} mode
 *
 * @typedef {Object} AppState
 * @property {PeriodState} periodA
 * @property {PeriodState} periodB
 * @property {FiltersState} filters
 * @property {ViewState} view
 * @property {ScenarioState} scenario
 * @property {ServicesState} services
 * @property {CostsState} costs
 * @property {PatientsServicesState} patientsServices
 * @property {PatientsFlowState} patientsFlow
 */

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

const MUE_CONFIG = {
  TAXES: {
    PENSION: 0.22,
    FOMS: 0.051,
    FSS: 0.029,
    INJURY: 0.002,
    get TOTAL_RATE() {
      return this.PENSION + this.FOMS + this.FSS + this.INJURY;
    }
  },
  SPLIT: {
    MEDICAL: 0.84,
    ADMIN: 0.16
  },
  COMMISSION: {
    CARD: 0.017,
    CASH: 0.01,
    WIRE: 0.0
  },
  LIMITS: {
    FOT_BUDGET_RATE: 0.6
  }
};

/** @type {AppState} */
const appState = {
  periodA: {
    mode: "month",
    year: currentYear,
    monthFrom: currentMonth,
    monthTo: currentMonth
  },
  periodB: {
    enabled: false,
    mode: "prevMonth",
    year: currentYear - 1,
    monthFrom: currentMonth,
    monthTo: currentMonth
  },
  filters: {
    department: "all",
    doctor: "all",
    contractType: "all",
    program: "all",
    serviceFlag: "all",
    paymentMethod: "all"
  },
  view: {
    activeDashboard: "overview",
    doctorsShowAll: false,
    doctorsPage: 1,
    doctorsPageSize: 50,
    selectedDoctor: null,
    doctorSearch: "",
    departmentsPage: 1,
    departmentsPageSize: 50
  },
  scenario: {
    motivationMultiplier: 1
  },
  services: {
    mode: "top",
    page: 1
  },
  costs: {
    mode: "departments"
  },
  patientsServices: {
    mode: "top",
    page: 1
  },
  patientsFlow: {
    mode: "departments"
  }
};

const hrTableState = {
  rawData: [],
  filteredData: [],
  category: "",
  page: 1,
  pageSize: 10,
  searchTerm: ""
};

const dataState = {
  rawDataRows: [],
  preparedDataRows: [],
  doctorSearchQuery: ""
};

const chartState = {
  overviewChart: null,
  departmentFlowChart: null,
  doctorFlowChart: null,
  clinicWaterfallChart: null,
  clinicCostStructureChart: null,
  motivationChart: null,
  servicesChart: null,
  serviceFlowChart: null,
  costsStructureChart: null,
  motivationDoctorsChart: null,
  patientsFlowChart: null,
  patientsTopServicesChart: null,
  patientsFlowDiagram: null,
  lastDepartmentForChart: null,
  lastDoctorForChart: null,
  departmentsPortfolioChart: null,
  departmentsPortfolioScatterChart: null
};

const costsTableState = {
  page: 1,
  pageSize: 100,
  sortField: "opexShare",
  sortDir: "desc",
  search: "",
  filter: "all"
};

const DEPARTMENT_PORTFOLIO_SEGMENTS = {
  nabogatom: {
    key: "nabogatom",
    label: "На богатом",
    icon: "💎",
    description: "Много работы и много денег. Локомотивы портфеля.",
    colorStart: "#0f766e",
    colorEnd: "#14b8a6"
  },
  virtuoz: {
    key: "virtuoz",
    label: "Виртуозы",
    icon: "🎯",
    description: "Мало объёма, но высокая маржа. Ювелиры.",
    colorStart: "#7c2d12",
    colorEnd: "#f97316"
  },
  stakhanov: {
    key: "stakhanov",
    label: "Стахановцы",
    icon: "🚜",
    description: "Тащат на себе объём, а денег мало.",
    colorStart: "#1d4ed8",
    colorEnd: "#60a5fa"
  },
  sleeping: {
    key: "sleeping",
    label: "Спящая красавица",
    icon: "🛌",
    description: "Ни объёма, ни маржи. Кандидаты на пересборку.",
    colorStart: "#6b21a8",
    colorEnd: "#a855f7"
  }
};

function clampMonth(value) {
  return Math.min(12, Math.max(1, value));
}

function updatePeriod(periodKey, updates) {
  const target = periodKey === "periodB" ? appState.periodB : appState.periodA;
  const allowedModes = ["month", "ytd", "range", "prevMonth", "prevYear", "custom"];
  if (updates.mode && allowedModes.includes(updates.mode)) {
    target.mode = updates.mode;
  }
  if (typeof updates.year === "number") {
    target.year = updates.year;
  }
  if (typeof updates.monthFrom === "number") {
    target.monthFrom = clampMonth(updates.monthFrom);
  }
  if (typeof updates.monthTo === "number") {
    target.monthTo = clampMonth(updates.monthTo);
  }
  if (target.mode === "month") {
    target.monthTo = target.monthFrom;
  }
  if (target.monthFrom > target.monthTo) {
    target.monthFrom = target.monthTo;
  }
  return target;
}

function togglePeriodB(enabled) {
  appState.periodB.enabled = Boolean(enabled);
  return appState.periodB.enabled;
}

function setActiveDashboard(name) {
  if (typeof name === "string" && name.trim()) {
    appState.view.activeDashboard = name;
  }
  return appState.view.activeDashboard;
}

function setDoctorsPage(page) {
  const safePage = Math.max(1, Number(page) || 1);
  appState.view.doctorsPage = safePage;
  return safePage;
}

function setDoctorSearch(query) {
  appState.view.doctorSearch = query || "";
  return appState.view.doctorSearch;
}

function setDoctorsShowAll(value) {
  appState.view.doctorsShowAll = Boolean(value);
  return appState.view.doctorsShowAll;
}

function setServicesMode(mode) {
  const allowed = ["top", "all", "loss"];
  if (allowed.includes(mode)) {
    appState.services.mode = mode;
  }
  return appState.services.mode;
}

function setServicesPage(page) {
  const safePage = Math.max(1, Number(page) || 1);
  appState.services.page = safePage;
  return safePage;
}

function setCostsMode(mode) {
  const allowed = ["departments", "services", "doctors"];
  if (allowed.includes(mode)) {
    appState.costs.mode = mode;
  }
  return appState.costs.mode;
}

function setPatientsServicesMode(mode) {
  const allowed = ["top", "all"];
  if (allowed.includes(mode)) {
    appState.patientsServices.mode = mode;
  }
  return appState.patientsServices.mode;
}

function setPatientsServicesPage(page) {
  const safePage = Math.max(1, Number(page) || 1);
  appState.patientsServices.page = safePage;
  return safePage;
}

function setPatientsFlowMode(mode) {
  const allowed = ["departments", "services"];
  if (allowed.includes(mode)) {
    appState.patientsFlow.mode = mode;
  }
  return appState.patientsFlow.mode;
}

function setDataRows(rawRows, preparedRows) {
  dataState.rawDataRows = Array.isArray(rawRows) ? rawRows : [];
  dataState.preparedDataRows = Array.isArray(preparedRows) ? preparedRows : [];
  return dataState;
}

function resetDataRows() {
  dataState.rawDataRows = [];
  dataState.preparedDataRows = [];
  return dataState;
}

function setCostsTablePage(page) {
  costsTableState.page = Math.max(1, Number(page) || 1);
  return costsTableState.page;
}

export {
  MUE_CONFIG,
  appState,
  hrTableState,
  dataState,
  chartState,
  costsTableState,
  DEPARTMENT_PORTFOLIO_SEGMENTS,
  updatePeriod,
  togglePeriodB,
  setActiveDashboard,
  setDoctorsPage,
  setDoctorSearch,
  setDoctorsShowAll,
  setServicesMode,
  setServicesPage,
  setCostsMode,
  setPatientsServicesMode,
  setPatientsServicesPage,
  setPatientsFlowMode,
  setDataRows,
  resetDataRows,
  setCostsTablePage
};
