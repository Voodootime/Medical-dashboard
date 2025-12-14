/**
 * MUE CONFIGURATION v5.0
 * Единый источник констант и ставок согласно Спецификации.
 */
const MUE_CONFIG = {
  // Налоговые ставки (от ФОТ сдельной части)
  TAXES: {
    PENSION: 0.22,   // 22.0% (ПФР)
    FOMS: 0.051,     // 5.1% (ФОМС)
    FSS: 0.029,      // 2.9% (ФСС)
    INJURY: 0.002,   // 0.2% (Травматизм)
    // Итоговая расчетная ставка: 30.2%
    get TOTAL_RATE() { return this.PENSION + this.FOMS + this.FSS + this.INJURY; }
  },

  // Распределение чистого котла (Net Wage Pool)
  SPLIT: {
    MEDICAL: 0.84,   // 84% - Врачу (ID 56)
    ADMIN: 0.16      // 16% - Клинике/АУП (ID 57)
  },

  // Комиссии эквайринга (входят в себестоимость)
  COMMISSION: {
    CARD: 0.017,     // 1.7%
    CASH: 0.01,      // 1.0% (Инкассация)
    WIRE: 0.00       // 0%
  },

  // Лимиты и стратегические показатели
  LIMITS: {
    FOT_BUDGET_RATE: 0.60 // 60% от Прибыли (ID 44)
  }
};

"use strict";


/**
 * Глобальное состояние приложения.
 */
var appState = {
  periodA: {
    mode: "month",
    year: new Date().getFullYear(),
    monthFrom: new Date().getMonth() + 1,
    monthTo: new Date().getMonth() + 1
  },
  periodB: {
    enabled: false,
    mode: "prevMonth",
    year: new Date().getFullYear() - 1,
    monthFrom: new Date().getMonth() + 1,
    monthTo: new Date().getMonth() + 1
  },
  filters: {
    department: "all",
    doctor: "all",
    contractType: "all",
    program: "all", // <-- НОВОЕ
    serviceFlag: "all",
    paymentMethod: "all"
  },
  view: {
    activeDashboard: "overview",
    doctorsShowAll: false,
    doctorsPage: 1,
    doctorsPageSize: 50,
    selectedDoctor: null,
    doctorSearch: "",           // строка поиска по врачам
    departmentsPage: 1,         // задел под пагинацию отделений
    departmentsPageSize: 50
  },
  scenario: {
    motivationMultiplier: 1
  },
    services: {
    mode: "top", // top | all | loss
    page: 1      // текущая страница при режиме all / loss
  },
  costs: {
    mode: "departments" // departments | services | doctors
  },
  patientsServices: {
    mode: "top", // top | all
    page: 1      // текущая страница для режима "all"
  },
  patientsFlow: {
    mode: "departments" // departments | services
  }
};

// Локальное состояние для таблицы HR Drill-down
var hrTableState = {
  rawData: [],      // Все врачи выбранной категории
  filteredData: [], // Врачи после поиска
  category: "",     // Название категории
  page: 1,
  pageSize: 10,
  searchTerm: ""
};

/**
 * Данные и графики.
 */
var rawDataRows = [];
var preparedDataRows = [];

// Глобальная строка поиска по врачам (для обратной совместимости)
var doctorSearchQuery = "";

var overviewChart = null;
var departmentFlowChart = null;
var doctorFlowChart = null;
var clinicWaterfallChart = null;
var clinicCostStructureChart = null;
var motivationChart = null;
var servicesChart = null;
var serviceFlowChart = null;
var costsStructureChart = null; // график структуры себестоимости
var motivationDoctorsChart = null;
var patientsFlowChart = null; // график потока пациентов по месяцам
var patientsTopServicesChart = null;
var patientsFlowDiagram = null; // Sankey-поток пациентов (Highcharts)
var lastDepartmentForChart = null;
var lastDoctorForChart = null;

var departmentsPortfolioChart = null;

// Состояние для таблицы в разделе Себестоимость
var costsTableState = {
  page: 1,
  pageSize: 100, // Требование: пагинация по 100
  sortField: 'opexShare', // По умолчанию сортируем по вкладу в расходы (ABC)
  sortDir: 'desc',        // От большего к меньшему
  search: '',
  filter: 'all'
};

// Дополнительные графики по отделениям
var departmentsPortfolioChart = null;
var departmentsPortfolioScatterChart = null;

// Конфиг сегментов портфеля отделений с ИКОНКАМИ
var DEPARTMENT_PORTFOLIO_SEGMENTS = {
  nabogatom: {
    key: "nabogatom",
    label: "На богатом",
    icon: "💎", // Алмаз
    description: "Много работы и много денег. Локомотивы портфеля.",
    colorStart: "#0f766e",
    colorEnd: "#14b8a6"
  },
  virtuoz: {
    key: "virtuoz",
    label: "Виртуозы",
    icon: "🎯", // Мишень (точность)
    description: "Мало объёма, но высокая маржа. Ювелиры.",
    colorStart: "#7c2d12",
    colorEnd: "#f97316"
  },
  stakhanov: {
    key: "stakhanov",
    label: "Стахановцы",
    icon: "🚜", // Трактор (пашут)
    description: "Тащат на себе объём, а денег мало.",
    colorStart: "#1d4ed8",
    colorEnd: "#60a5fa"
  },
  sleeping: {
    key: "sleeping",
    label: "Спящая красавица",
    icon: "🛌", // Кровать
    description: "Ни объёма, ни маржи. Кандидаты на пересборку.",
    colorStart: "#6b21a8",
    colorEnd: "#a855f7"
  }
};

function computeMedianValue(values) {
  if (!values || !values.length) return 0;
  var arr = values.slice().sort(function(a,b){return a-b});
  var mid = Math.floor(arr.length/2);
  if (arr.length % 2 !== 0) return arr[mid];
  return (arr[mid-1] + arr[mid]) / 2;
}

/**
 * Классификация отделения по портфелю:
 *  - ось X: доля выручки (много / мало работы),
 *  - ось Y: маржа по методологии (много / мало зарабатывает).
 *
 * Границы high/low считаем по медиане портфеля.
 */
function classifyDepartmentForPortfolio(
  departmentData,
  revenueSharePct,
  medianContext
) {
  var d = departmentData || {};
  var revenue = d.revenue || 0;
  var costFull = d.costFull || 0;

  var profitMethod =
    typeof d.profitMethod === "number" ? d.profitMethod : revenue - costFull;

  var marginMethodPct =
    revenue > 0 ? (profitMethod / revenue) * 100 : 0;

  var med = medianContext || {};
  var medianShare = med.medianRevenueShare || 0;
  var medianMargin = med.medianMargin || 0;

  var worksALot = revenueSharePct >= medianShare; // много / мало работают
  var earnsALot = marginMethodPct >= medianMargin; // много / мало зарабатывают

  if (worksALot && earnsALot) {
    // много работает и много зарабатывает
    return "nabogatom";
  }

  if (!worksALot && earnsALot) {
    // мало работает, много зарабатывает
    return "virtuoz";
  }

  if (worksALot && !earnsALot) {
    // много работает, мало зарабатывает
    return "stakhanovcy";
  }

  // мало работает, мало зарабатывает
  return "spyashchaya";
}

/**
 * Основные KPI по отделениям (выручка, прибыль по методологии, маржа).
 * Обновляет карточки:
 *  - #departments-kpi-revenue
 *  - #departments-kpi-profit-method
 *  - #departments-kpi-margin-method
 */
function updateDepartmentsMainKpi(byDepartment) {
  var revenueEl = document.getElementById("departments-kpi-revenue");
  var profitEl = document.getElementById("departments-kpi-profit-method");
  var marginEl = document.getElementById("departments-kpi-margin-method");

  if (!revenueEl && !profitEl && !marginEl) {
    return;
  }

  if (!byDepartment) {
    if (revenueEl) revenueEl.textContent = formatCurrency(0);
    if (profitEl) profitEl.textContent = formatCurrency(0);
    if (marginEl) marginEl.textContent = formatPercent(0);
    return;
  }

  var names = Object.keys(byDepartment);
  if (names.length === 0) {
    if (revenueEl) revenueEl.textContent = formatCurrency(0);
    if (profitEl) profitEl.textContent = formatCurrency(0);
    if (marginEl) marginEl.textContent = formatPercent(0);
    return;
  }

  var totalRevenue = 0;
  var totalProfitMethod = 0;

  names.forEach(function (name) {
    var d = byDepartment[name] || {};
    var revenue = d.revenue || 0;
    var costFull = d.costFull || 0;
    var profitMethod =
      typeof d.profitMethod === "number"
        ? d.profitMethod
        : revenue - costFull;

    totalRevenue += revenue;
    totalProfitMethod += profitMethod;
  });

  var marginMethodPct =
    totalRevenue > 0 ? (totalProfitMethod / totalRevenue) * 100 : 0;

  if (revenueEl) {
    revenueEl.textContent = formatCurrency(totalRevenue);
  }
  if (profitEl) {
    profitEl.textContent = formatCurrency(totalProfitMethod);
  }
  if (marginEl) {
    marginEl.textContent = formatPercent(marginMethodPct);
  }
}

/**
 * Плагин для подписи значений и долей (%) на flow-барах.
 * Использует chart.$revenue как базу для расчёта долей.
 * Показываем: "1.2 млн (34.5%)"
 */
var flowBarLabelPlugin = {
  id: "flowBarLabel",
  afterDatasetsDraw: function (chart, args, pluginOptions) {
    var opts = pluginOptions || {};
    var revenue = chart.$revenue;
    if (!revenue || revenue <= 0) {
      return;
    }

    var ctx = chart.ctx;
    ctx.save();

    var fontSize = opts.fontSize || 11;
    var fontFamily = opts.fontFamily || "system-ui";
    var color = opts.color || "#0f172a";
    var decimals =
      typeof opts.decimals === "number" ? opts.decimals : 1;
    var minPercent =
      typeof opts.minPercent === "number" ? opts.minPercent : 0;

    ctx.font = fontSize + "px " + fontFamily;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    chart.data.datasets.forEach(function (dataset, datasetIndex) {
      var meta = chart.getDatasetMeta(datasetIndex);
      meta.data.forEach(function (bar, index) {
        var value = dataset.data[index];
        if (!value || value <= 0) {
          return;
        }

        var pct = (value / revenue) * 100;
        if (pct < minPercent) {
          return;
        }

        var props = bar.getProps(["x", "y"], true);
        var shortValue = formatShortCurrency(value);
        var text =
          shortValue + " (" + pct.toFixed(decimals) + "%)";

        ctx.fillText(text, props.x, props.y);
      });
    });

    ctx.restore();
  }
};
var doughnutCenterTextPlugin = {
  id: "doughnutCenterText",
  afterDraw: function (chart, args, options) {
    if (!options || !options.text) return;

    var ctx = chart.ctx;
    var width = chart.width;
    var height = chart.height;

    ctx.save();

    var fontSize = options.fontSize || 18;
    var fontFamily = options.fontFamily || "Inter, system-ui, sans-serif";
    ctx.font = fontSize + "px " + fontFamily;
    ctx.fillStyle = options.color || "#0f172a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    var centerX = width / 2;
    var centerY = height / 2;

    ctx.fillText(options.text, centerX, centerY);

    if (options.subtext) {
      var subFontSize = options.subFontSize || 12;
      ctx.font = subFontSize + "px " + fontFamily;
      ctx.fillStyle = options.subColor || "#6b7280";
      ctx.fillText(options.subtext, centerX, centerY + fontSize * 0.8);
    }

    ctx.restore();
  }
};

/**
 * Инициализация приложения после загрузки DOM.
 */
document.addEventListener("DOMContentLoaded", function () {
  
  // === ГЛОБАЛЬНАЯ НАСТРОЙКА ШРИФТОВ (INTER) ===
  if (typeof Chart !== "undefined") {
    // Устанавливаем семейство шрифтов для ВСЕХ графиков сразу
    Chart.defaults.font.family = "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = "#64748b"; // Цвет подписей осей (Slate-500)
    
    // Настройка заголовков тултипов
    Chart.defaults.plugins.tooltip.titleFont = { 
      family: "'Inter', system-ui, sans-serif", 
      size: 13, 
      weight: '600' 
    };
    // Настройка тела тултипов
    Chart.defaults.plugins.tooltip.bodyFont = { 
      family: "'Inter', system-ui, sans-serif", 
      size: 12 
    };
    
    // Регистрируем плагины (как и было)
    Chart.register(flowBarLabelPlugin, ChartDataLabels, doughnutCenterTextPlugin);
    Chart.defaults.plugins.datalabels.display = false;
  }

  // Сначала инициализируем все контролы
  initializeYearSelects();
  initializePeriodControls();
  initializeTabs();
  initializeFilters();
  // ВАЖНО: initializeDoctorSearch можно больше не вызывать, вместо него — interactions
  // initializeDoctorSearch();  ← если у тебя строка ещё есть — УДАЛИ/ЗАКОММЕНТИРУЙ
  initializeServicesControls();
  initializePatientsServicesControls();
  initializePatientsFlowControls();
  initializeCostsControls();
  initializeCollapsibleCards(); // ← добавить эту строку
  initializeDepartmentsInteractions();
  initializeDoctorsInteractions();
  initializeCostsInteractions(); 
  setupModalHandlers();


  showLoadingState();

  loadData()
    .then(function () {
      populateFilterOptions();
      renderActiveDashboard();
      hideLoadingState();
    })
    .catch(function (error) {
      console.error("Ошибка инициализации дашборда:", error);
      renderActiveDashboard();
      hideLoadingState();
    });
});

/**
 * Загрузка данных из JSON-файла /data/data.json
 * Ожидается: массив объектов, где каждый объект = одна оказанная услуга.
 */
function loadData() {
  return fetch("data/data.json")
    .then(function (response) {
      if (!response.ok) {
        throw new Error(
          "Не удалось загрузить data/data.json: " + response.status
        );
      }
      return response.json();
    })
    .then(function (json) {
      if (!Array.isArray(json)) {
        throw new Error("Файл data/data.json должен содержать массив объектов.");
      }

      rawDataRows = json;
      preparedDataRows = normalizeData(rawDataRows);
      console.log("Загружено строк из JSON:", preparedDataRows.length);
    })
    .catch(function (error) {
      console.error("Ошибка загрузки данных:", error);
      rawDataRows = [];
      preparedDataRows = [];
    });
}

/**
 * Простейший парсер CSV.
 */
function parseCsv(text) {
  var lines = text.split(/\r?\n/).filter(function (line) {
    return line.trim() !== "";
  });

  if (lines.length < 2) {
    return [];
  }

  var headerLine = lines[0];
  var delimiter = headerLine.indexOf(";") !== -1 ? ";" : ",";
  var headers = headerLine.split(delimiter).map(function (h) {
    return h.trim();
  });

  var rows = [];

  for (var i = 1; i < lines.length; i += 1) {
    var line = lines[i].trim();
    if (!line) {
      continue;
    }

    var parts = line.split(delimiter);
    var row = {};

    for (var j = 0; j < headers.length; j += 1) {
      var key = headers[j];
      var value = j < parts.length ? parts[j] : "";
      row[key] = value.trim();
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Нормализация ФИО пациента для ключей:
 * - убираем лишние пробелы
 * - приводим к нижнему регистру
 */
function normalizePatientName(value) {
  if (!value) {
    return "";
  }

  var cleaned = String(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  return cleaned;
}

/**
 * Определение типа договора (нормализация).
 * Возвращает: 'ambulatory' | 'inpatient' | 'daycare' | 'other'
 */
function detectContractType(value) {
  if (!value) {
    return "other";
  }

  var lower = String(value).toLowerCase().trim();

  // Сначала проверяем Дневной стационар, так как в нем есть слово "стационар"
  if (lower.indexOf("дневн") !== -1 || lower.indexOf("day") !== -1) {
    return "daycare";
  }

  // Теперь проверяем Круглосуточный стационар
  if (
    lower.indexOf("стационар") !== -1 ||
    lower.indexOf("госпитал") !== -1 ||
    lower.indexOf("inpatient") !== -1 ||
    lower.indexOf("круглосут") !== -1
  ) {
    return "inpatient";
  }

  // Проверяем Амбулаторный
  if (
    lower.indexOf("амбулат") !== -1 ||
    lower.indexOf("поликлин") !== -1 ||
    lower.indexOf("прием") !== -1 ||
    lower.indexOf("consult") !== -1 ||
    lower.indexOf("ambulatory") !== -1
  ) {
    return "ambulatory";
  }

  // Если ничего не подошло
  return "other";
}

/**
 * Преобразуем Date в строку вида YYYY-MM-DD для ключей.
 */
function toIsoDateKey(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return "";
  }

  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, "0");
  var d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

/**
 * Определение канала продаж (Программы).
 * СТРОГАЯ ЛОГИКА по полю "attachmentType":
 * 1. Содержит "физ" -> Физ.лица (ПМУ с физ.лицом)
 * 2. Содержит "дмс" -> ДМС
 * 3. Остальное -> Корпоративные (ПМУ с юр.лицом)
 */
function getProgramKey(attachmentType, paymentMethod) {
  // paymentMethod игнорируем, смотрим только Тип прикрепления
  var val = String(attachmentType || "").toLowerCase().trim();

  // 1. Физ.лица
  // Ловит: "ПМУ (с физ.лицом)", "физ.лицо", "физическое лицо"
  if (val.indexOf("физ") !== -1) {
    return "phys";
  }

  // 2. ДМС
  // Ловит: "ДМС", "Полис ДМС", "Страховая"
  if (val.indexOf("дмс") !== -1 || val.indexOf("dms") !== -1) {
    return "dms";
  }

  // 3. Юр.лица и прочее (Fallback)
  // Сюда попадет "ПМУ (с юр.лицом)" и пустые значения
  return "corp";
}

/**
 * 2. ECONOMICS ENGINE v9.0 (Direct Costing / Pure Piecework)
 * LOGIC CHANGE:
 * - We act on the fact that Fixed Labor is NORMATIVE (theoretical), not actual.
 * - Actual P&L = Revenue - (Real OpEx) - (Piecework).
 * - "costFull42" now represents REAL OpEx only.
 * - Normative labor is stored separately for pricing analysis but excluded from Net Profit.
 */
function calculateRowEconomics(row) {
  const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

  const revenue = row.amountPaid || 0; 

  // --- 1. REAL OPEX (Операционные расходы) ---
  
  // Комиссия
  let commission = row.commission39;
  if (commission === null || commission === undefined) {
    const method = (row.paymentMethod || "").toLowerCase();
    if (method.includes('card') || method.includes('карт') || method.includes('эквайринг')) {
      commission = revenue * MUE_CONFIG.COMMISSION.CARD;
    } else if (method.includes('cash') || method.includes('нал')) {
      commission = revenue * MUE_CONFIG.COMMISSION.CASH;
    } else {
      commission = MUE_CONFIG.COMMISSION.WIRE;
    }
  }
  commission = round2(commission);

  const costDirect = round2(row.costDirect38 || 0);
  const vatInternal = round2(row.vatService12 || 0);
  const external = round2(row.externalPrice || 0);
  const externalVat = round2(row.externalVat || 0);

  // REAL COST BASE (Только то, что ушло со счета)
  const costOpEx = round2(costDirect + commission + external + externalVat + vatInternal);

  // --- 2. NORMATIVE LABOR (Справочно для ценообразования) ---
  const laborNormative = round2((row.laborCost || 0) + (row.socialChargesTech || 0));
  
  // --- 3. P&L CALCULATION (Direct Costing) ---
  
  // Для фин.учета "Полная себестоимость" = OpEx
  const costBasisSRS = costOpEx; 

  // Маржинальная прибыль (База для ФОТ)
  // Теперь она ВЫШЕ, так как мы не вычитаем виртуальный оклад
  const profitMethod = round2(revenue - costBasisSRS);
  
  // --- 4. WAGE ENGINE (Мотивация) ---
  
  let pieceworkBase = 0;
  const flag = (row.serviceFlag || "").toLowerCase();
  
  if (flag.includes("прием")) {
      pieceworkBase = revenue;
  } else {
      // База теперь больше, но это правильно, т.к. "оклада" нет
      pieceworkBase = Math.max(0, profitMethod); 
  }

  let pieceworkAmount = row.pieceworkAmount; 
  if (pieceworkAmount === null || pieceworkAmount === undefined) {
      const rate = row.pieceworkRate || 0;
      pieceworkAmount = round2(pieceworkBase * (rate / 100));
  }

  // --- 5. TAXES & NET PAY ---
  const taxDivisor = 1 + MUE_CONFIG.TAXES.TOTAL_RATE;
  
  const taxPension = round2((pieceworkAmount * MUE_CONFIG.TAXES.PENSION) / taxDivisor);
  const taxFoms = round2((pieceworkAmount * MUE_CONFIG.TAXES.FOMS) / taxDivisor);
  const taxFss = round2((pieceworkAmount * MUE_CONFIG.TAXES.FSS) / taxDivisor);
  const taxInjury = round2((pieceworkAmount * MUE_CONFIG.TAXES.INJURY) / taxDivisor);
  const socialChargesTotal = round2(taxPension + taxFoms + taxFss + taxInjury);

  const netWagePool = round2(pieceworkAmount - socialChargesTotal);
  const shareMedical = round2(netWagePool * MUE_CONFIG.SPLIT.MEDICAL);
  const shareAdmin = round2(netWagePool * MUE_CONFIG.SPLIT.ADMIN);
  const payFinalMed = round2(shareMedical - (row.deductionHospital || 0) - (row.deductionFood || 0));

  // --- 6. BUDGETING ---
  // Лимит 60% теперь берется от бОльшей суммы, дефицит должен исчезнуть
  const fundLimit = round2(Math.max(0, profitMethod * MUE_CONFIG.LIMITS.FOT_BUDGET_RATE));
  const reserveFund = round2(fundLimit - pieceworkAmount);

  // --- 7. BOTTOM LINE ---
  const netProfitFinal = round2(profitMethod - pieceworkAmount);

  return {
    // Components
    costDirect38: costDirect,
    commission39: commission,
    
    // Aggregates for Charts
    costNoWages: costDirect, 
    costCommission: commission,
    costExternal: round2(external + externalVat),
    costLaborNormative: laborNormative, // Новое поле для аналитики цен
    
    // Core Metrics (Direct Costing)
    costFull42: costBasisSRS,       // = OpEx
    profitMethod43: profitMethod,   // = Revenue - OpEx
    
    pieceworkAmount: pieceworkAmount,
    
    // Wages
    socialChargesTotal: socialChargesTotal, 
    taxPension: taxPension, taxFoms: taxFoms, taxFss: taxFss, taxInjury: taxInjury,
    netWagePool: netWagePool, 
    shareMedical: shareMedical, shareAdmin: shareAdmin,
    payFinalMed: payFinalMed,
    
    // Budget
    fundLimit: fundLimit,
    reserveFund: reserveFund,
    
    netProfitFinal: netProfitFinal  
  };
}

/**
 * 3. DATA NORMALIZER v5.1 (Fix: Patient Count)
 */
function normalizeData(rawRows) {
  if (!Array.isArray(rawRows)) return [];

  return rawRows.map(row => {
    const getVal = (keys, type = 'string') => {
      let val = undefined;
      for (const k of keys) { if (row[k] !== undefined && row[k] !== null && row[k] !== "") { val = row[k]; break; } }
      if (val === undefined) return null;
      if (type === 'float') return parseFloat(String(val).replace(/\s/g, '').replace(',', '.')) || 0;
      if (type === 'int') return parseInt(String(val).replace(/\s/g, ''), 10) || 0;
      if (type === 'date') return parseDate(val);
      return String(val).trim();
    };

    const baseData = {
      // Мета
      serviceDate: getVal(['serviceDate', 'Дата оказания', 'service_date'], 'date'),
      department: getVal(['department', 'Отделение']),
      doctor: getVal(['doctor', 'Исполнитель']),
      serviceName: getVal(['serviceName', 'Услуга']),
      serviceCode: getVal(['serviceCode', 'Код услуги']),
      // Финансы
      amountPaid: getVal(['amountPaid', 'Оплачено'], 'float'),
      quantity: getVal(['quantity', 'Кол-во'], 'int') || 1,
      // Логика
      pieceworkRate: getVal(['pieceworkRate', 'Сдельная ставка, %', 'bonus_rate'], 'float'),
      serviceFlag: getVal(['serviceFlag', 'Признак услуги']),
      paymentMethod: getVal(['paymentMethod', 'Способ оплаты']),
      attachmentType: getVal(['attachmentType', 'Тип прикрепления']),
      contractType: getVal(['contractType', 'Вид договора']),
      // Затраты
      costDirect38: getVal(['costDirect38', 'Итого прямые'], 'float'),
      costFull42: getVal(['costFull42', 'Полная себестоимость'], 'float'),
      // Зарплата
      laborCost: getVal(['laborCost', 'ФОТ (база)'], 'float'),
      socialChargesTech: getVal(['socialChargesTech', 'Начисл. на ФОТ'], 'float'),
      pieceworkAmount: getVal(['pieceworkAmount', 'ФОТ врача (сдельная часть, начислено)'], 'float'),
      // Налоги и Прибыль
      commission39: getVal(['commission39', 'Комиссия'], 'float'),
      profitMethod43: getVal(['profitMethod43', 'Прибыль'], 'float'),
      // Пациент
      patientName: getVal(['patientName', 'ФИО пациента']),
      birthDate: getVal(['birthDate', 'Дата рождения'], 'date'),
      // Внешние
      externalPrice: getVal(['externalPrice', 'Внешние услуги'], 'float'),
      externalVat: getVal(['externalVat', 'НДС внешний'], 'float'),
      vatService12: getVal(['vatService12', 'НДС'], 'float'),
      raw: row
    };

    if (baseData.serviceDate) {
      baseData.serviceYear = baseData.serviceDate.getFullYear();
      baseData.serviceMonth = baseData.serviceDate.getMonth() + 1;
    }
    
    baseData.programKey = getProgramKey(baseData.attachmentType, baseData.paymentMethod); 
    baseData.contractTypeKey = detectContractType(baseData.contractType); 
    
    // FIX: Создаем ключ пациента даже если нет Даты Рождения
    if (baseData.patientName) {
      const normName = normalizePatientName(baseData.patientName);
      // Если даты нет, используем техническую дату, чтобы не терять пациента
      const normDate = baseData.birthDate ? toIsoDateKey(baseData.birthDate) : "0000-00-00";
      baseData.patientKey = normName + "|" + normDate;
      
      if (baseData.serviceDate) {
        baseData.visitKey = baseData.patientKey + "|" + toIsoDateKey(baseData.serviceDate);
      }
    }

    const economics = calculateRowEconomics(baseData);
    return { ...baseData, ...economics };
  });
}

/**
 * Парсер дат (YYYY-MM-DD или DD.MM.YYYY).
 */
function parseDate(dateString) {
  if (!dateString) {
    return null;
  }

  var value = String(dateString).trim();
  if (!value) {
    return null;
  }

  if (value.indexOf("-") !== -1) {
    var partsIso = value.split("-");
    if (partsIso.length >= 3) {
      var yearIso = parseInt(partsIso[0], 10);
      var monthIso = parseInt(partsIso[1], 10) - 1;
      var dayIso = parseInt(partsIso[2], 10);
      return new Date(yearIso, monthIso, dayIso);
    }
  }

  if (value.indexOf(".") !== -1) {
    var partsRu = value.split(".");
    if (partsRu.length >= 3) {
      var dayRu = parseInt(partsRu[0], 10);
      var monthRu = parseInt(partsRu[1], 10) - 1;
      var yearRu = parseInt(partsRu[2], 10);
      return new Date(yearRu, monthRu, dayRu);
    }
  }

  return null;
}

/**
 * Парсер чисел.
 */
function parseNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  var cleaned = String(value)
    .replace(/\s+/g, "")
    .replace(",", ".");
  var number = Number(cleaned);
  if (isNaN(number)) {
    return 0;
  }
  return number;
}

/**
 * Модалки.
 */
function setupModalHandlers() {
  document.addEventListener("click", function (event) {
    var target = event.target;
    if (target.matches("[data-modal-close]")) {
      var modal = target.closest(".modal");
      if (modal) {
        modal.classList.remove("modal--open");
        modal.setAttribute("aria-hidden", "true");
      }
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" || event.key === "Esc") {
      var openModals = document.querySelectorAll(
        ".modal.modal--open"
      );
      openModals.forEach(function (modal) {
        modal.classList.remove("modal--open");
        modal.setAttribute("aria-hidden", "true");
      });
    }
  });
}

/**
 * Открытие модалки с детализацией затрат клиники.
 * Показывает:
 * - операционные блоки затрат (мед.затраты, комиссии, внешние услуги, ФОТ, мотивация)
 * - плюс агрегаты по методологии: ФОТ по техкартам (31+32), НДС (12), полная себестоимость (42), прибыль (43).
 */
function openClinicCostsModal(metrics) {
  var modal = document.getElementById("clinic-costs-modal");
  var tbody = document.getElementById("clinic-costs-modal-body");
  if (!modal || !tbody || !metrics) {
    return;
  }

  tbody.innerHTML = "";

  var revenue = metrics.totalRevenue || 0;

  if (revenue <= 0) {
    var rowEmpty = document.createElement("tr");
    var cellEmpty = document.createElement("td");
    cellEmpty.colSpan = 3;
    cellEmpty.textContent = "Нет выручки за выбранный период.";
    cellEmpty.className = "muted";
    rowEmpty.appendChild(cellEmpty);
    tbody.appendChild(rowEmpty);
  } else {
    // Операционные блоки (как и раньше)
    var costNoWages = metrics.totalCostNoWages || 0;       // 38
    var costCommission = metrics.totalCostCommission || 0; // 39
    var costExternal = metrics.totalCostExternal || 0;     // 40+41
    var wagesFull = metrics.totalWagesFullBase || 0;       // базовый ФОТ (факт)
    var motivation =
      (metrics.totalpieceworkAmount || 0) +
      (metrics.totalSocialCharges || 0);                   // мотивация + соц.отчисления

    // Новые агрегаты по методологии
    var fotPlan = metrics.totalFotPlan || 0;               // 31+32 (опл_труда + начисл_на_опл_тр)
    var vatService = metrics.totalVatService || 0;         // 12 (НДС по услугам)
    var fullCost = metrics.totalCostFull || 0;             // 42 (полная себестоимость)
    var profitMethod = metrics.totalProfitMethod || 0;     // 43 (прибыль по методологии)

    // --- 1. Основные операционные статьи затрат (как и раньше) ---
    var items = [
      {
        label: "Мед.затраты и прочие без ФОТ",
        value: costNoWages
      },
      {
        label: "Комиссии (банки, эквайринг)",
        value: costCommission
      },
      {
        label: "Внешние услуги",
        value: costExternal
      },
      {
        label: "Базовый ФОТ",
        value: wagesFull
      },
      {
        label: "Мотивация и соц.отчисления",
        value: motivation
      }
    ];

    // --- 2. Строки по методологии (31–43) ---
    var methodItems = [
      {
        label: "ФОТ по техкартам (31+32)",
        value: fotPlan
      },
      {
        label: "НДС по услугам (12)",
        value: vatService
      },
      {
        label: "Полная себестоимость по методологии (42)",
        value: fullCost
      },
      {
        label: "Прибыль по методологии (43)",
        value: profitMethod
      }
    ];

    // Рендер операционных статей
    items.forEach(function (item) {
      var tr = document.createElement("tr");

      var tdLabel = document.createElement("td");
      tdLabel.textContent = item.label;
      tr.appendChild(tdLabel);

      var tdValue = document.createElement("td");
      tdValue.className = "align-right";
      tdValue.textContent = formatCurrency(item.value);
      tr.appendChild(tdValue);

      var tdShare = document.createElement("td");
      tdShare.className = "align-right";
      var share = revenue > 0 ? (item.value / revenue) * 100 : 0;
      tdShare.textContent = formatPercent(share);
      tr.appendChild(tdShare);

      tbody.appendChild(tr);
    });

    // Небольшой визуальный разделитель перед методологией
    var sepRow = document.createElement("tr");
    var sepCell = document.createElement("td");
    sepCell.colSpan = 3;
    sepCell.className = "muted";
    sepCell.textContent = "Показатели по методологии (31–43):";
    sepRow.appendChild(sepCell);
    tbody.appendChild(sepRow);

    // Рендер строк по методологии (ФОТ техкарт, НДС, полная себестоимость, прибыль)
    methodItems.forEach(function (item) {
      var tr = document.createElement("tr");

      var tdLabel = document.createElement("td");
      tdLabel.textContent = item.label;
      tr.appendChild(tdLabel);

      var tdValue = document.createElement("td");
      tdValue.className = "align-right";
      tdValue.textContent = formatCurrency(item.value);
      tr.appendChild(tdValue);

      var tdShare = document.createElement("td");
      tdShare.className = "align-right";
      var share = revenue > 0 ? (item.value / revenue) * 100 : 0;
      tdShare.textContent = formatPercent(share);
      tr.appendChild(tdShare);

      tbody.appendChild(tr);
    });
  }

  // Открываем модалку (оставляем текущую механику)
  modal.classList.add("modal--open");
  modal.setAttribute("aria-hidden", "false");
}

/**
 * SERVICE DETAILS MODAL (Обновленная версия: Сравнение себестоимости врачей)
 */
function openServiceDetailsModal(serviceCode, serviceName) {
  // 1. Проверка данных
  if (!preparedDataRows || preparedDataRows.length === 0) return;

  var modal = document.getElementById("service-details-modal");
  if (!modal) return;

  // 2. Ищем элементы
  var captionEl = document.getElementById("service-details-caption");
  var depBody = document.getElementById("service-details-departments-body");
  var docBody = document.getElementById("service-details-doctors-body");
  var chartWrapper = modal.querySelector('.modal-flow-wrapper') || modal.querySelector('.chart-wrapper');

  if (!chartWrapper) {
      var canvasEl = document.getElementById("service-details-flow-chart");
      if (canvasEl) chartWrapper = canvasEl.parentElement;
  }

  if (!captionEl || !depBody || !docBody || !chartWrapper) return;

  var titleEl = document.getElementById("service-details-title");
  if (titleEl) titleEl.textContent = "Детализация: " + (serviceName || "Услуга");

  // 3. Фильтрация данных
  var filtered = applyFilters(preparedDataRows, appState.filters);
  var periodRows = filterRowsByPeriod(filtered, appState.periodA);

  var serviceRows = periodRows.filter(function (row) {
    return (row.serviceCode === serviceCode) || (row.serviceName === serviceName);
  });

  // === ОТКРЫТИЕ МОДАЛКИ ===
  modal.classList.add("modal--open");
  modal.setAttribute("aria-hidden", "false");

  // 4. Обработка "Нет данных"
  if (serviceRows.length === 0) {
    captionEl.textContent = "Нет данных по выбранной услуге за текущий период.";
    depBody.innerHTML = ""; 
    docBody.innerHTML = "";
    if (serviceFlowChart) { serviceFlowChart.destroy(); serviceFlowChart = null; }
    chartWrapper.innerHTML = ""; 
    return;
  }

  // 5. Расчеты (Добавили сбор OpEx по врачам)
  var totalCount = 0;
  var totalRevenue = 0;
  var sumMat = 0, sumComm = 0, sumExt = 0, sumFotPiecework = 0, sumProfit = 0;
  
  var byDepartment = {};
  var byDoctor = {};

  serviceRows.forEach(function (row) {
    var qty = row.quantity || 1;
    var rev = row.amountPaid || 0;
    // Берем полный OpEx из строки (42 колонка в исходнике)
    var opex = row.costFull42 || 0; 
    
    totalCount += qty;
    totalRevenue += rev;
    sumMat += (row.costDirect38 || 0);
    sumComm += (row.commission39 || 0);
    sumExt += ((row.externalPrice||0) + (row.externalVat||0));
    sumFotPiecework += ((row.pieceworkAmount || 0) + (row.socialChargesTotal || 0));
    sumProfit += row.netProfitFinal; 

    var dep = row.department || "Не указано";
    var doc = row.doctor || "Не указано";

    // Агрегация по Отделениям
    if (!byDepartment[dep]) byDepartment[dep] = { count: 0, revenue: 0, profit: 0 };
    byDepartment[dep].count += qty;
    byDepartment[dep].revenue += rev;
    byDepartment[dep].profit += row.netProfitFinal;

    // Агрегация по Врачам (Добавляем opex)
    if (!byDoctor[doc]) byDoctor[doc] = { count: 0, revenue: 0, profit: 0, opex: 0 };
    byDoctor[doc].count += qty;
    byDoctor[doc].revenue += rev;
    byDoctor[doc].profit += row.netProfitFinal;
    byDoctor[doc].opex += opex; 
  });

  var avgPrice = totalCount > 0 ? totalRevenue / totalCount : 0;
  var avgProfit = totalCount > 0 ? sumProfit / totalCount : 0;
  var avgCost = avgPrice - avgProfit; 
  var rentability = totalRevenue > 0 ? (sumProfit / totalRevenue * 100) : 0;

  // 6. Обновление заголовка
  var fontSpec = "Inter, system-ui, sans-serif";
  var profitColor = avgProfit >= 0 ? "#0abab5" : "#ef4444";
  
  captionEl.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:24px; margin-bottom:16px; font-family:${fontSpec}; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
      <div><div style="font-size:11px; color:#64748b;">Средний чек</div><div style="font-size:16px; font-weight:600; color:#0f172a;">${formatCurrency(avgPrice)}</div></div>
      <div><div style="font-size:11px; color:#64748b;">Себестоимость ед.</div><div style="font-size:16px; font-weight:500; color:#64748b;">${formatCurrency(avgCost)}</div></div>
      <div><div style="font-size:11px; color:#64748b;">Прибыль с 1 шт.</div><div style="font-size:16px; font-weight:700; color:${profitColor};">${formatCurrency(avgProfit)}</div></div>
      <div><div style="font-size:11px; color:#64748b;">Рентабельность</div><div style="font-size:16px; font-weight:600; color:${rentability>=30?'#10b981':(rentability>0?'#0f172a':'#ef4444')}">${formatPercent(rentability)}</div></div>
      <div style="margin-left:auto; text-align:right;"><div style="font-size:11px; color:#64748b;">Всего оказано</div><div style="font-size:16px; color:#0f172a;">${totalCount.toLocaleString("ru-RU")} раз</div></div>
    </div>
  `;

  // 7. Обновление таблиц (Внутренняя функция рендера)
  var fontStyle = `font-family: ${fontSpec}; font-size:11px;`;

  function renderMiniTable(tbodyEl, map, isDoctorTable = false) {
    if (!tbodyEl) return;

    var keys = Object.keys(map || {});
    if (keys.length === 0) {
      tbodyEl.innerHTML = `<tr><td colspan="5" class="muted">Нет данных</td></tr>`;
      return;
    }

    // Динамическое обновление заголовка для таблицы врачей
    if (isDoctorTable) {
        const table = tbodyEl.closest('table');
        if(table) {
            const thead = table.querySelector('thead tr');
            if(thead) {
                thead.innerHTML = `
                  <th style="color:#64748b; font-size:11px;">Врач</th>
                  <th class="align-right" style="color:#64748b; font-size:11px;">Кол-во</th>
                  <th class="align-right" style="color:#64748b; font-size:11px;" title="OpEx на 1 услугу">Себест. ед.</th>
                  <th class="align-right" style="color:#64748b; font-size:11px;">Выручка</th>
                  <th class="align-right" style="color:#64748b; font-size:11px;">Прибыль</th>
                `;
            }
        }
    }

    // Сортировка по выручке
    var rowsHTML = keys
      .sort(function (a, b) { return (map[b].revenue || 0) - (map[a].revenue || 0); })
      .slice(0, 10)
      .map(function (name) {
        var d = map[name] || { count: 0, revenue: 0, profit: 0, opex: 0 };
        var pColor = d.profit >= 0 ? "#0abab5" : "#ef4444";
        
        // Расчет удельной себестоимости (Variance Analysis)
        var unitCost = d.count > 0 ? (d.opex / d.count) : 0;

        if (isDoctorTable) {
            return `
              <tr>
                <td style="${fontStyle} font-weight:500; color:#0f172a">${name}</td>
                <td class="align-right" style="${fontStyle}">${d.count}</td>
                <td class="align-right" style="${fontStyle} color:#64748b; font-weight:600;">${formatCurrency(unitCost)}</td>
                <td class="align-right" style="${fontStyle}">${formatShortCurrency(d.revenue)}</td>
                <td class="align-right" style="${fontStyle} font-weight:600; color:${pColor}">${formatShortCurrency(d.profit)}</td>
              </tr>
            `;
        }

        // Стандартный вывод для отделений
        return `
          <tr>
            <td style="${fontStyle} font-weight:500; color:#0f172a">${name}</td>
            <td class="align-right" style="${fontStyle}">${d.count}</td>
            <td class="align-right" style="${fontStyle}">${formatShortCurrency(d.revenue)}</td>
            <td class="align-right" style="${fontStyle} font-weight:600; color:${pColor}">${formatShortCurrency(d.profit)}</td>
          </tr>
        `;
      })
      .join("");

    tbodyEl.innerHTML = rowsHTML;
  }

  renderMiniTable(depBody, byDepartment, false);
  renderMiniTable(docBody, byDoctor, true); // Включаем режим Врачей

  // 8. ОТРИСОВКА ГРАФИКА
  if (serviceFlowChart) {
      serviceFlowChart.destroy();
      serviceFlowChart = null;
  }

  chartWrapper.innerHTML = '';
  var newCanvas = document.createElement('canvas');
  newCanvas.id = 'service-details-flow-chart'; 
  newCanvas.style.width = '100%';
  newCanvas.style.height = '100%';
  chartWrapper.appendChild(newCanvas);

  try {
      var ctx = newCanvas.getContext("2d");
      var gMat = createChartGradient(ctx, "#64748b", "#94a3b8");   
      var gComm = createChartGradient(ctx, "#6366f1", "#818cf8");  
      var gExt = createChartGradient(ctx, "#0ea5e9", "#38bdf8");   
      var gFot = createChartGradient(ctx, "#f97316", "#fb923c");   
      var gProf = sumProfit >= 0 ? createChartGradient(ctx, "#0abab5", "#2dd4bf") : createChartGradient(ctx, "#ef4444", "#f87171");        

      serviceFlowChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: ["Экономика услуги"], 
          datasets: [
            { label: "Материалы (OpEx)", data: [sumMat], backgroundColor: gMat, stack: "s1", borderRadius:{topLeft:8, bottomLeft:8} },
            { label: "Комиссии", data: [sumComm], backgroundColor: gComm, stack: "s1" },
            { label: "Внешние услуги", data: [sumExt], backgroundColor: gExt, stack: "s1" },
            { label: "ФОТ Сделка", data: [sumFotPiecework], backgroundColor: gFot, stack: "s1" },
            { label: "Чистая прибыль", data: [sumProfit], backgroundColor: gProf, stack: "s1", borderRadius:{topRight:8, bottomRight:8} }
          ]
        },
        options: {
          indexAxis: "y",
          responsive: true, maintainAspectRatio: false,
          barPercentage: 0.6, 
          scales: { x: { stacked: true, display:false }, y: { stacked: true, display:false } },
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true, font: { family: fontSpec, size: 11 }, color: "#475569", padding: 20 } },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              titleFont: { family: fontSpec }, bodyFont: { family: fontSpec },
              callbacks: {
                label: function (ctx) {
                  var val = ctx.raw;
                  var pct = totalRevenue > 0 ? (val / totalRevenue * 100).toFixed(1) + "%" : "0%";
                  return `${ctx.dataset.label}: ${formatCurrency(val)} (${pct})`;
                }
              }
            },
            flowBarLabel: { minPercent: 5, color: "#fff", fontFamily: fontSpec, formatter: (v) => formatShortCurrency(v) }
          }
        }
      });
      serviceFlowChart.$revenue = totalRevenue; 
  } catch (err) {
      console.error("График не смог нарисоваться:", err);
  }
}

/**
 * Заполняем селекты годов для периодов A и B.
 */
function initializeYearSelects() {
  var currentYear = new Date().getFullYear();
  var startYear = currentYear - 5;
  var endYear = currentYear + 1;

  var periodAYearSelect = document.getElementById("period-a-year");
  var periodBYearSelect = document.getElementById("period-b-year");

  if (!periodAYearSelect || !periodBYearSelect) {
    return;
  }

  for (var year = startYear; year <= endYear; year += 1) {
    var optionA = document.createElement("option");
    optionA.value = String(year);
    optionA.textContent = String(year);
    if (year === appState.periodA.year) {
      optionA.selected = true;
    }
    periodAYearSelect.appendChild(optionA);

    var optionB = document.createElement("option");
    optionB.value = String(year);
    optionB.textContent = String(year);
    if (year === appState.periodB.year) {
      optionB.selected = true;
    }
    periodBYearSelect.appendChild(optionB);
  }
}

/**
 * Логика переключения режимов периодов и сравнения.
 */
function initializePeriodControls() {
  var periodAModeSelect = document.getElementById("period-a-mode");
  var periodAMonthFromSelect = document.getElementById(
    "period-a-month-from"
  );
  var periodAMonthToSelect = document.getElementById(
    "period-a-month-to"
  );
  var compareToggle = document.getElementById("compare-toggle");
  var periodBModeSelect = document.getElementById("period-b-mode");
  var periodBCustomBlock = document.getElementById("period-b-custom");
  var periodBArea = document.getElementById("period-b-body");

  if (periodAModeSelect) {
    periodAModeSelect.addEventListener("change", function () {
      var mode = periodAModeSelect.value;
      appState.periodA.mode = mode;
      updatePeriodAVisibility();
      renderActiveDashboard();
    });
  }

  if (periodAMonthFromSelect) {
    periodAMonthFromSelect.value = String(
      appState.periodA.monthFrom
    );
    periodAMonthFromSelect.addEventListener("change", function () {
      var value = parseInt(periodAMonthFromSelect.value, 10);
      appState.periodA.monthFrom = value;
      if (appState.periodA.mode === "month") {
        appState.periodA.monthTo = value;
        if (periodAMonthToSelect) {
          periodAMonthToSelect.value = String(value);
        }
      }
      renderActiveDashboard();
    });
  }

  if (periodAMonthToSelect) {
    periodAMonthToSelect.value = String(appState.periodA.monthTo);
    periodAMonthToSelect.addEventListener("change", function () {
      var value = parseInt(periodAMonthToSelect.value, 10);
      appState.periodA.monthTo = value;
      renderActiveDashboard();
    });
  }

  var periodAYearSelect = document.getElementById("period-a-year");
  if (periodAYearSelect) {
    periodAYearSelect.addEventListener("change", function () {
      var value = parseInt(periodAYearSelect.value, 10);
      appState.periodA.year = value;
      renderActiveDashboard();
    });
  }

  if (compareToggle && periodBArea) {
    compareToggle.checked = appState.periodB.enabled;
    periodBArea.setAttribute(
      "aria-hidden",
      appState.periodB.enabled ? "false" : "true"
    );
    if (!appState.periodB.enabled) {
      periodBArea.classList.add("hidden");
    }

    compareToggle.addEventListener("change", function () {
      appState.periodB.enabled = compareToggle.checked;
      if (appState.periodB.enabled) {
        periodBArea.classList.remove("hidden");
        periodBArea.setAttribute("aria-hidden", "false");
      } else {
        periodBArea.classList.add("hidden");
        periodBArea.setAttribute("aria-hidden", "true");
      }
      renderActiveDashboard();
    });
  }

  if (periodBModeSelect && periodBCustomBlock) {
    periodBModeSelect.addEventListener("change", function () {
      var mode = periodBModeSelect.value;
      appState.periodB.mode = mode;
      if (mode === "custom") {
        periodBCustomBlock.classList.remove("hidden");
      } else {
        periodBCustomBlock.classList.add("hidden");
      }
      renderActiveDashboard();
    });
  }

  var periodBYearSelect = document.getElementById("period-b-year");
  var periodBMonthFromSelect = document.getElementById(
    "period-b-month-from"
  );
  var periodBMonthToSelect = document.getElementById(
    "period-b-month-to"
  );

  if (periodBYearSelect) {
    periodBYearSelect.addEventListener("change", function () {
      var value = parseInt(periodBYearSelect.value, 10);
      appState.periodB.year = value;
      renderActiveDashboard();
    });
  }

  if (periodBMonthFromSelect) {
    periodBMonthFromSelect.addEventListener("change", function () {
      var value = parseInt(periodBMonthFromSelect.value, 10);
      appState.periodB.monthFrom = value;
      renderActiveDashboard();
    });
  }

  if (periodBMonthToSelect) {
    periodBMonthToSelect.addEventListener("change", function () {
      var value = parseInt(periodBMonthToSelect.value, 10);
      appState.periodB.monthTo = value;
      renderActiveDashboard();
    });
  }

  updatePeriodAVisibility();
}

/**
 * Управление видимостью полей периода A.
 */
function updatePeriodAVisibility() {
  var mode = appState.periodA.mode;
  var fromGroup = document.querySelector(
    '[data-period-a-field="monthFrom"]'
  );
  var toGroup = document.querySelector(
    '[data-period-a-field="monthTo"]'
  );

  if (!fromGroup || !toGroup) {
    return;
  }

  if (mode === "month") {
    fromGroup.style.display = "flex";
    toGroup.style.display = "none";
  } else if (mode === "ytd") {
    fromGroup.style.display = "none";
    toGroup.style.display = "flex";
  } else if (mode === "range") {
    fromGroup.style.display = "flex";
    toGroup.style.display = "flex";
  }
}

/**
 * Вкладки.
 */
function initializeTabs() {
  var tabButtons = document.querySelectorAll(".tabs__button");

  tabButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var tabName = button.getAttribute("data-tab");
      if (!tabName || tabName === appState.view.activeDashboard) {
        return;
      }

      appState.view.activeDashboard = tabName;
      updateActiveTabButton();
      updateActiveDashboard();
      renderActiveDashboard();
    });
  });

  updateActiveTabButton();
  updateActiveDashboard();
}

function updateActiveTabButton() {
  var tabButtons = document.querySelectorAll(".tabs__button");
  tabButtons.forEach(function (button) {
    var tabName = button.getAttribute("data-tab");
    if (tabName === appState.view.activeDashboard) {
      button.classList.add("tabs__button--active");
    } else {
      button.classList.remove("tabs__button--active");
    }
  });
}

function updateActiveDashboard() {
  var dashboards = document.querySelectorAll(".dashboard");
  dashboards.forEach(function (section) {
    var name = section.getAttribute("data-dashboard");
    if (name === appState.view.activeDashboard) {
      section.classList.add("dashboard--active");
    } else {
      section.classList.remove("dashboard--active");
    }
  });
}

/**
 * Фильтры.
 * ОБНОВЛЕНО: Переход с attachmentType на program.
 */
function initializeFilters() {
  var departmentSelect = document.getElementById("filter-department");
  var doctorSelect = document.getElementById("filter-doctor");
  var contractTypeSelect = document.getElementById("filter-contract-type");
  var programSelect = document.getElementById("filter-program"); // <-- ИЗМЕНЕНО
  var serviceFlagSelect = document.getElementById("filter-service-flag");
  var paymentMethodSelect = document.getElementById("filter-payment-method");
  var resetButton = document.getElementById("filters-reset");

  if (departmentSelect) {
    departmentSelect.addEventListener("change", function () {
      appState.filters.department = departmentSelect.value;
      renderActiveDashboard();
    });
  }

  if (doctorSelect) {
    doctorSelect.addEventListener("change", function () {
      appState.filters.doctor = doctorSelect.value;
      renderActiveDashboard();
    });
  }

  if (contractTypeSelect) {
    contractTypeSelect.addEventListener("change", function () {
      appState.filters.contractType = contractTypeSelect.value;
      renderActiveDashboard();
    });
  }

  // НОВЫЙ БЛОК ДЛЯ programSelect
  if (programSelect) {
    programSelect.addEventListener("change", function () {
      appState.filters.program = programSelect.value;
      renderActiveDashboard();
    });
  }

  if (serviceFlagSelect) {
    serviceFlagSelect.addEventListener("change", function () {
      appState.filters.serviceFlag = serviceFlagSelect.value;
      renderActiveDashboard();
    });
  }

  if (paymentMethodSelect) {
    paymentMethodSelect.addEventListener("change", function () {
      appState.filters.paymentMethod = paymentMethodSelect.value;
      renderActiveDashboard();
    });
  }

  if (resetButton) {
    resetButton.addEventListener("click", function () {
      resetFilters();
      renderActiveDashboard();
    });
  }
}

/**
 * Поиск по врачам (строка + кнопка "Показать всех").
 */
function initializeDoctorSearch() {
  var input = document.getElementById("doctor-search");
  var resetButton = document.getElementById("doctors-show-all");

  if (input) {
    input.value = doctorSearchQuery || "";

    input.addEventListener("input", function () {
      doctorSearchQuery = input.value.trim();
      renderDoctorsDashboard();
    });
  }

  if (resetButton) {
    resetButton.addEventListener("click", function () {
      doctorSearchQuery = "";
      if (input) {
        input.value = "";
      }
      renderDoctorsDashboard();
    });
  }
}

/**
 * Контролы раздела "Услуги" (сортировка, лимит, поиск, режим, пагинация).
 */
function initializeServicesControls() {
  var searchInput = document.getElementById("services-search-input");
  var filterSelect = document.getElementById("services-category-filter");
  var prevBtn = document.getElementById("services-page-prev");
  var nextBtn = document.getElementById("services-page-next");

  if (searchInput) {
    searchInput.addEventListener("input", function() {
      appState.services.page = 1;
      renderServicesDashboard();
    });
  }

  if (filterSelect) {
    filterSelect.addEventListener("change", function() {
      appState.services.page = 1;
      renderServicesDashboard();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", function() {
      if (appState.services.page > 1) {
        appState.services.page--;
        renderServicesDashboard();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", function() {
      appState.services.page++;
      renderServicesDashboard();
    });
  }
}

function initializePatientsServicesControls() {
  var sortSelect = document.getElementById("patients-services-sort-select");
  var limitSelect = document.getElementById("patients-services-limit-select");
  var searchInput = document.getElementById("patients-services-search-input");
  var modeSelect = document.getElementById("patients-services-mode-select");
  var prevBtn = document.getElementById("patients-services-page-prev");
  var nextBtn = document.getElementById("patients-services-page-next");

  if (
    !sortSelect &&
    !limitSelect &&
    !searchInput &&
    !modeSelect &&
    !prevBtn &&
    !nextBtn
  ) {
    // этого блока просто нет в DOM — выходим
    return;
  }

  if (!appState.patientsServices) {
    appState.patientsServices = {
      mode: "top",
      page: 1
    };
  }

  function rerenderIfActive() {
    if (appState.view.activeDashboard === "patients") {
      renderPatientsDashboard();
    }
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", rerenderIfActive);
  }

  if (limitSelect) {
    limitSelect.addEventListener("change", rerenderIfActive);
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      appState.patientsServices.page = 1;
      rerenderIfActive();
    });
  }

  if (modeSelect) {
    modeSelect.addEventListener("change", function () {
      var mode = modeSelect.value || "top";
      appState.patientsServices.mode = mode;
      appState.patientsServices.page = 1;
      rerenderIfActive();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      if (appState.patientsServices.page > 1) {
        appState.patientsServices.page -= 1;
        rerenderIfActive();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      // предел страниц мы посчитаем внутри renderPatientsDashboard
      appState.patientsServices.page += 1;
      rerenderIfActive();
    });
  }
}

function initializePatientsFlowControls() {
  var modeSelect = document.getElementById("patients-flow-mode-select");

  if (!modeSelect) {
    return;
  }

  if (!appState.patientsFlow) {
    appState.patientsFlow = {
      mode: "departments"
    };
  }

  // Установим текущее значение из состояния
  modeSelect.value = appState.patientsFlow.mode || "departments";

  function rerenderIfActive() {
    if (appState.view.activeDashboard === "patients") {
      renderPatientsDashboard();
    }
  }

  modeSelect.addEventListener("change", function () {
    var mode = modeSelect.value || "departments";
    appState.patientsFlow.mode = mode;
    rerenderIfActive();
  });
}

/**
 * Инициализация контролов раздела "Себестоимость".
 * Переключатель группировки: отделения / услуги.
 */
function initializeCostsControls() {
  // 1. Обработчик кнопки разворота матрицы (из предыдущих шагов)
  const btnExpand = document.getElementById("btn-expand-cost-matrix");
  if (btnExpand) {
    /* ... твой код для модалки графика, оставляем как есть ... */
    // (Если нужно, скопируй его сюда из предыдущего ответа)
  }

  // 2. КОНТРОЛЫ ТАБЛИЦЫ
  const searchInput = document.getElementById("costs-search-input");
  const filterSelect = document.getElementById("costs-filter-select");
  const btnPrev = document.getElementById("costs-page-prev");
  const btnNext = document.getElementById("costs-page-next");

  // Поиск
  if (searchInput) {
    const newSearch = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearch, searchInput);
    newSearch.addEventListener("input", function(e) {
      costsTableState.search = e.target.value.trim().toLowerCase();
      costsTableState.page = 1;
      renderCostsDashboard(); // Перерисовка
    });
  }

  // Фильтр
  if (filterSelect) {
    filterSelect.addEventListener("change", function(e) {
      costsTableState.filter = e.target.value;
      costsTableState.page = 1;
      renderCostsDashboard();
    });
  }

  // Пагинация: Назад
  if (btnPrev) {
    const newPrev = btnPrev.cloneNode(true);
    btnPrev.parentNode.replaceChild(newPrev, btnPrev);
    newPrev.addEventListener("click", function() {
      if (costsTableState.page > 1) {
        costsTableState.page--;
        renderCostsDashboard();
      }
    });
  }

  // Пагинация: Вперед
  if (btnNext) {
    const newNext = btnNext.cloneNode(true);
    btnNext.parentNode.replaceChild(newNext, btnNext);
    newNext.addEventListener("click", function() {
      // Макс. страницы проверим внутри рендера, тут просто инкремент
      costsTableState.page++; 
      renderCostsDashboard();
    });
  }
  
  // Сортировка по заголовкам (Делегирование)
  const table = document.querySelector("#cost-optimization-tbody")?.closest("table");
  if (table) {
      const thead = table.querySelector("thead");
      const newThead = thead.cloneNode(true);
      thead.parentNode.replaceChild(newThead, thead);
      
      newThead.addEventListener("click", function(e) {
          const th = e.target.closest("th.sortable");
          if (!th) return;
          
          const field = th.dataset.sort;
          if (costsTableState.sortField === field) {
              costsTableState.sortDir = (costsTableState.sortDir === 'desc') ? 'asc' : 'desc';
          } else {
              costsTableState.sortField = field;
              costsTableState.sortDir = 'desc'; // По умолчанию убывание для чисел
          }
          renderCostsDashboard();
      });
  }
}

/**
 * Сворачиваемые карточки (например, "Пациенты по отделениям").
 */
function initializeCollapsibleCards() {
  var buttons = document.querySelectorAll(
    ".card__collapse-btn[data-collapse-target]"
  );

  buttons.forEach(function (btn) {
    var targetId = btn.getAttribute("data-collapse-target");
    var card = document.getElementById(targetId);
    if (!card) {
      return;
    }

    btn.addEventListener("click", function () {
      var isCollapsed = card.classList.toggle("card--collapsed");
      var expanded = !isCollapsed;

      btn.setAttribute("aria-expanded", expanded ? "true" : "false");
      btn.textContent = expanded ? "Свернуть" : "Развернуть";
    });
  });
}

/**
 * Автоподстановка списков отделений и врачей.
 */
function populateFilterOptions() {
  var departmentSelect = document.getElementById("filter-department");
  var doctorSelect = document.getElementById("filter-doctor");

  if (!departmentSelect || !doctorSelect) {
    return;
  }

  var departmentsSet = {};
  var doctorsSet = {};

  preparedDataRows.forEach(function (row) {
    if (row.department) {
      departmentsSet[row.department] = true;
    }
    if (row.doctor) {
      doctorsSet[row.doctor] = true;
    }
  });

  var departments = Object.keys(departmentsSet).sort();
  var doctors = Object.keys(doctorsSet).sort();

  while (departmentSelect.options.length > 1) {
    departmentSelect.remove(1);
  }
  while (doctorSelect.options.length > 1) {
    doctorSelect.remove(1);
  }

  departments.forEach(function (name) {
    var option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    departmentSelect.appendChild(option);
  });

  doctors.forEach(function (name) {
    var option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    doctorSelect.appendChild(option);
  });
}

/**
 * Сброс фильтров.
 * ОБНОВЛЕНО: Переход с attachmentType на program.
 */
function resetFilters() {
  appState.filters = {
    department: "all",
    doctor: "all",
    contractType: "all",
    program: "all", // <-- ИЗМЕНЕНО
    serviceFlag: "all",
    paymentMethod: "all"
  };

  var departmentSelect = document.getElementById("filter-department");
  var doctorSelect = document.getElementById("filter-doctor");
  var contractTypeSelect = document.getElementById("filter-contract-type");
  var programSelect = document.getElementById("filter-program"); // <-- ИЗМЕНЕНО
  var serviceFlagSelect = document.getElementById("filter-service-flag");
  var paymentMethodSelect = document.getElementById("filter-payment-method");

  if (departmentSelect) departmentSelect.value = "all";
  if (doctorSelect) doctorSelect.value = "all";
  if (contractTypeSelect) contractTypeSelect.value = "all";
  if (programSelect) programSelect.value = "all"; // <-- ИЗМЕНЕНО
  if (serviceFlagSelect) serviceFlagSelect.value = "all";
  if (paymentMethodSelect) paymentMethodSelect.value = "all";
}

/**
 * Применение фильтров к данным.
 * ОБНОВЛЕНО: Переход с attachmentType на program.
 */
function applyFilters(rows, filters) {
  filters = filters || appState.filters || {};

  return rows.filter(function (row) {
    // Отделение
    if (
      filters.department &&
      filters.department !== "all" &&
      row.department !== filters.department
    ) {
      return false;
    }

    // Врач
    if (
      filters.doctor &&
      filters.doctor !== "all" &&
      row.doctor !== filters.doctor
    ) {
      return false;
    }

    // Вид договора
    if (filters.contractType && filters.contractType !== "all") {
      if (!row.contractTypeKey || row.contractTypeKey === "other") {
        return false;
      }
      if (row.contractTypeKey !== filters.contractType) {
        return false;
      }
    }

    // Канал продаж (Программа) - НОВАЯ ЛОГИКА
    if (filters.program && filters.program !== "all") {
      if (row.programKey !== filters.program) {
        return false;
      }
    }

    // Тип услуги (консультация / комплекс)
    if (filters.serviceFlag && filters.serviceFlag !== "all") {
      if (
        !row.serviceFlagKey ||
        row.serviceFlagKey === "other" ||
        row.serviceFlagKey !== filters.serviceFlag
      ) {
        return false;
      }
    }

    // Способ оплаты
    if (filters.paymentMethod && filters.paymentMethod !== "all") {
      if (
        !row.paymentMethodKey ||
        row.paymentMethodKey === "other" ||
        row.paymentMethodKey !== filters.paymentMethod
      ) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Общая фильтрация всех строк:
 * здесь просто применяем фильтры из левой панели.
 * Если потом появятся ещё общие фильтры (поиск и т.п.),
 * их можно будет дописать сюда.
 */
function filterRowsByAll(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  // применяем все фильтры (отделение, врач, договор и т.д.)
  return applyFilters(rows, appState.filters);
}

/**
 * Фильтрация по периоду (A или B).
 */
function filterRowsByPeriod(rows, period) {
  return rows.filter(function (row) {
    if (!row.serviceYear || !row.serviceMonth) {
      return false;
    }
    if (row.serviceYear !== period.year) {
      return false;
    }

    if (period.mode === "month") {
      return row.serviceMonth === period.monthFrom;
    } else if (period.mode === "ytd") {
      return row.serviceMonth <= period.monthTo;
    } else if (period.mode === "range") {
      return (
        row.serviceMonth >= period.monthFrom &&
        row.serviceMonth <= period.monthTo
      );
    }
    return true;
  });
}

/**
 * Построение периода B относительно периода A.
 * Учитывает режимы: prevMonth, prevYear, custom.
 */
function buildComparisonPeriod(periodA, periodBState) {
  var modeB = periodBState.mode;

  if (modeB === "custom") {
    return {
      mode: "range",
      year: periodBState.year,
      monthFrom: periodBState.monthFrom,
      monthTo: periodBState.monthTo
    };
  }

  function clampMonth(value) {
    if (value < 1) {
      return 1;
    }
    if (value > 12) {
      return 12;
    }
    return value;
  }

  if (modeB === "prevYear") {
    var yearPrev = periodA.year - 1;
    return {
      mode: periodA.mode,
      year: yearPrev,
      monthFrom: periodA.monthFrom,
      monthTo: periodA.monthTo
    };
  }

  if (modeB === "prevMonth") {
    if (periodA.mode === "month") {
      var month = periodA.monthFrom;
      var year = periodA.year;
      var prevMonth = month - 1;
      if (prevMonth < 1) {
        prevMonth = 12;
        year = year - 1;
      }
      return {
        mode: "month",
        year: year,
        monthFrom: prevMonth,
        monthTo: prevMonth
      };
    }

    if (periodA.mode === "ytd") {
      var monthTo = periodA.monthTo - 1;
      var yearYtd = periodA.year;
      if (monthTo < 1) {
        monthTo = 12;
        yearYtd = yearYtd - 1;
      }
      return {
        mode: "ytd",
        year: yearYtd,
        monthFrom: 1,
        monthTo: clampMonth(monthTo)
      };
    }

    if (periodA.mode === "range") {
      var from = clampMonth(periodA.monthFrom - 1);
      var to = clampMonth(periodA.monthTo - 1);
      if (to < from) {
        to = from;
      }
      return {
        mode: "range",
        year: periodA.year,
        monthFrom: from,
        monthTo: to
      };
    }
  }

  return {
    mode: periodA.mode,
    year: periodA.year - 1,
    monthFrom: periodA.monthFrom,
    monthTo: periodA.monthTo
  };
}

/**
 * 4. AGGREGATION LAYER v9.1 (Bug Fix: Net Pay Aggregation)
 * Fix: Added aggregation of 'payFinalMed' to groups (Doctors/Depts).
 */
function calculateMetrics(rows) {
  const m = {
    totalRevenue: 0, totalServices: 0, totalQuantity: 0,
    totalCostDirect: 0, totalCommission: 0, totalExternal: 0, totalVatService: 0,
    totalLaborCost: 0, totalSocialTech: 0, totalPiecework: 0,
    totalTaxPension: 0, totalTaxFoms: 0, totalTaxFss: 0, totalTaxInjury: 0, totalSocialCharges: 0,
    totalCostFull: 0, totalProfitMethod: 0, totalNetProfitFinal: 0,
    totalNetWagePool: 0, totalPayFinalMed: 0, totalShareAdmin: 0, totalFundLimit: 0, totalReserve: 0,
    totalUniquePatients: 0, totalVisits: 0, rowsWithPatientKey: 0, rowsWithoutPatientKey: 0
  };

  const uniquePatientsMap = {};
  const uniqueVisitsMap = {};
  const byDepartment = {};
  const byDoctor = {};
  const byService = {};
  const byPatient = {};

  function getGroup(container, key, label) {
    if (!container[key]) {
      container[key] = {
        key: key, name: label || key,
        count: 0, revenue: 0,
        costNoWages: 0, costCommission: 0, costExternal: 0, vatService: 0,
        costFull: 0, laborNormative: 0,
        pieceworkAmount: 0, profitMethod: 0, netProfitFinal: 0,
        fundLimit: 0, reserve: 0,
        payFinalMed: 0 // Инициализация
      };
    }
    return container[key];
  }

  rows.forEach(row => {
    const qty = row.quantity || 1;
    m.totalServices += 1; m.totalQuantity += qty; m.totalRevenue += row.amountPaid;
    
    m.totalCostDirect += (row.costDirect38 || 0);
    m.totalCommission += (row.commission39 || 0);
    m.totalExternal += ((row.externalPrice||0) + (row.externalVat||0));
    m.totalVatService += (row.vatService12 || 0);
    m.totalLaborCost += (row.laborCost || 0);
    m.totalSocialTech += (row.socialChargesTech || 0);
    m.totalPiecework += row.pieceworkAmount; 
    
    m.totalTaxPension += row.taxPension; m.totalTaxFoms += row.taxFoms;
    m.totalTaxFss += row.taxFss; m.totalTaxInjury += row.taxInjury;
    m.totalSocialCharges += row.socialChargesTotal;

    m.totalCostFull += row.costFull42;
    m.totalProfitMethod += row.profitMethod43;
    m.totalNetProfitFinal += row.netProfitFinal;

    m.totalNetWagePool += row.netWagePool;
    m.totalPayFinalMed += (row.payFinalMed || 0);
    m.totalShareAdmin += row.shareAdmin;
    m.totalFundLimit += row.fundLimit;
    m.totalReserve += row.reserveFund;

    if (row.patientKey) {
      m.rowsWithPatientKey++;
      if (!uniquePatientsMap[row.patientKey]) { uniquePatientsMap[row.patientKey] = true; m.totalUniquePatients++; }
      if (!byPatient[row.patientKey]) {
        byPatient[row.patientKey] = { name: row.patientName, birthDate: row.birthDate, revenue: 0, services: 0, visits: 0, _visits: {} };
      }
      const p = byPatient[row.patientKey];
      p.revenue += row.amountPaid; p.services += qty;
      if (row.visitKey && !p._visits[row.visitKey]) { p._visits[row.visitKey] = true; p.visits++; }
    } else { m.rowsWithoutPatientKey++; }

    if (row.visitKey && !uniqueVisitsMap[row.visitKey]) { uniqueVisitsMap[row.visitKey] = true; m.totalVisits++; }

    const depName = row.department || "Не указано";
    const docName = row.doctor || "Не указано";
    const svcKey = (row.serviceCode || "") + " " + (row.serviceName || "");

    [getGroup(byDepartment, depName), getGroup(byDoctor, docName), getGroup(byService, svcKey, row.serviceName)].forEach(g => {
      g.count += qty;
      g.revenue += row.amountPaid;
      g.costNoWages += (row.costDirect38 || 0);
      g.costCommission += (row.commission39 || 0);
      g.costExternal += ((row.externalPrice||0) + (row.externalVat||0));
      g.vatService += (row.vatService12 || 0);
      g.costFull += row.costFull42;
      g.pieceworkAmount += row.pieceworkAmount; 
      g.profitMethod += row.profitMethod43;
      g.netProfitFinal += row.netProfitFinal;
      g.laborNormative += ((row.laborCost||0) + (row.socialChargesTech||0));
      g.fundLimit += row.fundLimit;
      g.reserve += row.reserveFund;
      
      // ВОТ ИСПРАВЛЕНИЕ:
      g.payFinalMed += (row.payFinalMed || 0);
      
      if (row.serviceCode && !g.code) g.code = row.serviceCode;
    });
  });

  m.totalCostOper = m.totalCostDirect + m.totalCommission + m.totalExternal + m.totalVatService;
  m.totalCostNoWages = m.totalCostDirect; 
  m.marginPct = m.totalRevenue > 0 ? (m.totalNetProfitFinal / m.totalRevenue * 100) : 0;
  m.avgCheckPerPatient = m.totalUniquePatients > 0 ? m.totalRevenue / m.totalUniquePatients : 0;
  m.avgCheckPerService = m.totalServices > 0 ? m.totalRevenue / m.totalServices : 0;
  m.servicesPerPatient = m.totalUniquePatients > 0 ? m.totalServices / m.totalUniquePatients : 0;

  const finalizeGroup = (g) => {
    g.profitAfterMotivation = g.netProfitFinal; 
    g.marginPct = g.revenue > 0 ? (g.netProfitFinal / g.revenue * 100) : 0;
    g.costLaborFull = g.laborNormative;
    g.costOper = g.costNoWages + g.costCommission + g.costExternal + g.vatService;
  };

  Object.values(byDepartment).forEach(finalizeGroup);
  Object.values(byDoctor).forEach(finalizeGroup);
  Object.values(byService).forEach(finalizeGroup);

  const docRevenues = Object.values(byDoctor).filter(d => d.revenue > 0).map(d => d.revenue);
  const docMargins = Object.values(byDoctor).filter(d => d.revenue > 0).map(d => d.marginPct);
  m.medianDoctorRevenue = computeMedianValue(docRevenues);
  m.medianDoctorMargin = computeMedianValue(docMargins); // Это медиана маржи, для ФОТ нужно будет посчитать медиану Load

  return { ...m, byDepartment, byDoctor, byService, byPatient };
}

/**
 * Инициализация взаимодействий в разделе "Себестоимость".
 * Обработчики кнопок, которые не зависят от перерисовки данных.
 */
function initializeCostsInteractions() {
  const btnExpand = document.getElementById("btn-expand-cost-matrix");
  
  if (btnExpand) {
    // Удаляем старый слушатель (на всякий случай, если функция вызывается повторно), клонируя элемент
    const newBtn = btnExpand.cloneNode(true);
    btnExpand.parentNode.replaceChild(newBtn, btnExpand);

    newBtn.addEventListener("click", function() {
      const modal = document.getElementById("cost-matrix-modal");
      if (!modal) return;

      // 1. Открываем модалку (используем твой стиль через классы)
      modal.classList.add("modal--open");
      modal.setAttribute("aria-hidden", "false");

      // 2. Рендерим график
      // Используем setTimeout, чтобы CSS анимация модалки не сбила расчет размеров Canvas
      setTimeout(function() {
        const canvas = document.getElementById("cost-matrix-chart-modal");
        // Проверяем наличие данных в глобальной переменной (ты её сохраняешь в renderCostsDashboard)
        if (!canvas || !window.lastCostMatrixData) return;

        const ctx = canvas.getContext("2d");

        // Уничтожаем старый график, если он был (переменная объявлена глобально в начале main.js)
        if (costMatrixModalChart) {
          costMatrixModalChart.destroy();
          costMatrixModalChart = null;
        }

        const fontSpec = "Inter, system-ui, sans-serif";
        const fontConfigModal = { family: fontSpec, size: 13, weight: 500 };

        costMatrixModalChart = new Chart(ctx, {
          type: 'bubble',
          data: {
            datasets: [{
              label: 'Услуги',
              data: window.lastCostMatrixData,
              backgroundColor: window.lastCostMatrixData.map(function(d) {
                 return d.x > 80 ? 'rgba(239, 68, 68, 0.7)' : (d.x > 50 ? 'rgba(245, 158, 11, 0.7)' : 'rgba(16, 185, 129, 0.6)');
              }),
              borderColor: 'transparent'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleFont: { family: fontSpec, size: 14, weight: '600' },
                bodyFont: { family: fontSpec, size: 13 },
                padding: 12,
                callbacks: {
                  label: function(ctx) {
                    const p = ctx.raw;
                    return [
                      p.serviceName, 
                      `Выручка: ${formatShortCurrency(p.rawRevenue)}`, 
                      `Прибыль: ${formatShortCurrency(p.y)}`, 
                      `OpEx: ${p.x.toFixed(1)}%`
                    ];
                  }
                }
              }
            },
            scales: {
              x: {
                title: { display: true, text: 'Доля OpEx (%)', font: fontConfigModal },
                grid: { color: "#e2e8f0" },
                ticks: { font: fontConfigModal, color: "#64748b" }
              },
              y: {
                title: { display: true, text: 'Прибыль (₽)', font: fontConfigModal },
                grid: { color: "#e2e8f0" },
                ticks: { font: fontConfigModal, color: "#64748b", callback: function(v) { return formatShortCurrency(v); } }
              }
            }
          }
        });
      }, 150); // Небольшая задержка для корректного рендера
    });
  }
}

function renderActiveDashboard() {
  var view = appState.view.activeDashboard;

  // 1. Макро-уровень
  if (view === "overview") {
    renderOverviewDashboard();
  } else if (view === "clinic") {
    renderClinicDashboard();

  // 2. Структурные единицы
  } else if (view === "departments") {
    renderDepartmentsDashboard();
  } else if (view === "doctors") {
    renderDoctorsDashboard();

  // 3. Продукт и Клиент
  } else if (view === "services") {
    renderServicesDashboard();
  } else if (view === "patients") {
    renderPatientsDashboard();
  } else if (view === "programs") {
    renderProgramsDashboard();

  // 4. Финансы
  } else if (view === "fot") {
    renderMotivationDashboard();
  } else if (view === "motivation-doctors") {
    renderMotivationDoctorsDashboard();
  } else if (view === "costs") {
    renderCostsDashboard();
  } else if (view === "payments") {
    // ВОТ ЗДЕСЬ БЫЛА ЗАКОММЕНТИРОВАННАЯ СТРОКА ИЛИ CONSOLE.LOG
    renderPaymentsDashboard(); 
  }
}

/**
 * OVERVIEW DASHBOARD v9.0 (Direct Costing Edition)
 * Updates:
 * 1. KPI tooltips updated (removed mentions of Fixed Labor).
 * 2. Logic strictly follows: Rev -> OpEx -> Margin -> Profit.
 */
function renderOverviewDashboard() {
  var container = document.querySelector('[data-dashboard="overview"]');
  if (!container) return;

  // --- 1. Элементы DOM ---
  var elRevenue   = document.getElementById("kpi-revenue");
  var elMargin    = document.getElementById("kpi-profit");      // Маржа 1 (Rev - OpEx)
  var elNetProfit = document.getElementById("kpi-net-profit");  // Чистая (Bottom Line)
  var elRent      = document.getElementById("kpi-margin");      // Рентабельность %
  
  var elFund      = document.getElementById("kpi-fund");
  var elReserve   = document.getElementById("kpi-reserve");
  
  var elServices  = document.getElementById("kpi-services-count");
  var elPatients  = document.getElementById("kpi-patients-count");
  var elCheckPat  = document.getElementById("kpi-average-check-patient");
  var elCheckSvc  = document.getElementById("kpi-average-check-service");
  var elSvcPerPat = document.getElementById("kpi-services-per-patient");

  // Обработка пустого состояния
  if (!preparedDataRows || preparedDataRows.length === 0) return;

  var filteredRows = applyFilters(preparedDataRows, appState.filters);
  var periodRowsA = filterRowsByPeriod(filteredRows, appState.periodA);
  
  if (!periodRowsA || periodRowsA.length === 0) {
    if (elRevenue) elRevenue.textContent = "0 ₽";
    renderOverviewDepartments({});
    return;
  }

  // --- 2. РАСЧЕТ МЕТРИК (Новая модель) ---
  var metricsA = calculateMetrics(periodRowsA);

  // A. Выручка
  var valRevenue = metricsA.totalRevenue || 0;

  // B. Маржинальная прибыль (Теперь это Rev - OpEx, без окладов)
  var valMarginProfit = metricsA.totalProfitMethod || 0;

  // C. Сдельный ФОТ (Единственный расход на персонал)
  var valVariableFot = metricsA.totalPiecework || 0;

  // D. Чистая прибыль (Маржа - Сделка)
  var valNetProfit = metricsA.totalNetProfitFinal;

  // E. Рентабельность
  var valRentability = valRevenue > 0 ? (valNetProfit / valRevenue * 100) : 0;

  // F. Операционные метрики
  var valQty = metricsA.totalQuantity || 0;
  var valPatients = metricsA.totalUniquePatients || 0;


  // --- 3. ОБНОВЛЕНИЕ UI ---

  if (elRevenue) elRevenue.textContent = formatCurrency(valRevenue);

  if (elMargin) {
      elMargin.textContent = formatCurrency(valMarginProfit);
      // ОБНОВЛЕНИЕ ПОДСКАЗКИ: Теперь это Маржа без окладов
      var card = elMargin.closest(".kpi-card");
      if(card) {
          var sub = card.querySelector(".kpi-card__subtitle");
          if(sub) sub.textContent = "Маржинальная (до ФОТ)"; 
          var help = card.querySelector(".help-icon");
          if(help) help.setAttribute("data-tooltip", "Выручка минус прямые расходы (материалы, комиссии, внешние). Оклады здесь НЕ вычитаются.");
      }
  }

  if (elNetProfit) {
    elNetProfit.textContent = formatCurrency(valNetProfit);
    elNetProfit.style.color = valNetProfit >= 0 ? "#0abab5" : "#ef4444";
  }

  if (elRent) {
      elRent.textContent = formatPercent(valRentability);
      elRent.style.color = valRentability >= 20 ? "#10b981" : (valRentability > 0 ? "#0f172a" : "#ef4444");
  }

  if (elFund) elFund.textContent = formatCurrency(metricsA.totalFundLimit || 0);
  if (elReserve) {
      var res = metricsA.totalReserve || 0;
      elReserve.textContent = formatCurrency(res);
      elReserve.style.color = res >= 0 ? "#10b981" : "#ef4444";
  }

  if (elServices) elServices.textContent = valQty.toLocaleString("ru-RU");
  if (elPatients) elPatients.textContent = valPatients.toLocaleString("ru-RU");
  if (elCheckPat) elCheckPat.textContent = formatCurrency(metricsA.avgCheckPerPatient || 0);
  if (elCheckSvc) elCheckSvc.textContent = formatCurrency(metricsA.avgCheckPerService || 0);
  if (elSvcPerPat) elSvcPerPat.textContent = (metricsA.servicesPerPatient || 0).toFixed(2);

  // --- 4. Рендер вложенных виджетов ---
  
  renderOverviewDepartments(metricsA.byDepartment);
  
  // Сравнение
  var periodRowsB = null;
  var comparisonPeriod = null;
  if (appState.periodB && appState.periodB.enabled) {
      comparisonPeriod = buildComparisonPeriod(appState.periodA, appState.periodB);
      periodRowsB = filterRowsByPeriod(filteredRows, comparisonPeriod);
      
      var metricsB = calculateMetrics(periodRowsB);
      var deltaRev = valRevenue - metricsB.totalRevenue;
      var deltaRevPct = metricsB.totalRevenue > 0 ? (deltaRev / metricsB.totalRevenue * 100) : 0;
      
      var deltaEl = document.getElementById("kpi-revenue-delta");
      if (deltaEl) {
          deltaEl.innerHTML = (deltaRev > 0 ? "↑" : "↓") + " " + Math.abs(deltaRevPct).toFixed(1) + "%";
          deltaEl.className = "kpi-card__delta " + (deltaRev >= 0 ? "kpi-card__delta--up" : "kpi-card__delta--down");
          deltaEl.style.color = deltaRev >= 0 ? "#10b981" : "#ef4444";
      }
  } else {
      var deltaEl = document.getElementById("kpi-revenue-delta");
      if (deltaEl) { deltaEl.textContent = "Сравнение выкл"; deltaEl.style.color = "#94a3b8"; }
  }

  // Графики (v9.0 Direct Costing versions)
  renderOverviewChart(
    periodRowsA, appState.periodA.year,
    periodRowsB, comparisonPeriod ? comparisonPeriod.year : null
  );

  renderOverviewFlowDiagram(metricsA);
  renderContractPillChart(periodRowsA);
  renderProgramPillChart(periodRowsA);
}

/**
 * OVERVIEW TOP-10 DEPARTMENTS v9.1 (Wider Layout Fix)
 * Columns: Revenue | OpEx (Direct) | Margin 1 | Net Profit.
 * Fix: Added white-space: nowrap to prevent wrapping and width: 100%.
 */
function renderOverviewDepartments(byDepartment) {
  var tbody = document.getElementById("overview-departments-body");
  // Ищем таблицу целиком, чтобы задать ей стиль
  var tableEl = tbody ? tbody.closest("table") : null;
  var thead = tableEl ? tableEl.querySelector("thead tr") : null;

  if (!tbody) return;

  // Стиль шрифта
  var fontSpec = "font-family: 'Inter', system-ui, sans-serif; font-size: 11px;";
  var noWrapStyle = "white-space: nowrap;"; // Чтобы цифры не переносились

  // 1. Форсируем ширину таблицы
  if (tableEl) {
    tableEl.style.width = "100%";
    tableEl.style.tableLayout = "auto"; // Позволяем колонкам растягиваться по содержимому
  }

  // 2. Обновляем шапку
  if (thead) {
      thead.innerHTML = `
        <th style="${fontSpec} color: #64748b; width: 30%;">Отделение</th>
        <th class="align-right" style="${fontSpec} color: #64748b; ${noWrapStyle}">Выручка</th>
        <th class="align-right muted" style="${fontSpec} color: #94a3b8; ${noWrapStyle}">Маржа (до ФОТ)</th>
        <th class="align-right" style="${fontSpec} color:#0abab5; font-weight:600; ${noWrapStyle}">Прибыль (Net)</th>
        <th class="align-right" style="${fontSpec} color: #64748b; ${noWrapStyle}">Рент. %</th>
      `;
  }

  tbody.innerHTML = "";
  var names = Object.keys(byDepartment || {});

  if (names.length === 0) {
    tbody.innerHTML = `<tr><td class="muted" colspan="5" style="text-align:center; padding: 20px;">Нет данных</td></tr>`;
    return;
  }

  var arr = names.map(function(name) {
    var d = byDepartment[name];
    var rev = d.revenue || 0;
    var margin = d.profitMethod || 0; 
    var net = d.netProfitFinal || 0;  
    var ros = rev !== 0 ? (net / rev * 100) : 0;

    return { name: name, rev: rev, margin: margin, net: net, ros: ros };
  });

  // Сортировка по Чистой Прибыли
  arr.sort(function(a, b) { return b.net - a.net; });

  arr.slice(0, 10).forEach(function(item) {
    var tr = document.createElement("tr");
    
    var rosColor = item.ros < 0 ? "#ef4444" : (item.ros < 15 ? "#f59e0b" : "#10b981");

    tr.innerHTML = `
      <td style="${fontSpec} font-weight: 500; color: #0f172a;">${item.name}</td>
      <td class="align-right" style="${fontSpec} ${noWrapStyle}">${formatCurrency(item.rev)}</td>
      <td class="align-right muted" style="${fontSpec} ${noWrapStyle}">${formatCurrency(item.margin)}</td>
      <td class="align-right" style="${fontSpec} font-weight: 600; color: ${item.net >= 0 ? '#0abab5' : '#ef4444'}; ${noWrapStyle}">${formatCurrency(item.net)}</td>
      <td class="align-right" style="${fontSpec} font-weight: 500; color: ${rosColor}; ${noWrapStyle}">${item.ros.toFixed(1)}%</td>
    `;
    tbody.appendChild(tr);
  });
}


/**
 * Отделения: профили + P&L + мотивация + flow-бар.
 * Профиль нужен и для KPI, и для таблиц.
 */
function getDepartmentProfileLabel(info) {
  var revenue = info.revenue || 0;
  var profit = info.profitMethod || 0;
  var margin = info.marginMethodPct || 0;
  var fotShare = info.fotSharePct || 0;

  if (revenue <= 0) {
    return "Спящий актив: нет выручки";
  }
  if (profit <= 0 || margin <= 0) {
    return "Меценат: работаем ради искусства";
  }
  if (fotShare >= 65 && margin < 15) {
    return "VIP-отделение: дорогой ФОТ";
  }
  if (margin >= 30) {
    return "Локомотив: тянет клинику";
  }
  if (margin < 15 && fotShare < 30) {
    return "Стахановец: много работы, мало денег";
  }
  return "Рабочая лошадка: стабильное отделение";
}

/**
 * Короткий "портрет" отделения для P&L-таблицы.
 * Смотрим только на локальные цифры отделения.
 */
function getDepartmentProfileLabel(d) {
  if (!d) {
    return "Нет данных";
  }

  var revenue = d.revenue || 0;

  var profit = typeof d.profitAfterMotivation === "number"
    ? d.profitAfterMotivation
    : (d.profitAfterBaseWages || 0) -
      ((d.pieceworkAmount || 0) + (d.socialCharges || 0));

  var margin = typeof d.marginPct === "number"
    ? d.marginPct
    : (revenue > 0 ? (profit / revenue) * 100 : 0);

  var wagesFull = (d.wagesBase || 0) + (d.wagesCharges || 0);
  var fotShare = revenue > 0 ? (wagesFull / revenue) * 100 : 0;

  if (revenue <= 0) {
    return "Спящее отделение";
  }

  if (profit < 0 && fotShare >= 70) {
    return "Токсичный актив";
  }

  if (profit < 0) {
    return "Работаем ради искусства";
  }

  if (margin >= 30) {
    return "Локомотив клиники";
  }

  if (margin >= 15 && fotShare >= 60) {
    return "VIP-отделение";
  }

  if (margin >= 10 && margin < 15) {
    return "Стахановец: берёт объёмом";
  }

  if (margin >= 0 && margin < 5) {
    return "Меценат: много заботы";
  }

  return "Рабочая лошадка";
}

/**
 * DEPARTMENTS PORTFOLIO FLOW v9.0 (Style Sync)
 * Visualizes the revenue share of each segment (Stars, Cash Cows, etc).
 * Style: Inter font, Clean tooltips.
 */
function renderDepartmentsPortfolioFlow(summary) {
  var canvas = document.getElementById("departments-portfolio-flow");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (Chart.getChart(canvas)) Chart.getChart(canvas).destroy();

  if (!summary || !summary.totalRevenue) return;

  var totalRevenue = summary.totalRevenue;
  var segs = summary.segments;
  
  // Порядок: Локомотивы -> Виртуозы -> Стахановцы -> Спящие
  var order = ["nabogatom", "virtuoz", "stakhanov", "sleeping"];
  
  var meta = {
    nabogatom: { label: "Локомотивы",       color: "#0d9488" }, // Teal
    virtuoz:   { label: "Виртуозы",         color: "#f59e0b" }, // Amber
    stakhanov: { label: "Стахановцы",       color: "#3b82f6" }, // Blue
    sleeping:  { label: "Спящая красавица", color: "#b50aba" }  // Purple
  };

  var validDatasets = [];
  var fontSpec = "Inter, system-ui, sans-serif";
  
  order.forEach(function(key) {
    var val = segs[key].revenue;
    if (val > 0) {
      validDatasets.push({
        label: meta[key].label,
        data: [val],
        backgroundColor: meta[key].color,
        borderWidth: 0,
        barPercentage: 1.0,
        categoryPercentage: 1.0,
        borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 0, bottomRight: 0 } // Сброс
      });
    }
  });

  // Скругление краев общей "колбасы"
  if (validDatasets.length > 0) {
    validDatasets[0].borderRadius.topLeft = 50;
    validDatasets[0].borderRadius.bottomLeft = 50;
    var last = validDatasets.length - 1;
    validDatasets[last].borderRadius.topRight = 50;
    validDatasets[last].borderRadius.bottomRight = 50;
  }

  new Chart(ctx, {
    type: "bar",
    data: { labels: ["Портфель"], datasets: validDatasets },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      scales: { x: { display: false, stacked: true }, y: { display: false, stacked: true } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { family: fontSpec, size: 0 }, // Скрываем заголовок
          bodyFont: { family: fontSpec, size: 12 },
          padding: 8,
          callbacks: {
            label: function(ctx) {
              var pct = (ctx.raw / totalRevenue * 100).toFixed(1) + "%";
              return `${ctx.dataset.label}: ${formatShortCurrency(ctx.raw)} (${pct})`;
            }
          }
        },
        datalabels: {
          display: function(ctx) { return (ctx.dataset.data[0] / totalRevenue) > 0.08; },
          color: "#ffffff",
          font: { family: fontSpec, weight: "bold", size: 11 },
          formatter: function(val, ctx) {
            var pct = (val / totalRevenue * 100).toFixed(0) + "%";
            return ctx.dataset.label.split(' ')[0] + " " + pct;
          }
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}

/**
 * SCATTER CHART v9.0 (Font Update)
 * Ensures Inter font and clean tooltips.
 */
function renderDepartmentsPortfolioScatter(summary, targetCanvasId) {
  var canvasId = targetCanvasId || "departments-portfolio-scatter";
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (Chart.getChart(canvas)) Chart.getChart(canvas).destroy();

  if (!summary || !summary.departments) return;

  var departments = summary.departments;
  var maxRevenue = Math.max(...departments.map(d => d.rev));
  var fontSpec = "Inter, system-ui, sans-serif";
  var fontSize = targetCanvasId ? 14 : 11;
  var pointScale = targetCanvasId ? 50 : 25; 

  var segmentsData = {
    nabogatom: { label: "Локомотивы",       data: [], color: "#0d9488" },
    virtuoz:   { label: "Виртуозы",         data: [], color: "#f59e0b" },
    stakhanov: { label: "Стахановцы",       data: [], color: "#3b82f6" },
    sleeping:  { label: "Спящая красавица", data: [], color: "#b50aba" }
  };

  departments.forEach(function(d) {
    var seg = d.segmentKey || "sleeping";
    var r = 5 + (d.rev / maxRevenue) * pointScale;
    segmentsData[seg].data.push({ x: d.share, y: d.rentability, r: r, _name: d.name, _rev: d.rev });
  });

  var datasets = Object.values(segmentsData).map(function(s) {
    return {
      label: s.label, data: s.data, backgroundColor: s.color + "CC",
      borderColor: "#ffffff", borderWidth: 1, hoverBorderColor: "#0f172a", hoverBorderWidth: 2
    };
  });

  new Chart(ctx, {
    type: "bubble",
    data: { datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: 20 },
      plugins: {
        legend: { position: "bottom", labels: { font: { family: fontSpec, size: fontSize }, boxWidth: 12, usePointStyle: true, padding: 15, color: "#475569" } },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { family: fontSpec, size: fontSize + 2 },
          bodyFont: { family: fontSpec, size: fontSize },
          padding: 12,
          callbacks: {
            label: function (ctx) {
              var p = ctx.raw;
              return [ p._name, `Выручка: ${formatShortCurrency(p._rev)}`, `Рентабельность: ${p.y.toFixed(1)}%`, `Доля рынка: ${p.x.toFixed(1)}%` ];
            }
          }
        },
        annotation: {
          annotations: {
            lineX: { type: 'line', xMin: summary.medianRevenueShare, xMax: summary.medianRevenueShare, borderColor: 'rgba(148, 163, 184, 0.4)', borderWidth: 1, borderDash: [4, 4], label: { enabled: false } },
            lineY: { type: 'line', yMin: summary.medianMargin, yMax: summary.medianMargin, borderColor: 'rgba(148, 163, 184, 0.4)', borderWidth: 1, borderDash: [4, 4], label: { enabled: false } }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Доля в выручке (%)', color: '#64748b', font: { family: fontSpec, size: fontSize } }, grid: { color: "rgba(148, 163, 184, 0.15)" }, ticks: { font: { family: fontSpec, size: fontSize } } },
        y: { title: { display: true, text: 'Рентабельность (%)', color: '#64748b', font: { family: fontSpec, size: fontSize } }, grid: { color: "rgba(148, 163, 184, 0.15)" }, ticks: { font: { family: fontSpec, size: fontSize } } }
      }
    }
  });
}

/**
 * DEPARTMENTS DASHBOARD v9.3 (Final Polish)
 * 1. Icon update: Sleeping Beauty -> 😴.
 * 2. Column names: Business-friendly & clear (OpEx, FOT Deal).
 * 3. Strict Direct Costing logic.
 */
function renderDepartmentsDashboard() {
  var dashboard = document.querySelector('[data-dashboard="departments"]');
  if (!dashboard) return;

  var plContainer = document.getElementById("departments-pl-container");
  var fontSpec = "Inter, system-ui, sans-serif";
  
  // 1. Данные
  if (!preparedDataRows || preparedDataRows.length === 0) return;
  var filteredRows = applyFilters(preparedDataRows, appState.filters);
  var periodRows = filterRowsByPeriod(filteredRows, appState.periodA);
  
  // Элементы KPI
  var elRev = document.getElementById("departments-kpi-revenue");
  var elProf = document.getElementById("departments-kpi-profit-method");
  var elRent = document.getElementById("departments-kpi-margin-method");

  if (!periodRows || periodRows.length === 0) {
    if (plContainer) renderEmptyState(plContainer, { title: "Нет данных" });
    if (elRev) elRev.textContent = formatCurrency(0);
    return;
  }

  var metrics = calculateMetrics(periodRows);
  var byDepartment = metrics.byDepartment || {};
  
  // 2. Расчет KPI
  var totalRev = metrics.totalRevenue;
  var totalNetProfit = metrics.totalNetProfitFinal; 
  var totalRentability = totalRev > 0 ? (totalNetProfit / totalRev * 100) : 0;

  // UI Updates
  if(elRev) elRev.textContent = formatCurrency(totalRev);
  
  if(elProf) {
      var card = elProf.closest(".kpi-card");
      if(card) {
          card.querySelector(".kpi-card__title").textContent = "Чистая прибыль";
          card.querySelector(".kpi-card__subtitle").textContent = "По всем отделениям";
      }
      elProf.textContent = formatCurrency(totalNetProfit);
      elProf.style.color = totalNetProfit >= 0 ? "#0abab5" : "#ef4444";
  }
  
  if(elRent) {
    var card = elRent.closest(".kpi-card");
    if(card) card.querySelector(".kpi-card__title").textContent = "Рентабельность (ROS)";
    elRent.textContent = formatPercent(totalRentability);
    elRent.style.color = totalRentability >= 15 ? "#10b981" : (totalRentability > 0 ? "#0f172a" : "#ef4444");
  }

  // 3. Подготовка данных
  var departmentsArray = Object.keys(byDepartment).map(function (name) {
    var d = byDepartment[name];
    var rev = d.revenue || 0;
    
    // Direct Costing
    var opCosts = d.costFull || 0; // OpEx
    var margin = d.profitMethod || 0; 
    var laborVar = d.pieceworkAmount || 0; 
    var netProfit = d.netProfitFinal; 
    
    var rentability = rev > 0 ? (netProfit / rev * 100) : 0;
    var share = metrics.totalRevenue > 0 ? (rev / metrics.totalRevenue * 100) : 0;

    return {
      name: name,
      rev: rev,
      opCosts: opCosts,
      margin: margin,
      laborVar: laborVar,
      netProfit: netProfit,
      rentability: rentability,
      share: share,
      segmentKey: "sleeping"
    };
  });

  // Сегментация
  var allShares = departmentsArray.map(d => d.share);
  var allRents = departmentsArray.map(d => d.rentability);
  var medShare = computeMedianValue(allShares);
  var medRent = computeMedianValue(allRents);

  var segmentsTotals = { nabogatom: {rev:0}, virtuoz: {rev:0}, stakhanov: {rev:0}, sleeping: {rev:0} };

  departmentsArray.forEach(function(d) {
    var isHighVol = d.share >= medShare;
    var isHighMarg = d.rentability >= medRent;
    if (isHighVol && isHighMarg) d.segmentKey = "nabogatom";
    else if (!isHighVol && isHighMarg) d.segmentKey = "virtuoz";
    else if (isHighVol && !isHighMarg) d.segmentKey = "stakhanov"; 
    else d.segmentKey = "sleeping";
    
    if(segmentsTotals[d.segmentKey]) segmentsTotals[d.segmentKey].rev += d.rev;
  });

  // Сортировка по Прибыли
  departmentsArray.sort(function (a, b) { return b.netProfit - a.netProfit; });

  // 4. Рендер Таблицы
  if (plContainer) {
    // ОБНОВЛЕННЫЕ ИКОНКИ
    var iconsMap = { nabogatom: "💎", virtuoz: "🎯", stakhanov: "🚜", sleeping: "😴" };
    
    // ОБНОВЛЕННЫЕ ЗАГОЛОВКИ (Четкие и понятные)
    var tableHTML = `
      <table style="font-family:${fontSpec};">
        <thead>
          <tr>
            <th style="color:#64748b; font-size:11px;">Отделение</th>
            <th class="align-right" style="color:#64748b; font-size:11px;">Выручка</th>
            <th class="align-right muted" style="color:#64748b; font-size:11px;">
                OpEx (Материалы)
                <span class="help-icon" data-tooltip="Прямые расходы + Комиссии + Внешние услуги.">?</span>
            </th>
            <th class="align-right muted" style="color:#64748b; font-size:11px;">
                Маржа
                <span class="help-icon" data-tooltip="Выручка минус OpEx. База для начисления ФОТ.">?</span>
            </th>
            <th class="align-right muted" style="color:#64748b; font-size:11px;">
                ФОТ (Сделка)
                <span class="help-icon" data-tooltip="Фактически начисленная мотивация (включая налоги).">?</span>
            </th>
            <th class="align-right" style="color:#0abab5; font-weight:600; font-size:11px;">Чистая прибыль</th>
            <th class="align-right" style="color:#64748b; font-size:11px;">Рент. %</th>
          </tr>
        </thead>
        <tbody>
    `;

    departmentsArray.forEach(function(d) {
      var icon = iconsMap[d.segmentKey] || "";
      var rentStyle = d.rentability < 0 ? "color:#dc2626; font-weight:600;" : (d.rentability >= 20 ? "color:#059669;" : "");

      tableHTML += `
        <tr class="table-row--clickable" data-department-name="${d.name}">
          <td style="font-weight: 500; color: #0f172a;">
            <span style="margin-right:6px; font-size:14px;">${icon}</span>${d.name}
          </td>
          <td class="align-right">${formatCurrency(d.rev)}</td>
          <td class="align-right muted">${formatCurrency(d.opCosts)}</td>
          <td class="align-right muted" style="color:#0f172a">${formatCurrency(d.margin)}</td>
          <td class="align-right muted">${formatCurrency(d.laborVar)}</td>
          <td class="align-right" style="font-weight:600; ${d.netProfit<0?'color:#dc2626':'color:#0abab5'}">${formatCurrency(d.netProfit)}</td>
          <td class="align-right" style="${rentStyle}">${formatPercent(d.rentability)}</td>
        </tr>
      `;
    });
    tableHTML += `</tbody></table>`;
    plContainer.innerHTML = tableHTML;

    var rows = plContainer.querySelectorAll("tr.table-row--clickable");
    rows.forEach(function(row, index) {
      row.addEventListener("click", function() {
        var name = departmentsArray[index].name;
        renderDepartmentFlowChart(byDepartment, name);
        var chart = document.getElementById("department-pl-chart");
        if (chart) chart.scrollIntoView({behavior: "smooth", block: "center"});
      });
    });
  }

  // 5. Графики
  var summary = {
    totalRevenue: totalRev,
    medianRevenueShare: medShare,
    medianMargin: medRent,
    segments: {
      nabogatom: { revenue: segmentsTotals.nabogatom.rev },
      virtuoz:   { revenue: segmentsTotals.virtuoz.rev },
      stakhanov: { revenue: segmentsTotals.stakhanov.rev },
      sleeping:  { revenue: segmentsTotals.sleeping.rev }
    },
    departments: departmentsArray
  };

  if (typeof renderDepartmentsPortfolioFlow === 'function') renderDepartmentsPortfolioFlow(summary);
  if (typeof renderRevenueSankey === 'function') renderRevenueSankey(periodRows);
  if (typeof renderDepartmentsPortfolioScatter === 'function') renderDepartmentsPortfolioScatter(summary);

  var targetDept = lastDepartmentForChart || (departmentsArray[0] ? departmentsArray[0].name : null);
  if (targetDept) renderDepartmentFlowChart(byDepartment, targetDept);
  
  var btnExpand = document.getElementById("btn-expand-scatter");
  if (btnExpand) {
    var newBtn = btnExpand.cloneNode(true);
    btnExpand.parentNode.replaceChild(newBtn, btnExpand);
    newBtn.addEventListener("click", function() { openScatterModal(summary); });
  }
}

function initializeDepartmentsInteractions() {
  var plBody = document.getElementById("departments-pl-body");
  if (!plBody) {
    return;
  }

  plBody.addEventListener("click", function (event) {
    var row = event.target.closest("tr[data-department-name]");
    if (!row) {
      return;
    }
    var name = row.getAttribute("data-department-name");
    if (!name) {
      return;
    }

    // Устанавливаем фильтр по отделению
    appState.filters.department = name;

    var departmentSelect = document.getElementById("filter-department");
    if (departmentSelect) {
      departmentSelect.value = name;
    }

    // Переключаемся на вкладку "Врачи"
    appState.view.activeDashboard = "doctors";
    updateActiveTabButton();
    updateActiveDashboard();
    renderActiveDashboard();
  });
}

/**
 * Инициализация взаимодействий на вкладке Врачи.
 * Поиск, Пагинация, Фильтр категорий, Клик по строке.
 */
function initializeDoctorsInteractions() {
  // Элементы управления
  var searchInput = document.getElementById("doctor-search");
  var categorySelect = document.getElementById("doctor-category-filter"); // <--- Тот самый селект
  var plBody = document.getElementById("doctors-pl-body");
  
  var prevBtn = document.getElementById("doctors-page-prev");
  var nextBtn = document.getElementById("doctors-page-next");

  // 1. Поиск по врачам (Input)
  if (searchInput) {
    // Восстанавливаем состояние из appState, если есть
    searchInput.value = appState.view.doctorSearch || "";
    
    searchInput.addEventListener("input", function () {
      appState.view.doctorSearch = searchInput.value || "";
      appState.view.doctorsPage = 1; // Сброс на 1 страницу при поиске
      renderDoctorsDashboard();
    });
  }

  // 2. [FIX] Фильтр по категориям (Звезды, Риск и т.д.)
  if (categorySelect) {
    // Удаляем старые слушатели (через клонирование), чтобы не дублировать
    var newSelect = categorySelect.cloneNode(true);
    categorySelect.parentNode.replaceChild(newSelect, categorySelect);
    categorySelect = newSelect;

    categorySelect.addEventListener("change", function () {
      appState.view.doctorsPage = 1; // Сброс на 1 страницу при фильтрации
      renderDoctorsDashboard();      // Перерисовка таблицы
    });
  }

  // 3. Клик по строке врача (Делегирование)
  if (plBody) {
    plBody.addEventListener("click", function (event) {
      // Ищем ближайшую строку таблицы
      var row = event.target.closest("tr");
      // Проверяем, что кликнули не по пустому месту и не по заголовку
      if (!row || !row.classList.contains("table-row--clickable")) return;
      
      // В renderDoctorsDashboard мы не ставим data-аттрибут, но имя врача в первой ячейке
      // Парсим имя из первой ячейки (там может быть иконка)
      var cellText = row.cells[0].textContent || "";
      // Убираем иконки (💎, 🟠, 🔴) и пробелы
      var doctorName = cellText.replace(/[💎🟠🔴]/g, "").trim();

      if (doctorName) {
        openDoctorDetailsModal(doctorName);
      }
    });
  }

  // 4. Пагинация: Назад
  if (prevBtn) {
    var newPrev = prevBtn.cloneNode(true);
    prevBtn.parentNode.replaceChild(newPrev, prevBtn);
    newPrev.addEventListener("click", function () {
      if (appState.view.doctorsPage > 1) {
        appState.view.doctorsPage -= 1;
        renderDoctorsDashboard();
      }
    });
  }

  // 5. Пагинация: Вперед
  if (nextBtn) {
    var newNext = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newNext, nextBtn);
    newNext.addEventListener("click", function () {
      // Чтобы узнать макс кол-во страниц, нужно знать кол-во отфильтрованных врачей.
      // В рамках упрощения просто вызываем рендер, а внутри renderDoctorsDashboard
      // есть проверка: if (page > totalPages) page = totalPages
      // Поэтому просто инкрементим:
      appState.view.doctorsPage += 1;
      renderDoctorsDashboard();
    });
  }
}



/**
 * Единая логика определения категории врача (Smart Segmentation).
 * Возвращает: stars | efficient | normal | risk | loss
 * 
 * @param {number} revenue - Выручка
 * @param {number} margin - Маржинальность %
 * @param {object} context - { medianRev, medianMarg } - Медианы по клинике
 */
function getDoctorCategoryKey(revenue, margin, context) {
  if (revenue <= 0) return "none"; // Неактивные

  // Фоллбэк значения, если контекст не передан (для безопасности)
  var medRev = (context && context.medianRev) ? context.medianRev : 1000000;
  var medMarg = (context && context.medianMarg) ? context.medianMarg : 20;

  // 1. Убыточные
  if (margin < 0) return "loss";

  // 2. Риск: маржа ниже 10% ИЛИ ниже половины от медианы по клинике
  if (margin < 10 || margin < (medMarg * 0.5)) return "risk";

  // 3. Звезды: Выручка > 150% от медианы И маржа выше медианы
  if (revenue > (medRev * 1.5) && margin >= medMarg) return "stars";

  // 4. Эффективные: Маржа выше медианы
  if (margin >= medMarg) return "efficient";

  // 5. Норма
  return "normal";
}

/**
 * DOCTORS DASHBOARD v9.6 (Filter Fix)
 * 1. Filter: Synced with 4 Quadrants (Stars, Workhorses, Virtuosos, Outsiders).
 * 2. Visuals: Standardized.
 */
function renderDoctorsDashboard() {
  var tbody = document.getElementById("doctors-pl-body");
  
  var kpiActive = document.getElementById("docs-kpi-active");
  var kpiRevenue = document.getElementById("docs-kpi-revenue");
  var kpiAvgRev = document.getElementById("docs-kpi-avg-revenue");
  var kpiWageLoad = document.getElementById("docs-kpi-wage-load");

  var searchInput = document.getElementById("doctor-search");
  var categorySelect = document.getElementById("doctor-category-filter");
  var paginationInfo = document.getElementById("doctors-pagination-info");
  var prevBtn = document.getElementById("doctors-page-prev");
  var nextBtn = document.getElementById("doctors-page-next");
  var btnExpand = document.getElementById("btn-expand-doctors-scatter");

  if (!tbody) return;
  tbody.innerHTML = "";

  // 1. Данные
  if (!preparedDataRows || preparedDataRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center; padding:20px;">Нет данных</td></tr>';
    return;
  }
  
  var filteredRows = applyFilters(preparedDataRows, appState.filters);
  var periodRows = filterRowsByPeriod(filteredRows, appState.periodA);
  var metrics = calculateMetrics(periodRows);
  var byDoctor = metrics.byDoctor || {};
  var doctorKeys = Object.keys(byDoctor);

  // 2. KPI
  var activeDocsCount = 0, totalDocsRevenue = 0, totalDocsFot = 0;
  doctorKeys.forEach(key => {
    var d = byDoctor[key];
    if (d.revenue > 0) {
      activeDocsCount++; totalDocsRevenue += d.revenue; totalDocsFot += d.pieceworkAmount; 
    }
  });

  if(kpiActive) kpiActive.textContent = activeDocsCount;
  if(kpiRevenue) kpiRevenue.textContent = formatCurrency(totalDocsRevenue);
  if(kpiAvgRev) kpiAvgRev.textContent = formatCurrency(activeDocsCount > 0 ? totalDocsRevenue / activeDocsCount : 0);
  
  var wageLoadPct = totalDocsRevenue > 0 ? (totalDocsFot / totalDocsRevenue) * 100 : 0;
  if(kpiWageLoad) {
    kpiWageLoad.textContent = formatPercent(wageLoadPct);
    kpiWageLoad.style.color = wageLoadPct > 35 ? "#ef4444" : (wageLoadPct > 25 ? "#f59e0b" : "#10b981");
  }

  // --- ИСПРАВЛЕНИЕ ФИЛЬТРА В HTML ---
  if (categorySelect && categorySelect.options.length > 0 && categorySelect.options[1].value === "efficient") {
      // Перезаписываем опции, если они старые
      categorySelect.innerHTML = `
        <option value="all">Все категории</option>
        <option value="stars">💎 Звезды</option>
        <option value="workhorse">🚜 Тягачи</option>
        <option value="virtuoso">🎯 Виртуозы</option>
        <option value="outsider">🔻 Аутсайдеры</option>
      `;
  }

  // --- ЛОГИКА КАТЕГОРИЙ (Медианы) ---
  var revenues = [];
  var loads = [];
  doctorKeys.forEach(key => {
      var d = byDoctor[key];
      if (d.revenue > 0) {
          revenues.push(d.revenue);
          loads.push((d.pieceworkAmount / d.revenue) * 100);
      }
  });
  
  var medRev = computeMedianValue(revenues.sort((a,b)=>a-b));
  var medLoad = computeMedianValue(loads.sort((a,b)=>a-b));

  var searchQuery = (searchInput && searchInput.value || "").toLowerCase();
  var categoryFilter = categorySelect ? categorySelect.value : "all";
  var context = { medianRev: metrics.medianDoctorRevenue, medianMarg: metrics.medianDoctorMargin };

  var docList = doctorKeys.map(key => {
    var d = byDoctor[key];
    var revenue = d.revenue;
    var fot = d.pieceworkAmount;
    var load = revenue > 0 ? (fot / revenue * 100) : 0;
    
    // Определение категории (4 квадранта)
    var cat = "outsider";
    var isHighRev = revenue >= medRev;
    var isLowLoad = load <= medLoad;

    if (isHighRev && isLowLoad) cat = "stars";
    else if (isHighRev && !isLowLoad) cat = "workhorse";
    else if (!isHighRev && isLowLoad) cat = "virtuoso";
    else cat = "outsider";

    return {
      name: d.name, revenue: revenue, opex: d.costFull, fot: fot,
      wageLoad: load, profit: d.netProfitFinal, marginPct: d.marginPct,
      payNet: d.payFinalMed, cat: cat
    };
  }).filter(d => {
    if (d.revenue <= 0) return false;
    if (searchQuery && !d.name.toLowerCase().includes(searchQuery)) return false;
    
    // Фильтр по 4 категориям
    if (categoryFilter !== "all" && d.cat !== categoryFilter) return false;
    
    return true;
  });

  docList.sort((a,b) => b.revenue - a.revenue);
  var maxRevenue = docList.length > 0 ? docList[0].revenue : 1; 

  // Пагинация
  var pageSize = 20;
  var page = appState.view.doctorsPage || 1;
  var totalItems = docList.length;
  var totalPages = Math.ceil(totalItems / pageSize) || 1;
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  appState.view.doctorsPage = page;
  
  var visibleDocs = docList.slice((page - 1) * pageSize, page * pageSize);

  // Рендер
  var fontStyle = 'font-family: "Inter", system-ui, sans-serif;';
  var thead = tbody.closest("table").querySelector("thead tr");
  
  if (thead) {
    thead.innerHTML = `
      <th style="${fontStyle} color:#64748b; font-size:11px;">Врач</th>
      <th class="align-right" style="${fontStyle} color:#64748b; font-size:11px;">Выручка (Вал)</th>
      <th class="align-right muted" style="${fontStyle} color:#94a3b8; font-size:11px;" title="Материалы + Внешние">OpEx (Мат/Внеш)</th>
      <th class="align-right muted" style="${fontStyle} color:#94a3b8; font-size:11px;" title="Полная сумма начислений (Gross)">ФОТ (Сделка)</th>
      <th class="align-right" style="${fontStyle} color:#64748b; font-size:11px;">ФОТ %</th>
      <th class="align-right" style="${fontStyle} color:#64748b; font-size:11px;">На руки (Net)</th>
      <th class="align-right" style="${fontStyle} color:#0abab5; font-weight:600; font-size:11px;">Чистая прибыль</th>
      <th class="align-right" style="${fontStyle} color:#64748b; font-size:11px;">Рент. %</th>
    `;
  }

  var catIcons = { stars: "💎", workhorse: "🚜", virtuoso: "🎯", outsider: "🔻" };

  visibleDocs.forEach(d => {
    var tr = document.createElement("tr");
    tr.classList.add("table-row--clickable");
    
    var icon = catIcons[d.cat];
    var profitColor = d.profit >= 0 ? "#0f172a" : "#ef4444";
    var loadColor = d.wageLoad > medLoad ? (d.wageLoad > 50 ? "#ef4444" : "#f59e0b") : "#10b981";
    var barPct = (d.revenue / maxRevenue) * 100;
    var bgGradient = `background: linear-gradient(to right, rgba(59, 130, 246, 0.1) ${barPct.toFixed(1)}%, transparent ${barPct.toFixed(1)}%);`;

    tr.innerHTML = `
      <td style="${fontStyle} font-weight:500; color:#0f172a;">
        <span style="display:inline-block; width:16px; margin-right:4px;">${icon}</span>${d.name}
      </td>
      <td class="align-right" style="${fontStyle} font-weight:600; ${bgGradient}">
        ${formatCurrency(d.revenue)}
      </td>
      <td class="align-right muted" style="${fontStyle} font-size:12px;">${formatCurrency(d.opex)}</td>
      <td class="align-right muted" style="${fontStyle} font-size:12px;">${formatCurrency(d.fot)}</td>
      <td class="align-right" style="${fontStyle} color:${loadColor};">${d.wageLoad.toFixed(1)}%</td>
      <td class="align-right" style="${fontStyle} color:#64748b; font-size:12px; font-weight:600">${formatCurrency(d.payNet)}</td>
      <td class="align-right" style="${fontStyle} font-weight:600; color:${profitColor};">${formatCurrency(d.profit)}</td>
      <td class="align-right" style="${fontStyle} color:${profitColor};">${formatPercent(d.marginPct)}</td>
    `;
    tr.onclick = function() { openDoctorDetailsModal(d.name); };
    tbody.appendChild(tr);
  });

  if (visibleDocs.length === 0) tbody.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center; padding:20px;">Нет данных</td></tr>`;

  if(paginationInfo) paginationInfo.textContent = `Врачи ${(page-1)*pageSize + 1}–${Math.min(page*pageSize, totalItems)} из ${totalItems}`;
  if(prevBtn) prevBtn.disabled = page <= 1;
  if(nextBtn) nextBtn.disabled = page >= totalPages;

  renderDoctorsScatter(metrics);
  renderDoctorsTopChart(metrics);
  renderDoctorsStructureBar(metrics);
  
  if (btnExpand) {
    var newBtn = btnExpand.cloneNode(true);
    btnExpand.parentNode.replaceChild(newBtn, btnExpand);
    newBtn.addEventListener("click", function() { openDoctorsScatterModal(metrics); });
  }
}

/**
 * Динамика пациентопотока по месяцам:
 * - уникальные пациенты
 * - визиты
 * - количество услуг
 */
function renderPatientsFlowChart(rows) {
  var container = document.getElementById("patients-flow-chart");
  if (!container || typeof Chart === "undefined") {
    return;
  }

  // Очищаем контейнер
  container.innerHTML = "";

  // Если есть старый график — уничтожаем
  if (patientsFlowChart) {
    patientsFlowChart.destroy();
    patientsFlowChart = null;
  }

  if (!rows || rows.length === 0) {
    var empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent =
      "Нет данных по пациентам для выбранного периода и фильтров.";
    container.appendChild(empty);
    return;
  }

  // Подготовка массивов по месяцам (1–12)
  var monthLabels = [
    "Янв",
    "Фев",
    "Мар",
    "Апр",
    "Май",
    "Июн",
    "Июл",
    "Авг",
    "Сен",
    "Окт",
    "Ноя",
    "Дек"
  ];

  var servicesByMonth = new Array(12).fill(0);
  var patientsMapsByMonth = [];
  var visitsMapsByMonth = [];

  for (var i = 0; i < 12; i++) {
    patientsMapsByMonth[i] = {};
    visitsMapsByMonth[i] = {};
  }

  // Проходим по строкам и раскладываем по месяцам
  rows.forEach(function (row) {
    if (!row) return;

    var m = row.serviceMonth;
    if (!m || m < 1 || m > 12) return;

    var index = m - 1;

    // Кол-во услуг — стараемся взять из сырых данных / quantity
    var qty = 1;
    if (row.raw) {
      var raw = row.raw;
      qty =
        parseNumber(raw.quantity) ||
        parseNumber(raw.qty) ||
        parseNumber(raw["Кол-во"]) ||
        1;
    } else if (typeof row.quantity === "number") {
      qty = row.quantity || 1;
    }

    servicesByMonth[index] += qty;

    // Пациенты
    var patientKey = row.patientKey || null;
    if (patientKey && !patientsMapsByMonth[index][patientKey]) {
      patientsMapsByMonth[index][patientKey] = true;
    }

    // Визиты
    var visitKey = row.visitKey || null;
    if (visitKey && !visitsMapsByMonth[index][visitKey]) {
      visitsMapsByMonth[index][visitKey] = true;
    }
  });

  // Превращаем карты в числа
  var patientsByMonth = patientsMapsByMonth.map(function (map) {
    return Object.keys(map).length;
  });
  var visitsByMonth = visitsMapsByMonth.map(function (map) {
    return Object.keys(map).length;
  });

  // Проверка: есть ли вообще какие-то данные
  var hasData =
    servicesByMonth.some(function (v) { return v > 0; }) ||
    patientsByMonth.some(function (v) { return v > 0; }) ||
    visitsByMonth.some(function (v) { return v > 0; });

  if (!hasData) {
    var empty2 = document.createElement("div");
    empty2.className = "muted";
    empty2.textContent =
      "Нет данных по пациентам для выбранного периода и фильтров.";
    container.appendChild(empty2);
    return;
  }

  // Создаём canvas внутри контейнера (у тебя там div c id="patients-flow-chart")
  var canvas = document.createElement("canvas");
  container.appendChild(canvas);
  var ctx = canvas.getContext("2d");

  // Градиенты в стиле остальных графиков
  var patientsGradient = createChartGradient
    ? createChartGradient(ctx, "#0ABAB5", "#3fdad6") // новый тёплый бирюзовый
    : "#0ABAB5";
  var visitsGradient = createChartGradient
    ? createChartGradient(ctx, "#22c55e", "#4ade80")
    : "#22c55e";
  var servicesGradient = createChartGradient
    ? createChartGradient(ctx, "#050124", "#190119ff")
    : "#040798ff";

  patientsFlowChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: "Уникальные пациенты",
          data: patientsByMonth,
          borderColor: patientsGradient,
          backgroundColor: "rgba(10, 186, 181, 0.30)", // #0ABAB5, более яркая заливка
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointRadius: 3
        },
        {
          label: "Визиты",
          data: visitsByMonth,
          borderColor: visitsGradient,
          backgroundColor: "rgba(34, 197, 94, 0.08)",
          borderWidth: 2,
          tension: 0.3,
          fill: false,
          pointRadius: 2
        },
        {
          label: "Услуги",
          data: servicesByMonth,
          borderColor: servicesGradient,
          backgroundColor: "rgba(99, 102, 241, 0.08)",
          borderWidth: 2,
          tension: 0.3,
          fill: false,
          pointRadius: 2,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutCubic" },
      interaction: { mode: "index", intersect: false },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Пациенты / визиты"
          },
          grid: { color: "rgba(148, 163, 184, 0.25)" },
          ticks: {
            callback: function (value) {
              return Number(value || 0).toLocaleString("ru-RU");
            }
          }
        },
        y1: {
          beginAtZero: true,
          position: "right",
          title: {
            display: true,
            text: "Услуги"
          },
          grid: { display: false },
          ticks: {
            callback: function (value) {
              return Number(value || 0).toLocaleString("ru-RU");
            }
          }
        },
        x: {
          grid: { display: false }
        }
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (context) {
              var label = context.dataset.label || "";
              var value = context.parsed.y || context.parsed.y1 || 0;
              return (
                label +
                ": " +
                Number(value || 0).toLocaleString("ru-RU") +
                " шт."
              );
            }
          }
        }
      }
    }
  });
}

/**
 * График топ-услуг глазами пациентов:
 * по оси X — услуги, по оси Y — количество пациентов.
 */
function renderPatientsTopServicesChart(servicesArray) {
  var container = document.getElementById("patients-top-services-chart");
  if (!container || typeof Chart === "undefined") {
    return;
  }

  container.innerHTML = "";

  if (patientsTopServicesChart) {
    patientsTopServicesChart.destroy();
    patientsTopServicesChart = null;
  }

  if (!servicesArray || servicesArray.length === 0) {
    var empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent =
      "Нет услуг с идентифицируемыми пациентами для выбранного периода.";
    container.appendChild(empty);
    return;
  }

  // Массив уже отсортирован и обрезан по лимиту в renderPatientsDashboard
  var top = servicesArray;
  var labels = top.map(function (item) {

    // короткий лейбл: либо код, либо укороченное название
    if (item.code && item.name) {
      return item.code;
    }
    return (item.name || item.key).substring(0, 20);
  });

  var patientsData = top.map(function (item) {
    return item.patients;
  });

  var canvas = document.createElement("canvas");
  container.appendChild(canvas);
  var ctx = canvas.getContext("2d");

  var barColor = createChartGradient
    ? createChartGradient(ctx, "#6366f1", "#4f46e5")
    : "#6366f1";

  patientsTopServicesChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Пациентов",
          data: patientsData,
          backgroundColor: barColor,
          borderRadius: 6,
          maxBarThickness: 40
        }
      ]
    },
    options: {
      // Делаем горизонтальные столбики, список услуг читается сверху вниз
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function (items) {
              var idx = items[0].dataIndex;
              var item = top[idx];
              var fullName =
                item.code && item.name
                  ? item.code + " — " + item.name
                  : item.name || item.code || item.key;
              return fullName;
            },
            label: function (context) {
              var idx = context.dataIndex;
              var item = top[idx];
              var pts = item.patients.toLocaleString("ru-RU");
              var shareBase = formatPercent(item.patientSharePct);
              var shareRev = formatPercent(item.revenueSharePct);
              return [
                "Пациентов: " + pts,
                "Доля базы: " + shareBase,
                "Доля выручки: " + shareRev
              ];
            }
          }
        }
      },
      scales: {
        // Теперь X — количество пациентов
        x: {
          beginAtZero: true,
          grid: { color: "rgba(148, 163, 184, 0.25)" },
          ticks: {
            callback: function (value) {
              return Number(value || 0).toLocaleString("ru-RU");
            }
          },
          title: { display: true, text: "Пациентов" }
        },
        // Y — список услуг
        y: {
          grid: { display: false }
        }
      }
    }
  });
}

/**
 * Sankey для Пациентов (Обновленный: Шрифты Inter).
 */
function renderPatientsFlowSankey(departmentsArray, servicesArray, metrics) {
  var container = document.getElementById("patients-flow-sankey");

  if (!container || typeof Highcharts === "undefined") {
    return;
  }

  container.innerHTML = "";

  if (patientsFlowDiagram) {
    patientsFlowDiagram.destroy();
    patientsFlowDiagram = null;
  }

  // --- Логика подготовки данных (как была) ---
  var totalPatients = metrics && metrics.totalUniquePatients ? metrics.totalUniquePatients : 0;
  
  if (!departmentsArray && metrics && metrics.byDepartment) {
     // Фолбэк, если массивы не переданы (но в renderPatientsDashboard мы их передаем)
     // Для безопасности оставим пустым, так как основной вызов идет корректно
  }

  // Проверка на наличие данных
  if (!totalPatients || ((!departmentsArray || !departmentsArray.length) && (!servicesArray || !servicesArray.length))) {
    renderEmptyState(container, { title: "Нет данных для потока" });
    return;
  }

  // Режим
  var mode = (appState.patientsFlow && appState.patientsFlow.mode) || "departments";

  var nodes = [];
  var links = [];
  var rootId = "patients-root";

  // Корневой узел
  nodes.push({ id: rootId, name: "Все пациенты", color: "#0ABAB5", column: 0 });

  // Цвета
  var colorDept = "#0498a5ff";
  var colorDeptLink = "rgba(0, 202, 212, 0.68)";
  var colorService = "#7274eaff";
  var colorServiceLink = "rgba(10, 184, 247, 0.62)";
  var colorOther = "rgba(148, 163, 184, 0.9)";
  var colorOtherLink = "rgba(11, 216, 148, 0.64)";

  // Логика построения узлов
  if (mode === "services") {
    var maxServices = 10;
    var servicesSorted = (servicesArray || []).slice().sort((a, b) => (b.patients || 0) - (a.patients || 0));
    var topServices = servicesSorted.slice(0, maxServices);
    var usedPatients = 0;

    topServices.forEach(function (svc, index) {
      if (!svc || !svc.patients) return;
      var nodeId = "svc-" + index;
      usedPatients += svc.patients;
      var label = (svc.code && svc.name) ? svc.code + " — " + svc.name : (svc.name || "Услуга");
      nodes.push({ id: nodeId, name: label, color: colorService, column: 1 });
      links.push([rootId, nodeId, svc.patients, colorServiceLink]);
    });

    var otherPatients = totalPatients > usedPatients ? totalPatients - usedPatients : 0;
    if (otherPatients > 0) {
      nodes.push({ id: "svc-other", name: "Прочие услуги", color: colorOther, column: 1 });
      links.push([rootId, "svc-other", otherPatients, colorOtherLink]);
    }

  } else {
    // Mode: Departments
    var maxDeps = 10;
    var depsSorted = (departmentsArray || []).slice().sort((a, b) => (b.patients || 0) - (a.patients || 0));
    var topDeps = depsSorted.slice(0, maxDeps);
    var usedPatientsDep = 0;

    topDeps.forEach(function (dep, index) {
      if (!dep || !dep.patients) return;
      var nodeId = "dep-" + index;
      usedPatientsDep += dep.patients;
      nodes.push({ id: nodeId, name: dep.name || "Отделение", color: colorDept, column: 1 });
      links.push([rootId, nodeId, dep.patients, colorDeptLink]);
    });

    var otherPatientsDep = totalPatients > usedPatientsDep ? totalPatients - usedPatientsDep : 0;
    if (otherPatientsDep > 0) {
      nodes.push({ id: "dep-other", name: "Прочие отделения", color: colorOther, column: 1 });
      links.push([rootId, "dep-other", otherPatientsDep, colorOtherLink]);
    }
  }

  // Общий поток для процентов
  var totalFlow = links.reduce((sum, link) => sum + (link[2] || 0), 0);

  // --- ОТРИСОВКА (Стилизованная под Inter) ---
  var fontFamily = "Inter, sans-serif";

  patientsFlowDiagram = Highcharts.chart(container, {
    chart: {
      type: "sankey",
      inverted: false,
      spacing: [10, 10, 10, 10],
      backgroundColor: "transparent",
      style: {
        fontFamily: "Inter, sans-serif" // <--- ИСПРАВЛЕНО
      }
    },
    title: { text: "" },
    credits: { enabled: false },
    tooltip: {
      useHTML: true,
      borderRadius: 8,
      padding: 10,
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      borderWidth: 0,
      shadow: false,
      style: {
        color: "#f8fafc", // Светлый текст
        fontSize: "12px",
        fontFamily: fontFamily // Шрифт тултипа
      },
      formatter: function () {
        var point = this.point;
        var rawValue = point.isNode ? point.sum : point.weight;
        var value = Math.round(rawValue || 0);
        var base = (totalPatients > 0) ? totalPatients : (totalFlow || 1);
        var pct = (value / base) * 100;
        
        var titleText = mode === "services" ? "Пациенты по услугам" : "Пациенты по отделениям";
        var name = point.isNode ? point.name : "";

        // Для потока
        if (!point.isNode) {
           return `<div style="padding:2px">
                    <span style="opacity:0.7">${point.fromNode.name} → ${point.toNode.name}</span><br/>
                    <b>${value.toLocaleString("ru-RU")} чел.</b>
                   </div>`;
        }

        // Для узла
        return `<div style="min-width:180px;">
                  <div style="font-size:11px; opacity:0.7; margin-bottom:4px; font-family:${fontFamily}">${titleText}</div>
                  <div style="font-weight:600; margin-bottom:2px; font-size:13px; font-family:${fontFamily}">${name}</div>
                  <div style="font-size:12px; font-family:${fontFamily}">
                    ${value.toLocaleString("ru-RU")} пациентов · ${pct.toFixed(1)}%
                  </div>
                </div>`;
      }
    },
    plotOptions: {
      sankey: {
        curveFactor: 0.5,
        borderColor: "transparent",
        nodeWidth: 10,
        nodePadding: 15,
        dataLabels: {
          enabled: true,
          useHTML: true, // Важно для стилизации
          style: {
            color: "#0f172a",
            fontSize: "11px",
            fontWeight: "500",
            textOutline: "none",
            fontFamily: fontFamily // Шрифт подписей
          },
          formatter: function () {
            if (!this.point.isNode) return "";
            var name = this.point.name || "";
            if (name.length > 25) name = name.slice(0, 23) + "…";
            return name;
          }
        }
      }
    },
    series: [{
      keys: ["from", "to", "weight", "color"],
      nodes: nodes,
      data: links,
      animation: { duration: 700 }
    }]
  });
}

/**
 * CLINIC DASHBOARD v9.1 (Direct Costing & UI Sync)
 * KPI: Revenue, OpEx, Piecework FOT, Net Profit.
 * Sync: Matches Overview numbers exactly.
 */
function renderClinicDashboard() {
  console.log("renderClinicDashboard: Starting Sync Check...");

  // 1. Подготовка
  if (!preparedDataRows || preparedDataRows.length === 0) return;
  var filteredRows = applyFilters(preparedDataRows, appState.filters);
  var periodRows = filterRowsByPeriod(filteredRows, appState.periodA);
  
  var elRev    = document.getElementById("clinic-kpi-revenue");
  var elBase   = document.getElementById("clinic-kpi-opex");    
  var elVar    = document.getElementById("clinic-kpi-payroll"); 
  var elProfit = document.getElementById("clinic-kpi-profit");  
  var container = document.getElementById("clinic-mega-sankey");

  if (!periodRows || periodRows.length === 0) {
    if (container) container.innerHTML = '<div class="empty-state">Нет данных за выбранный период</div>';
    if (elRev) elRev.textContent = formatCurrency(0);
    return;
  }

  var metrics = calculateMetrics(periodRows);

  // --- 2. РАСЧЕТ KPI (Direct Costing) ---
  
  // A. Выручка
  var valRevenue = metrics.totalRevenue || 0; 

  // B. OpEx (В новой модели costFull = OpEx)
  // Материалы + Внешние + Комиссии
  var valOpEx = metrics.totalCostFull || 0;

  // C. ФОТ Сделка (Единственный ФОТ)
  var valVariableFot = metrics.totalPiecework || 0;

  // D. Чистая прибыль
  var valNetProfit = metrics.totalNetProfitFinal;

  // --- 3. ОБНОВЛЕНИЕ UI ---
  
  if (elRev) elRev.textContent = formatCurrency(valRevenue);

  if (elBase) {
      elBase.textContent = formatCurrency(valOpEx);
      // Уточняем подпись: это не просто база, это операционка
      var card = elBase.closest(".kpi-card");
      if(card) {
          card.querySelector(".kpi-card__title").textContent = "Операц. расходы (OpEx)";
          card.querySelector(".kpi-card__subtitle").textContent = "Материалы, Комиссии, Внешние"; 
      }
  }

  if (elVar) {
      elVar.textContent = formatCurrency(valVariableFot);
      var card = elVar.closest(".kpi-card");
      if(card) card.querySelector(".kpi-card__subtitle").textContent = "На руки + Налоги";
      elVar.style.color = "#f97316"; 
  }
  
  if (elProfit) {
    elProfit.textContent = formatCurrency(valNetProfit);
    elProfit.style.color = valNetProfit >= 0 ? "#0abab5" : "#ef4444";
  }

  // --- 4. Рендер Графиков ---
  if (typeof renderActualFlowSankey === 'function') renderActualFlowSankey(metrics);
  if (typeof renderClinicTableAndDonut === 'function') renderClinicTableAndDonut(metrics);
  if (typeof renderUnitSankey === 'function') renderUnitSankey(metrics); 
}

/**
 * CLINIC SANKEY v9.3 (Dual Percent Tooltips Fix)
 * Fixes:
 * 1. Robust retrieval of custom data points for tooltips.
 * 2. Explicit HTML formatting for "Global %" and "Local %".
 */
function renderActualFlowSankey(metrics) {
  var container = document.getElementById("clinic-mega-sankey");
  if (!container || typeof Highcharts === 'undefined') return;
  container.innerHTML = "";

  var rev = metrics.totalRevenue || 0;
  if (rev <= 0) return;

  // --- 1. Данные (Direct Costing) ---
  var valOpEx = metrics.totalCostFull || 0;
  var valMargin = metrics.totalProfitMethod; 
  var visMargin = Math.max(0, valMargin);

  var valPiecework = metrics.totalPiecework || 0;
  var valProfit = metrics.totalNetProfitFinal;
  
  var visPiecework = valPiecework;
  if (visPiecework > visMargin) visPiecework = visMargin;
  var visProfit = Math.max(0, valProfit);

  var ratio = (metrics.totalPiecework > 0) ? (visPiecework / metrics.totalPiecework) : 0;
  var visTax = (metrics.totalSocialCharges || 0) * ratio;
  var visNetPool = (metrics.totalNetWagePool || 0) * ratio;

  var visShareAdmin = (metrics.totalShareAdmin || 0) * ratio;
  var visShareMed = (visNetPool - visShareAdmin);
  var visPayHand = visShareMed; 

  // --- 2. Конфиг ---
  var fontSpec = "Inter, system-ui, sans-serif";
  var colors = { 
      rev: "#1e3a8a", opex: "#64748b", 
      marg: "#38bdf8", piece: "#f97316", profit: "#0abab5",
      tax: "#ef4444", pool: "#8b5cf6", 
      adm: "#d97706", doc: "#06b6d4", hand: "#10b981"
  };

  function getMeta(val, baseVal, baseName) {
      // Расчет процентов
      var pGlobal = (rev > 0) ? (val / rev * 100).toFixed(1) + "%" : "0%";
      var pLocal = (baseVal > 0) ? (val / baseVal * 100).toFixed(1) + "%" : null;
      
      return { 
          global: pGlobal, 
          local: pLocal, 
          base: baseName 
      };
  }

  // --- 3. Узлы ---
  var nodes = [
      { id: 'Rev',   name: 'Выручка', color: colors.rev, custom: getMeta(rev, 0, null) },
      
      { id: 'OpEx',  name: 'OpEx (Материалы)', color: colors.opex, custom: getMeta(valOpEx, rev, "Выручки") },
      { id: 'Marg',  name: 'Маржинальная прибыль', color: colors.marg, custom: getMeta(visMargin, rev, "Выручки") },
      
      { id: 'Prof',  name: 'Чистая прибыль', color: colors.profit, custom: getMeta(visProfit, visMargin, "Маржи") },
      { id: 'Piece', name: 'ФОТ Сделка (Gross)', color: colors.piece, custom: getMeta(visPiecework, visMargin, "Маржи") },
      
      { id: 'Tax',   name: 'Налоги', color: colors.tax, custom: getMeta(visTax, visPiecework, "ФОТ Gross") },
      { id: 'Pool',  name: 'Чистый котел', color: colors.pool, custom: getMeta(visNetPool, visPiecework, "ФОТ Gross") },
      
      { id: 'Adm',   name: 'Доля Клиники (16%)', color: colors.adm, custom: getMeta(visShareAdmin, visNetPool, "Котла") },
      { id: 'Doc',   name: 'Фонд Врачей (84%)', color: colors.doc, custom: getMeta(visShareMed, visNetPool, "Котла") },
      
      { id: 'Hand',  name: 'Врачам на руки', color: colors.hand, custom: getMeta(visPayHand, visShareMed, "Фонда Врачей") }
  ];

  // --- 4. Связи ---
  var links = [];
  if (valOpEx > 0) links.push({ from: 'Rev', to: 'OpEx', weight: valOpEx });
  if (visMargin > 0) links.push({ from: 'Rev', to: 'Marg', weight: visMargin });
  if (visProfit > 0) links.push({ from: 'Marg', to: 'Prof', weight: visProfit });
  if (visPiecework > 0) links.push({ from: 'Marg', to: 'Piece', weight: visPiecework });
  if (visTax > 0) links.push({ from: 'Piece', to: 'Tax', weight: visTax });
  if (visNetPool > 0) links.push({ from: 'Piece', to: 'Pool', weight: visNetPool });
  if (visShareAdmin > 0) links.push({ from: 'Pool', to: 'Adm', weight: visShareAdmin });
  if (visShareMed > 0) links.push({ from: 'Pool', to: 'Doc', weight: visShareMed });
  if (visPayHand > 0) links.push({ from: 'Doc', to: 'Hand', weight: visPayHand });

  // --- 5. Рендер Highcharts ---
  Highcharts.chart(container, {
      chart: { type: 'sankey', backgroundColor: 'transparent', style: { fontFamily: fontSpec }, height: 480 },
      title: { text: '' }, credits: { enabled: false },
      
      tooltip: {
          useHTML: true, backgroundColor: "rgba(15, 23, 42, 0.98)", borderRadius: 8, borderWidth: 0, shadow: false, padding: 0,
          // ВАЖНО: Доступ к данным через this.point.options.custom (для надежности в Highcharts)
          formatter: function() {
              // Попытка достать custom данные из разных мест (зависит от версии)
              var c = this.point.custom || (this.point.options && this.point.options.custom);
              
              // Если это УЗЕЛ (Node)
              if (this.point.isNode) {
                  if (!c) return `<b>${this.point.name}</b>`;
                  
                  // Формируем строку с локальным процентом только если он есть
                  var localLine = c.local 
                      ? `<div style="display:flex; justify-content:space-between; margin-top:4px; color:#cbd5e1; border-top:1px solid rgba(255,255,255,0.1); padding-top:4px;">
                           <span>От ${c.base}:</span> <b style="color:#fff">${c.local}</b>
                         </div>` 
                      : '';

                  return `
                    <div style="padding:12px; font-family:${fontSpec}; color:#f8fafc; min-width:180px;">
                        <div style="font-size:13px; font-weight:600; color:${this.point.color}; margin-bottom:4px;">
                            ${this.point.name}
                        </div>
                        <div style="font-size:18px; font-weight:700; margin-bottom:8px;">
                            ${formatCurrency(this.point.sum)}
                        </div>
                        <div style="font-size:11px; line-height:1.4;">
                            <div style="display:flex; justify-content:space-between;">
                                <span style="opacity:0.8">От Выручки:</span> <b style="color:#fff">${c.global}</b>
                            </div>
                            ${localLine}
                        </div>
                    </div>`;
              }
              
              // Если это СВЯЗЬ (Link)
              return `
                <div style="padding:8px; font-family:${fontSpec}; color:#f8fafc; font-size:11px;">
                    <span style="opacity:0.7">${this.point.fromNode.name} → ${this.point.toNode.name}</span><br/>
                    <b style="font-size:14px;">${formatCurrency(this.point.weight)}</b>
                </div>`;
          }
      },
      
      plotOptions: {
          sankey: {
              nodePadding: 20,
              dataLabels: {
                  enabled: true, useHTML: true,
                  style: { color: '#0f172a', fontSize: '11px', fontWeight: '600', textOutline: 'none', fontFamily: fontSpec },
                  formatter: function() {
                      if (!this.point.isNode) return "";
                      if (this.point.sum < rev * 0.015) return ""; 
                      return `${this.point.name}<br/><span style="opacity:0.6; font-weight:400; font-size:10px">${formatShortCurrency(this.point.sum)}</span>`;
                  }
              }
          }
      },
      series: [{ nodes: nodes, data: links }]
  });
}

/**
 * CLINIC TABLE & DONUT v9.3 (Font Fix)
 * Fixes:
 * 1. DataLabels font explicitly set to 'Inter'.
 * 2. Center Text font explicitly set to 'Inter'.
 */
function renderClinicTableAndDonut(metrics) {
    var tbody = document.getElementById("clinic-pl-table-body");
    var fontSpec = "Inter, system-ui, sans-serif"; // Единый шрифт

    // 1. Данные
    var r = metrics.totalRevenue || 0;
    var opex = metrics.totalCostFull || 0; 
    var margin = metrics.totalProfitMethod || 0;
    var piecework = metrics.totalPiecework || 0;
    var netProfit = metrics.totalNetProfitFinal;

    // 2. Таблица
    if (tbody) {
        tbody.innerHTML = "";
        
        function addRow(label, val, isBold, isResult, indent) {
            var pct = r > 0 ? (val / r * 100) : 0;
            var barColor = isResult ? (val >= 0 ? "#0abab5" : "#ef4444") : "#64748b";
            var weight = isBold ? "600" : "400";
            var pad = indent ? "padding-left: 20px;" : "";
            
            var tr = document.createElement("tr");
            if (label === "Чистая прибыль") tr.style.background = "#f8fafc";

            tr.innerHTML = `
                <td style="font-family:${fontSpec}; padding:8px; color:#0f172a; font-weight:${weight}; ${pad}">${label}</td>
                <td class="align-right" style="font-family:${fontSpec}; font-weight:${weight}">${formatCurrency(val)}</td>
                <td class="align-right muted">
                    <div style="display:flex; align-items:center; justify-content:flex-end;">
                        <span style="margin-right:8px; font-size:11px; width:35px; font-family:${fontSpec}">${pct.toFixed(1)}%</span>
                        <div style="width:40px; height:4px; background:#e2e8f0; border-radius:2px; overflow:hidden;">
                            <div style="width:${Math.min(Math.abs(pct), 100)}%; height:100%; background:${barColor};"></div>
                        </div>
                    </div>
                </td>
                <td class="align-right"><span class="muted" style="font-size:11px">—</span></td>
                <td class="align-right"><span class="muted" style="font-size:11px">—</span></td>
            `;
            tbody.appendChild(tr);
        }

        addRow("Выручка", r, true, false, false);
        addRow("Операционные расходы (OpEx)", opex, false, false, true);
        addRow("Маржинальная прибыль", margin, true, true, false);
        addRow("ФОТ Сделка (Переменные)", piecework, false, false, true);
        addRow("Чистая прибыль", netProfit, true, true, false);
    }

    // 3. DONUT CHART
    var canvas = document.getElementById("clinic-structure-donut");
    if (canvas) {
        var ctx = canvas.getContext("2d");
        if (Chart.getChart(canvas)) Chart.getChart(canvas).destroy();

        var visProfit = Math.max(0, netProfit);
        
        var gradOpEx = createChartGradient(ctx, "#64748b", "#94a3b8");
        var gradVar  = createChartGradient(ctx, "#f97316", "#fb923c");
        var gradProf = createChartGradient(ctx, "#0abab5", "#2dd4bf");

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ["OpEx (Расходы)", "ФОТ Сделка", "Прибыль"],
                datasets: [{
                    data: [opex, piecework, visProfit],
                    backgroundColor: [gradOpEx, gradVar, gradProf],
                    borderWidth: 2, borderColor: "#ffffff"
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: "65%",
                layout: { padding: 20 },
                plugins: {
                    legend: { 
                        position: 'bottom', 
                        labels: { 
                            usePointStyle: true, 
                            font: { family: fontSpec, size: 11 }, // Legend Font
                            padding: 15, 
                            color: "#334155" 
                        } 
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleFont: { family: fontSpec, size: 13, weight: '600' }, // Tooltip Title Font
                        bodyFont: { family: fontSpec, size: 12 }, // Tooltip Body Font
                        callbacks: {
                            label: function(ctx) {
                                var val = ctx.raw;
                                if (ctx.label === "Прибыль") val = netProfit;
                                var pct = r > 0 ? (val / r * 100).toFixed(1) + "%" : "0%";
                                return `${ctx.label}: ${formatShortCurrency(val)} (${pct})`;
                            }
                        }
                    },
                    // FIX: Явное указание шрифта для цифр на графике
                    datalabels: {
                        display: function(ctx) { return (ctx.dataset.data[ctx.dataIndex] / r) > 0.05; },
                        color: '#ffffff',
                        font: { family: fontSpec, weight: '700', size: 11 }, // DataLabels Font
                        formatter: function(value, ctx) {
                            var pct = (value / r * 100).toFixed(0) + "%";
                            return pct;
                        }
                    },
                    doughnutCenterText: {
                        text: formatShortCurrency(netProfit),
                        subtext: "Прибыль",
                        color: netProfit >= 0 ? "#0abab5" : "#ef4444",
                        fontFamily: fontSpec, // Center Text Font
                        fontSize: 20,
                        subFontSize: 11
                    }
                }
            },
            plugins: [ChartDataLabels, doughnutCenterTextPlugin]
        });
    }
}

/**
 * Эвристика: Определение категории услуги по названию.
 */
function detectServiceCategory(name) {
  var n = (name || "").toLowerCase();
  
  if (n.indexOf("прием") !== -1 || n.indexOf("консультация") !== -1 || n.indexOf("осмотр") !== -1) {
    return "consultation"; // Приемы
  }
  if (n.indexOf("узи") !== -1 || n.indexOf("рентген") !== -1 || n.indexOf("кт ") !== -1 || n.indexOf("мрт") !== -1 || n.indexOf("анализ") !== -1) {
    return "diagnostic";   // Диагностика
  }
  if (n.indexOf("операция") !== -1 || n.indexOf("наркоз") !== -1 || n.indexOf("стационар") !== -1) {
    return "surgery";      // Хирургия/Стационар
  }
  if (n.indexOf("проба") !== -1 || n.indexOf("тест") !== -1) {
    return "diagnostic";
  }
  return "procedure";      // Остальное считаем процедурами/манипуляциями
}

/* ==========================================================================
   SERVICES DASHBOARD v10.0 (AUDITED)
   Logic: Direct Costing (Rev - OpEx - Piecework = Net Profit)
   Design: Inter Font, Tiffany Colors, Interactive Sorting
   ========================================================================== */

// Локальное состояние для таблицы услуг (Сортировка и Пагинация)
var servicesUiState = {
  sortField: 'revenue', // По умолчанию сортируем по выручке
  sortDir: 'desc',      // По убыванию
  page: 1,
  pageSize: 20
};

/**
 * Главная функция рендера раздела "Услуги"
 */
function renderServicesDashboard() {
  var container = document.querySelector('[data-dashboard="services"]');
  if (!container) return;

  var tbody = document.getElementById("services-table-body");
  
  // KPI Elements
  var kpiRevenue = document.getElementById("svc-kpi-revenue");
  var kpiCount = document.getElementById("svc-kpi-count");
  var kpiMargin = document.getElementById("svc-kpi-margin");
  var kpiLoss = document.getElementById("svc-kpi-loss-count");

  // Controls
  var searchInput = document.getElementById("services-search-input");
  var filterSelect = document.getElementById("services-category-filter");
  var paginationInfo = document.getElementById("services-pagination-info");
  var prevBtn = document.getElementById("services-page-prev");
  var nextBtn = document.getElementById("services-page-next");

  // 1. ПОДГОТОВКА ДАННЫХ
  if (!preparedDataRows || preparedDataRows.length === 0) return;

  var filteredRows = applyFilters(preparedDataRows, appState.filters);
  var periodRows = filterRowsByPeriod(filteredRows, appState.periodA);
  
  // Пустое состояние
  if (!periodRows || periodRows.length === 0) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center; padding:30px;">Нет данных за выбранный период</td></tr>';
    if (kpiRevenue) kpiRevenue.textContent = "0 ₽";
    return;
  }

  var metrics = calculateMetrics(periodRows);
  var byService = metrics.byService || {};
  
  // 2. АГРЕГАЦИЯ И ПРЕОБРАЗОВАНИЕ В МАССИВ
  var totalRevenue = 0;
  var totalNetProfit = 0;
  var lossCount = 0;

  var servicesList = Object.values(byService).map(function(d) {
    var rev = d.revenue || 0;
    // DIRECT COSTING LOGIC CHECK:
    // Profit = Net Profit Final (Calculated in calculateMetrics -> calculateRowEconomics)
    // Cost = Revenue - Net Profit
    var profit = d.netProfitFinal; 
    var cost = rev - profit; // Это сумма OpEx + Piecework (Сделка)
    
    // KPI Counters
    totalRevenue += rev;
    totalNetProfit += profit;
    if (profit < 0) lossCount++;

    return {
      name: d.name,
      code: d.code || "",
      count: d.count,
      avgPrice: d.count > 0 ? rev / d.count : 0,
      revenue: rev,
      costTotal: cost, // OpEx + FOT Var
      profit: profit,
      rentability: rev > 0 ? (profit / rev * 100) : 0
    };
  });

  // 3. ОБНОВЛЕНИЕ KPI
  if (kpiRevenue) kpiRevenue.textContent = formatCurrency(totalRevenue);
  if (kpiCount) kpiCount.textContent = metrics.totalQuantity.toLocaleString("ru-RU");
  
  if (kpiMargin) {
    // Меняем заголовок на Рентабельность (ROS) для единообразия
    var card = kpiMargin.closest(".kpi-card");
    if (card) {
        var t = card.querySelector(".kpi-card__title");
        var s = card.querySelector(".kpi-card__subtitle");
        if(t) t.textContent = "Рентабельность (ROS)";
        if(s) s.textContent = "Средняя по портфелю";
    }
    var totalRos = totalRevenue > 0 ? (totalNetProfit / totalRevenue * 100) : 0;
    kpiMargin.textContent = formatPercent(totalRos);
    kpiMargin.style.color = totalRos >= 15 ? "#10b981" : (totalRos > 0 ? "#0f172a" : "#ef4444");
  }

  if (kpiLoss) {
      kpiLoss.textContent = lossCount;
      kpiLoss.style.color = lossCount > 0 ? "#ef4444" : "#0f172a";
  }

  // 4. ФИЛЬТРАЦИЯ И СОРТИРОВКА (ТАБЛИЦА)
  var searchQuery = (searchInput && searchInput.value || "").toLowerCase();
  var catFilter = filterSelect ? filterSelect.value : "all";

  // A. Фильтр
  var displayList = servicesList.filter(function(s) {
    // Поиск
    if (searchQuery) {
      var text = (s.name + " " + s.code).toLowerCase();
      if (!text.includes(searchQuery)) return false;
    }
    // Категории
    if (catFilter === "loss") return s.profit < 0;
    if (catFilter === "high_margin") return s.rentability > 30;
    if (catFilter === "popular") return true; // Сортировка обрабатывается ниже
    return true;
  });

  // B. Сортировка (State-based)
  displayList.sort(function(a, b) {
    var valA = a[servicesUiState.sortField];
    var valB = b[servicesUiState.sortField];
    
    // Для строк
    if (typeof valA === 'string') {
        return servicesUiState.sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    // Для чисел
    return servicesUiState.sortDir === 'asc' ? valA - valB : valB - valA;
  });

  // C. Пагинация
  var totalItems = displayList.length;
  var totalPages = Math.ceil(totalItems / servicesUiState.pageSize) || 1;
  if (servicesUiState.page > totalPages) servicesUiState.page = 1;
  
  var startIndex = (servicesUiState.page - 1) * servicesUiState.pageSize;
  var visibleList = displayList.slice(startIndex, startIndex + servicesUiState.pageSize);

  // 5. РЕНДЕР ТАБЛИЦЫ
  if (tbody) {
    // a. Рендер Шапки с индикаторами сортировки
    var thead = tbody.closest("table").querySelector("thead tr");
    if (thead) {
        var columns = [
            { id: 'name', label: 'Услуга' },
            { id: 'count', label: 'Кол-во', align: 'right' },
            { id: 'avgPrice', label: 'Цена', align: 'right' },
            { id: 'revenue', label: 'Выручка', align: 'right' },
            { id: 'costTotal', label: 'OpEx + ФОТ', align: 'right', hint: 'Полные расходы (Прямые + Сделка)' },
            { id: 'profit', label: 'Прибыль (Net)', align: 'right', color: '#0abab5' },
            { id: 'rentability', label: 'Рент. %', align: 'right' }
        ];

        thead.innerHTML = columns.map(col => {
            var arrow = (servicesUiState.sortField === col.id) 
                ? (servicesUiState.sortDir === 'asc' ? ' ↑' : ' ↓') 
                : '';
            var style = `font-family:'Inter', sans-serif; font-size:11px; cursor:pointer; color:${col.color || '#64748b'};`;
            var alignClass = col.align === 'right' ? 'align-right' : '';
            var hintHtml = col.hint ? `<span class="help-icon" style="margin-left:4px; width:14px; height:14px; font-size:9px;" data-tooltip="${col.hint}">?</span>` : '';
            
            // data-sort атрибут для обработчика клика
            return `<th class="${alignClass} sortable-th" data-sort-key="${col.id}" style="${style}">
                      ${col.label}${arrow}${hintHtml}
                    </th>`;
        }).join('');
        
        // Навешиваем слушатели событий на заголовки (один раз через делегирование или пересоздание)
        // Простой вариант:
        var ths = thead.querySelectorAll('.sortable-th');
        ths.forEach(th => {
            th.onclick = function() {
                var key = this.getAttribute('data-sort-key');
                if (servicesUiState.sortField === key) {
                    servicesUiState.sortDir = (servicesUiState.sortDir === 'desc') ? 'asc' : 'desc';
                } else {
                    servicesUiState.sortField = key;
                    servicesUiState.sortDir = 'desc'; // По умолчанию убывание для чисел
                }
                renderServicesDashboard(); // Перерисовка
            };
        });
    }

    // b. Рендер Тела
    tbody.innerHTML = "";
    var fontStyle = 'font-family: "Inter", system-ui, sans-serif;';
    var maxRev = Math.max(...displayList.map(s => s.revenue)) || 1;

    visibleList.forEach(function(s) {
      var tr = document.createElement("tr");
      tr.className = "table-row--clickable";
      
      // Стилизация значений
      var profitColor = s.profit >= 0 ? "#0f172a" : "#ef4444"; // Черный или Красный
      var rentStyle = s.rentability < 0 ? "color:#ef4444; font-weight:600;" : (s.rentability > 30 ? "color:#10b981;" : "");
      
      // Микро-бар для выручки
      var barW = (s.revenue / maxRev) * 60; // макс 60px

      tr.innerHTML = `
        <td style="${fontStyle}">
            <div style="font-weight:500; color:#0f172a; max-width:280px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${s.name}">
                ${s.name}
            </div>
            <div class="muted" style="font-size:10px; margin-top:2px;">${s.code}</div>
        </td>
        <td class="align-right" style="${fontStyle}">${s.count}</td>
        <td class="align-right" style="${fontStyle} color:#64748b;">${formatCurrency(s.avgPrice)}</td>
        <td class="align-right" style="${fontStyle}">
            <div style="font-weight:600; color:#0f172a">${formatCurrency(s.revenue)}</div>
            <div style="height:3px; width:${barW}px; background:#3b82f6; border-radius:2px; margin-left:auto; opacity:0.4;"></div>
        </td>
        <td class="align-right muted" style="${fontStyle}">${formatCurrency(s.costTotal)}</td>
        <td class="align-right" style="${fontStyle} font-weight:600; color:${profitColor};">
            ${formatCurrency(s.profit)}
        </td>
        <td class="align-right" style="${fontStyle} ${rentStyle}">
            ${formatPercent(s.rentability)}
        </td>
      `;
      
      tr.onclick = function() { openServiceDetailsModal(s.code, s.name); };
      tbody.appendChild(tr);
    });
  }

  // 6. ОБНОВЛЕНИЕ КОНТРОЛОВ ПАГИНАЦИИ
  if(paginationInfo) paginationInfo.textContent = `Показано ${startIndex+1}–${Math.min(startIndex+servicesUiState.pageSize, totalItems)} из ${totalItems}`;
  if(prevBtn) prevBtn.disabled = servicesUiState.page <= 1;
  if(nextBtn) nextBtn.disabled = servicesUiState.page >= totalPages;

  // ОБНОВЛЕНИЕ ОБРАБОТЧИКОВ КНОПОК ПАГИНАЦИИ (Клонирование для удаления старых)
  if (prevBtn) {
      var newPrev = prevBtn.cloneNode(true);
      prevBtn.parentNode.replaceChild(newPrev, prevBtn);
      newPrev.addEventListener('click', function() { servicesUiState.page--; renderServicesDashboard(); });
  }
  if (nextBtn) {
      var newNext = nextBtn.cloneNode(true);
      nextBtn.parentNode.replaceChild(newNext, nextBtn);
      newNext.addEventListener('click', function() { servicesUiState.page++; renderServicesDashboard(); });
  }

  // 7. РЕНДЕР ГРАФИКОВ
  renderServicesStructureBar(metrics);
  renderServicesScatter(metrics);
  renderServicesTopChart(metrics);
} 

/**
 * Smart Gender Detector v3.1 (Multi-language Support)
 * Поддерживает Кириллицу и Латиницу. Проверяет Фамилию и Имя.
 */
function detectGender(name) {
  if (!name) return "unknown";
  
  // Нормализация
  const n = String(name).trim().toLowerCase().replace(/ё/g, 'е');
  // Разбиваем на слова
  const parts = n.split(/[\s\.]+/).filter(p => p.length > 1);
  
  if (parts.length === 0) return "unknown";

  // 1. ЖЕЛЕЗНОЕ ПРАВИЛО: Отчество (Только РФ)
  for (let part of parts) {
    if (part.endsWith("вна") || part.endsWith("чна") || part.endsWith("инична")) return "female";
    if (part.endsWith("вич") || part.endsWith("лич")) return "male";
  }

  // 2. СЛОВАРИ ОКОНЧАНИЙ (Кириллица + Латиница для фамилий)
  for (let part of parts) {
    // Женские окончания фамилий
    if (part.endsWith("ова") || part.endsWith("ева") || part.endsWith("ина") || part.endsWith("aya") || part.endsWith("ova") || part.endsWith("eva")) return "female";
    // Мужские окончания фамилий
    if (part.endsWith("ов") || part.endsWith("ев") || part.endsWith("ин") || part.endsWith("ий") || part.endsWith("ov") || part.endsWith("ev") || part.endsWith("iy")) return "male";
  }

  // 3. ЭВРИСТИКА ПО ИМЕНИ/ФАМИЛИИ (Последняя буква)
  // Проверяем первое слово (обычно Фамилия) и второе (Имя), если есть.
  const wordsToCheck = parts.slice(0, 2); 

  // Списки согласных (Признак мужского пола)
  const cyrillicConsonants = ["б","в","г","д","ж","з","й","к","л","м","н","п","р","с","т","ф","х","ц","ч","ш","щ"];
  const latinConsonants = ["b","c","d","f","g","h","j","k","l","m","n","p","q","r","s","t","v","w","x","z"];

  for (let word of wordsToCheck) {
    const lastChar = word.slice(-1);
    
    // Если заканчивается на согласную — скорее всего Мужчина (Иванов, Олег, Mark, Alex)
    if (cyrillicConsonants.includes(lastChar) || latinConsonants.includes(lastChar)) {
        return "male";
    }
    
    // Если заканчивается на "a" или "я" — скорее всего Женщина (Мария, Anna, Irina)
    // Исключения (Илья, Никита) здесь могут дать сбой, но статистически это < 1%
    if (lastChar === "а" || lastChar === "я" || lastChar === "a") {
        // Не возвращаем сразу, так как "Duma" (фамилия) может быть мужской.
        // Но если это Имя (второе слово), то вероятность Female выше.
        if (word === parts[1]) return "female";
    }
  }
  
  return "unknown"; 
}

/**
 * Расчет возраста с защитой от пустых дат.
 */
function calculateAge(birthDate) {
  if (!birthDate) return null;
  
  // Если пришла строка, пробуем превратить в дату
  var birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  
  // Проверка на валидность даты
  if (isNaN(birth.getTime())) return null;

  var today = new Date();
  var age = today.getFullYear() - birth.getFullYear();
  var m = today.getMonth() - birth.getMonth();
  
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * PATIENTS DASHBOARD v5.2 (Synced & Clean)
 * Guaranteed consistency with Services dashboard.
 */
function renderPatientsDashboard() {
  var dashboard = document.querySelector('[data-dashboard="patients"]');
  if (!dashboard) return;

  // KPI Elements
  var kpiUnique = document.getElementById("patients-kpi-unique");
  var kpiVisits = document.getElementById("patients-kpi-visits");
  var kpiServices = document.getElementById("patients-kpi-services");
  var kpiQuality = document.getElementById("patients-kpi-data-quality");
  var kpiCheckPat = document.getElementById("patients-kpi-avg-check-patient");
  var kpiCheckVis = document.getElementById("patients-kpi-avg-check-visit");
  var kpiDepth = document.getElementById("patients-kpi-services-per-patient");
  var kpiRevPat = document.getElementById("patients-kpi-avg-revenue-patient");

  // Tables
  var tbodyServices = document.getElementById("patients-top-services-tbody");
  var tbodyDepartments = document.getElementById("patients-departments-table-body");
  
  if (tbodyServices) tbodyServices.innerHTML = "";
  if (tbodyDepartments) tbodyDepartments.innerHTML = "";

  // 1. Data Prep
  if (!preparedDataRows || preparedDataRows.length === 0) return;

  var filteredRows = applyFilters(preparedDataRows, appState.filters); // Применяем фильтры (врач, отделение...)
  var periodRows = filterRowsByPeriod(filteredRows, appState.periodA); // Применяем период
  
  if (!periodRows || periodRows.length === 0) {
      if(kpiUnique) kpiUnique.textContent = "0";
      return;
  }

  // Считаем метрики (Single Source of Truth)
  var metrics = calculateMetrics(periodRows);

  // 2. KPI Updates
  if(kpiUnique) kpiUnique.textContent = metrics.totalUniquePatients.toLocaleString("ru-RU");
  if(kpiVisits) kpiVisits.textContent = metrics.totalVisits.toLocaleString("ru-RU");
  
  // SYNC CHECK: Используем totalQuantity, чтобы совпадало с разделом "Услуги"
  if(kpiServices) kpiServices.textContent = metrics.totalQuantity.toLocaleString("ru-RU");
  
  // Quality (Rows with Patient Name / Total Rows)
  var totalRows = (metrics.rowsWithPatientKey + metrics.rowsWithoutPatientKey) || 1;
  var qualityPct = (metrics.rowsWithPatientKey / totalRows) * 100;
  if(kpiQuality) {
      kpiQuality.textContent = formatPercent(qualityPct);
      kpiQuality.style.color = qualityPct > 95 ? "#10b981" : (qualityPct > 80 ? "#f59e0b" : "#ef4444");
  }

  if(kpiCheckPat) kpiCheckPat.textContent = formatCurrency(metrics.avgCheckPerPatient);
  
  var avgCheckVisit = metrics.totalVisits > 0 ? metrics.totalRevenue / metrics.totalVisits : 0;
  if(kpiCheckVis) kpiCheckVis.textContent = formatCurrency(avgCheckVisit);
  
  if(kpiDepth) kpiDepth.textContent = metrics.servicesPerPatient.toFixed(2);
  if(kpiRevPat) kpiRevPat.textContent = formatCurrency(metrics.avgCheckPerPatient);

  // 3. Table Data Preparation
  var deptMap = {};
  var svcMap = {};

  periodRows.forEach(function(row) {
    var patKey = row.patientKey;
    var visitKey = row.visitKey;
    var qty = row.quantity || 1;
    var rev = row.amountPaid || 0;
    
    // Departments
    var dName = row.department || "Не указано";
    if (!deptMap[dName]) deptMap[dName] = { name: dName, patientsSet: {}, visitsSet: {}, services: 0, revenue: 0 };
    deptMap[dName].services += qty;
    deptMap[dName].revenue += rev;
    if (patKey) deptMap[dName].patientsSet[patKey] = true;
    if (visitKey) deptMap[dName].visitsSet[visitKey] = true;

    // Services
    var sName = row.serviceName || row.serviceCode || "Услуга";
    if (!svcMap[sName]) svcMap[sName] = { name: sName, patientsSet: {}, count: 0, revenue: 0 };
    svcMap[sName].count += qty;
    svcMap[sName].revenue += rev;
    if (patKey) svcMap[sName].patientsSet[patKey] = true;
  });

  // Convert to Arrays
  var departmentsArray = Object.values(deptMap).map(function(d) {
    return {
      name: d.name,
      patients: Object.keys(d.patientsSet).length,
      visits: Object.keys(d.visitsSet).length,
      services: d.services,
      revenue: d.revenue
    };
  });

  var servicesArray = Object.values(svcMap).map(function(s) {
    return {
      name: s.name,
      patients: Object.keys(s.patientsSet).length,
      revenue: s.revenue,
      patientSharePct: metrics.totalUniquePatients > 0 ? (Object.keys(s.patientsSet).length / metrics.totalUniquePatients * 100) : 0
    };
  });

  var fontStyle = 'font-family: "Inter", system-ui, sans-serif; font-size:11px;';

  // 4. Render Top Services Table
  servicesArray.sort(function(a,b) { return b.patients - a.patients; });
  var topServices = servicesArray.slice(0, 10);
  var maxPatientsSvc = topServices.length > 0 ? topServices[0].patients : 1;

  if (tbodyServices) {
    topServices.forEach(function(s) {
      var tr = document.createElement("tr");
      var barWidth = (s.patients / maxPatientsSvc) * 50; 

      tr.innerHTML = 
        `<td style="${fontStyle}"><div style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${s.name}">${s.name}</div></td>` +
        `<td class="align-right" style="${fontStyle}">
            <div style="font-weight:600;">${s.patients}</div>
            <div style="height:3px; background:#3b82f6; width:${barWidth}px; margin-left:auto; opacity:0.5; border-radius:2px;"></div>
         </td>` +
        `<td class="align-right muted" style="${fontStyle}">${s.patientSharePct.toFixed(1)}%</td>`;
      tbodyServices.appendChild(tr);
    });
  }

  // 5. Render Departments Table
  departmentsArray.sort(function(a,b) { return b.patients - a.patients; });
  var maxPatDept = departmentsArray.length > 0 ? departmentsArray[0].patients : 1;

  if (tbodyDepartments) {
    departmentsArray.forEach(function(d) {
      var svcPerPat = d.patients > 0 ? d.services / d.patients : 0;
      var checkPerPat = d.patients > 0 ? d.revenue / d.patients : 0;
      var barWidth = (d.patients / maxPatDept) * 50; 

      var tr = document.createElement("tr");
      tr.innerHTML = 
        `<td style="${fontStyle} font-weight:500;">${d.name}</td>` +
        `<td class="align-right" style="${fontStyle}">
            <div style="font-weight:600; color:#0f172a;">${d.patients}</div>
            <div style="height:3px; background:#0abab5; width:${barWidth}px; margin-left:auto; opacity:0.6; border-radius:2px;"></div>
        </td>` +
        `<td class="align-right" style="${fontStyle}">${d.visits}</td>` +
        `<td class="align-right" style="${fontStyle}">${d.services}</td>` +
        `<td class="align-right" style="${fontStyle}">${formatCurrency(d.revenue)}</td>` +
        `<td class="align-right" style="${fontStyle}">${svcPerPat.toFixed(1)}</td>` +
        `<td class="align-right" style="${fontStyle}">${formatCurrency(checkPerPat)}</td>`;
      tbodyDepartments.appendChild(tr);
    });
  }

  // 6. Render Charts
  renderPatientsFlowSankey(departmentsArray, servicesArray, metrics);
  renderPatientsDynamics(periodRows);
  renderPatientsDemographics(metrics); // Исправленная версия ниже
}

/**
 * DEPARTMENT P&L WATERFALL v9.1 (Labels Sync)
 * Labels match the main table perfectly.
 */
function renderDepartmentFlowChart(byDepartment, preferredName) {
  var canvas = document.getElementById("department-pl-chart");
  var select = document.getElementById("department-pl-chart-select");

  if (!canvas || !select) return;

  var ctx = canvas.getContext("2d");
  if (Chart.getChart(canvas)) Chart.getChart(canvas).destroy();

  var names = Object.keys(byDepartment || {}).sort();
  if (names.length === 0) return;

  if (select.options.length === 0 || select.options.length !== names.length) {
    select.innerHTML = "";
    names.forEach(function (name) {
      var opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      select.appendChild(opt);
    });
  }

  var selectedName = preferredName;
  if (!selectedName || !byDepartment[selectedName]) selectedName = select.value || names[0];
  select.value = selectedName;
  lastDepartmentForChart = selectedName;

  var d = byDepartment[selectedName];
  
  // ДАННЫЕ
  var revenue = d.revenue || 0;
  var opCosts = d.costFull || 0; 
  var laborVar = d.pieceworkAmount || 0;
  var netProfit = d.netProfitFinal;

  var data = [
    [0, revenue],                                  
    [revenue, revenue - opCosts],                  
    [revenue - opCosts, netProfit],                
    [0, netProfit]                                 
  ];

  // СИНХРОНИЗИРОВАННЫЕ НАЗВАНИЯ
  var labels = ["Выручка", "OpEx (Материалы)", "ФОТ (Сделка)", "Чистая прибыль"];
  
  var gRev = createChartGradient(ctx, "#3b82f6", "#60a5fa");
  var gOpEx = createChartGradient(ctx, "#64748b", "#94a3b8");
  var gVar = createChartGradient(ctx, "#f97316", "#fb923c");
  var gProf = netProfit >= 0 
    ? createChartGradient(ctx, "#0abab5", "#2dd4bf")
    : createChartGradient(ctx, "#ef4444", "#f87171");

  var bgColors = [gRev, gOpEx, gVar, gProf];
  var fontSpec = "Inter, system-ui, sans-serif";

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ data: data, backgroundColor: bgColors, borderRadius: 6, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { family: fontSpec, size: 13 },
          bodyFont: { family: fontSpec, size: 12 },
          callbacks: {
            label: function(ctx) {
              var val = Math.abs(ctx.raw[1] - ctx.raw[0]);
              return ctx.label + ": " + formatCurrency(val);
            }
          }
        },
        datalabels: {
          display: true, color: '#ffffff',
          font: { family: fontSpec, weight: 'bold', size: 11 },
          formatter: function(value, context) {
            var val = value[1] - value[0];
            if (Math.abs(val) < revenue * 0.05) return "";
            var prefix = (context.dataIndex === 1 || context.dataIndex === 2) ? "-" : "";
            return prefix + formatShortCurrency(Math.abs(val));
          }
        }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: "rgba(148, 163, 184, 0.15)" }, ticks: { callback: v => formatShortCurrency(v), font: { family: fontSpec }, color: "#64748b" } },
        x: { grid: { display: false }, ticks: { font: { family: fontSpec, weight: 500 }, color: "#64748b" } }
      }
    },
    plugins: [ChartDataLabels]
  });

  select.onchange = function () { renderDepartmentFlowChart(byDepartment, select.value); };
}

/**
 * Визуализация P&L врача в виде Donut-диаграммы
 * STRICT MODE: Uses pieceworkAmount.
 */
function renderDoctorFlowChart(byDoctor, selectedName) {
  var canvas = document.getElementById("doctor-pl-chart");
  var subtitleEl = document.getElementById("doctor-detail-subtitle");

  if (!canvas || !subtitleEl) return;

  var ctx = canvas.getContext("2d");
  if (doctorFlowChart) { doctorFlowChart.destroy(); doctorFlowChart = null; }

  var names = Object.keys(byDoctor || {});
  if (names.length === 0 || !selectedName || !byDoctor[selectedName]) {
    subtitleEl.textContent = "Выберите врача в таблице слева для детализации.";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  var d = byDoctor[selectedName];

  var revenue = d.revenue || 0;
  var costNoWages = d.costNoWages || 0;
  var costCommission = d.costCommission || 0;
  var costExternal = d.costExternal || 0;
  
  // ФОТ Оклад
  var wagesFull = (d.laborCost || 0) + (d.socialCharges || 0); // Внимание: для группы laborCost это база.
  // Но мы можем использовать wagesBase (алиас) или сумму компонентов, если она доступна.
  // В calculateMetrics мы делали g.laborCost. 
  // Лучше брать d.wagesBase (который мы создали как алиас) или d.laborCost
  var laborPart = d.laborCost || 0; 
  
  // ФОТ Сделка (Piecework)
  // В calculateMetrics мы писали: g.pieceworkAmount += row.pieceworkAmount;
  // И g.socialCharges += row.socialChargesTotal;
  var pieceworkPart = (d.pieceworkAmount || 0) + (d.socialCharges || 0);
  
  // Profit (Bottom Line)
  var profitFinal = d.netProfitFinal || 0;

  // Текст с отделениями
  var departmentsText = "";
  if (Array.isArray(preparedDataRows)) {
    var doctorRows = filterRowsByPeriod(applyFilters(preparedDataRows, appState.filters), appState.periodA)
                     .filter(r => r.doctor === selectedName);
    if (doctorRows.length > 0) {
      var byDept = {};
      doctorRows.forEach(r => {
        var dep = r.department || "Не указано";
        byDept[dep] = (byDept[dep] || 0) + (r.amountPaid || 0);
      });
      departmentsText = Object.keys(byDept)
        .sort((a,b) => byDept[b] - byDept[a])
        .map(dep => `${dep} (${(revenue > 0 ? byDept[dep]/revenue*100 : 0).toFixed(0)}%)`)
        .join(" · ");
    }
  }

  subtitleEl.textContent = `Аналитика: ${selectedName}` + (departmentsText ? ` · ${departmentsText}` : "");

  // Gradients
  var costGradient = createChartGradient(ctx, "#64748b", "#94a3b8");
  var commissionGradient = createChartGradient(ctx, "#6366f1", "#818cf8");
  var externalGradient = createChartGradient(ctx, "#0ea5e9", "#38bdf8");
  var wagesGradient = createChartGradient(ctx, "#f97316", "#fb923c"); // Оклад
  var pieceworkGradient = createChartGradient(ctx, "#f59e0b", "#fbbf24"); // Сделка (Ярче)
  var tiffanyGradient = createChartGradient(ctx, "#06b6d4", "#22d3ee");
  var redGradient = createChartGradient(ctx, "#dc2626", "#ef4444");

  doctorFlowChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: [
        "Мед.затраты", "Комиссии", "Внешние услуги", 
        "ФОТ (Оклад)", "ФОТ (Сделка)", "Чистая прибыль"
      ],
      datasets: [{
        data: [
          costNoWages, costCommission, costExternal, 
          laborPart, pieceworkPart, 
          profitFinal > 0 ? profitFinal : 0
        ],
        backgroundColor: [
          costGradient, commissionGradient, externalGradient,
          wagesGradient, pieceworkGradient,
          profitFinal >= 0 ? tiffanyGradient : redGradient
        ],
        borderWidth: 2, borderColor: "#ffffff", hoverOffset: 4
      }]
    },
    plugins: [doughnutCenterTextPlugin],
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "60%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (context) {
              var val = context.raw;
              if (context.label === "Чистая прибыль") val = profitFinal;
              var pct = revenue > 0 ? (val / revenue) * 100 : 0;
              return `${context.label}: ${formatShortCurrency(val)} (${pct.toFixed(1)}%)`;
            }
          }
        },
        doughnutCenterText: {
          text: formatShortCurrency(profitFinal),
          subtext: "чистая прибыль",
          fontSize: 18, subFontSize: 11,
          color: profitFinal >= 0 ? "#047857" : "#b91c1c",
          subColor: "#6b7280"
        }
      }
    }
  });
}

/**
 * CLINIC WATERFALL v6.0 (Detailed Erosion)
 * Shows: Revenue -> [OpEx] -> [Fixed Labor] -> [Piecework] -> Profit
 */
function renderClinicWaterfallChart(metrics) {
  var canvas = document.getElementById("clinic-waterfall-chart");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (Chart.getChart(canvas)) Chart.getChart(canvas).destroy();

  if (!metrics || !metrics.totalRevenue) return;

  // 1. Данные
  var revenue = metrics.totalRevenue;
  
  // Шаг 1: OpEx (Без ФОТ)
  // Прямые + Комиссии + Внешние + НДС
  var opexVal = (metrics.totalCostNoWages || 0) + (metrics.totalCostCommission || 0) + (metrics.totalCostExternal || 0) + (metrics.totalVatService || 0);
  var opexFlow = -1 * opexVal;

  // Шаг 2: Fixed Labor (Оклады из Col 42)
  var fixedLaborVal = (metrics.totalLaborCost || 0) + (metrics.totalSocialTech || 0);
  var fixedLaborFlow = -1 * fixedLaborVal;

  // Шаг 3: Piecework (Сделка из Col 46)
  var pieceworkVal = metrics.totalPiecework || 0;
  var pieceworkFlow = -1 * pieceworkVal;

  // Остаток (Прибыль)
  var profit = metrics.totalNetProfitFinal;

  // 2. Датасет (Floating Bars)
  var data = [
    [0, revenue],                                      // 1. Выручка
    [revenue, revenue + opexFlow],                     // 2. Минус OpEx
    [revenue + opexFlow, revenue + opexFlow + fixedLaborFlow], // 3. Минус Оклады
    [revenue + opexFlow + fixedLaborFlow, profit],     // 4. Минус Сделка (приходим к прибыли)
    [0, profit]                                        // 5. Итог: Чистая прибыль
  ];

  // 3. Цвета и Градиенты
  var gRev = createChartGradient(ctx, "#1e3a8a", "#3b82f6");     // Navy
  var gOpEx = createChartGradient(ctx, "#64748b", "#94a3b8");    // Slate
  var gFixed = createChartGradient(ctx, "#f59e0b", "#fbbf24");   // Amber
  var gPiece = createChartGradient(ctx, "#f97316", "#fb923c");   // Orange (Darker)
  var gProf = profit >= 0 
    ? createChartGradient(ctx, "#0abab5", "#2dd4bf")             // Teal
    : createChartGradient(ctx, "#ef4444", "#f87171");            // Red

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ["Выручка", "OpEx (Мат/Внеш)", "ФОТ Оклад (Fixed)", "ФОТ Сделка (Var)", "Чистая прибыль"],
      datasets: [{
        data: data,
        backgroundColor: [gRev, gOpEx, gFixed, gPiece, gProf],
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          callbacks: {
            label: function(ctx) {
              var val = ctx.raw[1] - ctx.raw[0];
              return ctx.label + ": " + formatCurrency(val);
            }
          }
        },
        datalabels: {
          display: true,
          color: '#fff',
          font: { weight: 'bold', family: 'Inter', size: 11 },
          formatter: function(value, ctx) {
            var val = value[1] - value[0];
            // Не показываем метки для очень мелких столбиков
            if (Math.abs(val) < revenue * 0.05) return "";
            return formatShortCurrency(Math.abs(val));
          }
        }
      },
      scales: {
        y: { 
          beginAtZero: true, 
          grid: { color: "rgba(148, 163, 184, 0.15)" },
          ticks: { callback: v => formatShortCurrency(v), font: { family: "Inter" }, color: "#64748b" }
        },
        x: { 
          grid: { display: false }, 
          ticks: { font: { family: "Inter", size: 11 }, color: "#64748b" } 
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}

/**
 * CLINIC STACKED BAR v6.0 (Strict SRS Layers)
 * Layers: [OpEx] + [Fixed Labor] + [Piecework] + [Profit] = 100%
 */
function renderClinicCostStructureChart(metrics) {
  var canvas = document.getElementById("clinic-cost-structure-chart");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  var existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  if (!metrics || !metrics.totalRevenue) return;

  var revenue = metrics.totalRevenue;
  
  // 1. OpEx
  var valOpEx = (metrics.totalCostNoWages || 0) + (metrics.totalCostCommission || 0) + (metrics.totalCostExternal || 0) + (metrics.totalVatService || 0);
  
  // 2. Fixed Labor
  var valFixed = (metrics.totalLaborCost || 0) + (metrics.totalSocialTech || 0);
  
  // 3. Piecework
  var valPiece = metrics.totalPiecework || 0;
  
  // 4. Profit (Math remainder for perfect stack)
  var valProfit = revenue - (valOpEx + valFixed + valPiece);

  // Gradients
  var gGray = createChartGradient(ctx, "#64748b", "#94a3b8");   // OpEx
  var gAmber = createChartGradient(ctx, "#f59e0b", "#fbbf24");  // Fixed
  var gOrange = createChartGradient(ctx, "#f97316", "#fb923c"); // Piecework
  var gTeal = createChartGradient(ctx, "#0abab5", "#2dd4bf");   // Profit
  var gRed = createChartGradient(ctx, "#ef4444", "#f87171");    // Loss

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Структура Выручки"],
      datasets: [
        { label: "OpEx (Мат/Внеш)", data: [valOpEx], backgroundColor: gGray, borderRadius:{topLeft:12, bottomLeft:12} },
        { label: "ФОТ Оклад (Fixed)", data: [valFixed], backgroundColor: gAmber },
        { label: "ФОТ Сделка (Var)", data: [valPiece], backgroundColor: gOrange },
        { 
          label: "Чистая прибыль", 
          data: [valProfit], 
          backgroundColor: valProfit >= 0 ? gTeal : gRed, 
          borderRadius:{topRight:12, bottomRight:12} 
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20, bottom: 20 } },
      scales: { x: { stacked: true, display:false }, y: { stacked: true, display:false } },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth:10, usePointStyle:true, pointStyle:'circle', font:{family:"Inter", size:11}, padding: 20, color: "#334155" } },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          callbacks: {
            label: function(ctx) {
              var pct = (ctx.raw / revenue * 100).toFixed(1) + "%";
              return `${ctx.dataset.label}: ${formatShortCurrency(ctx.raw)} (${pct})`;
            }
          }
        },
        datalabels: {
            display: function(ctx) { return (ctx.dataset.data[0] / revenue) > 0.06; }, // Show if > 6%
            color: '#fff',
            font: { weight: 'bold', family: 'Inter', size: 11 },
            formatter: function(val) { return (val/revenue*100).toFixed(0) + "%"; }
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}


// ==========================================
// SECTION: COSTS (UNIT ECONOMICS) ANALYTICS
// ==========================================

// Глобальные переменные для графиков раздела Costs
let costMatrixChart = null;
let costDriversChart = null;
// Переменная для модального графика (чтобы уничтожать при закрытии)
let costMatrixModalChart = null; 

function renderCostsDashboard() {
  const container = document.querySelector('[data-dashboard="costs"]');
  if (!container || !container.classList.contains("dashboard--active")) return;

  // DOM Elements
  const elToxicRev = document.getElementById("cost-kpi-toxic-rev");
  const elToxicShare = document.getElementById("cost-kpi-toxic-share");
  const elMatInt = document.getElementById("cost-kpi-mat-intensity");
  const elMatBench = document.getElementById("cost-kpi-mat-benchmark");
  const elErrors = document.getElementById("cost-kpi-price-errors");
  const elGross = document.getElementById("cost-kpi-gross-margin");
  const elGrossBench = document.getElementById("cost-kpi-gross-benchmark");
  const tbody = document.getElementById("cost-optimization-tbody");

  // КОНФИГ ШРИФТОВ (Единый стиль)
  const fontConfig = { family: "'Inter', sans-serif", size: 11, weight: 500 };
  const fontConfigTitle = { family: "'Inter', sans-serif", size: 12, weight: 600 };
  const colorText = "#64748b";
  const colorGrid = "#e2e8f0";

  if (!preparedDataRows || preparedDataRows.length === 0) {
    if(tbody) tbody.innerHTML = '<tr><td colspan="6" class="muted">Нет данных для анализа</td></tr>';
    return;
  }

  // --- 1. БЕНЧМАРКИ ---
  const globalPeriodRows = filterRowsByPeriod(preparedDataRows, appState.periodA);
  let globalRev = 0, globalMat = 0, globalOpEx = 0;

  globalPeriodRows.forEach(r => {
    globalRev += (r.amountPaid || 0);
    globalMat += (r.costDirect38 || 0);
    globalOpEx += (r.costFull42 || 0);
  });
  const benchmarkMatInt = globalRev > 0 ? (globalMat / globalRev * 100) : 0;
  const benchmarkGross = globalRev > 0 ? ((globalRev - globalOpEx) / globalRev * 100) : 0;

  // --- 2. ТЕКУЩАЯ ВЫБОРКА ---
  const filteredRows = applyFilters(preparedDataRows, appState.filters);
  const currentRows = filterRowsByPeriod(filteredRows, appState.periodA);

  if (currentRows.length === 0) {
     if(tbody) tbody.innerHTML = '<tr><td colspan="6" class="muted">Нет данных по фильтрам</td></tr>';
     return;
  }

  let curRev = 0, curOpEx = 0, curMat = 0, curToxicRev = 0;
  const serviceMap = {};

  currentRows.forEach(row => {
    const rev = row.amountPaid || 0;
    const opex = row.costFull42 || 0;
    const mat = row.costDirect38 || 0;
    const margin = rev - opex;

    curRev += rev;
    curOpEx += opex;
    curMat += mat;

    if (margin < 0) curToxicRev += rev;

    const key = row.serviceName || row.serviceCode || "Неизвестная услуга";
    if (!serviceMap[key]) {
      serviceMap[key] = { name: key, revenue: 0, opex: 0, count: 0 };
    }
    serviceMap[key].revenue += rev;
    serviceMap[key].opex += opex;
    serviceMap[key].count += (row.quantity || 1);
  });

  const curMatInt = curRev > 0 ? (curMat / curRev * 100) : 0;
  const curGross = curRev > 0 ? ((curRev - curOpEx) / curRev * 100) : 0;
  
  const servicesArray = Object.values(serviceMap).map(s => {
    const margin = s.revenue - s.opex;
    const marginPct = s.revenue > 0 ? (margin / s.revenue * 100) : 0;
    const opexPct = s.revenue > 0 ? (s.opex / s.revenue * 100) : 0;
    return { ...s, margin, marginPct, opexPct };
  });

  const priceErrors = servicesArray.filter(s => s.margin < 0).length;

  // --- 3. РЕНДЕРИНГ KPI ---
  if (elToxicRev) {
    elToxicRev.textContent = formatCurrency(curToxicRev);
    elToxicRev.style.color = curToxicRev > 0 ? "#ef4444" : "#64748b"; 
  }
  if (elToxicShare) {
    const share = curRev > 0 ? (curToxicRev / curRev * 100) : 0;
    elToxicShare.textContent = `${share.toFixed(1)}% от выручки`;
  }
  if (elMatInt) {
    elMatInt.textContent = formatPercent(curMatInt);
    const delta = curMatInt - benchmarkMatInt;
    const isBad = delta > 0.5;
    elMatInt.style.color = isBad ? "#ef4444" : "#0f172a";
    if (elMatBench) {
      const sign = delta > 0 ? "+" : "";
      const color = isBad ? "#ef4444" : "#10b981";
      elMatBench.innerHTML = `<span style="color:${color}; font-weight:600;">${sign}${delta.toFixed(1)}%</span> к средней`;
    }
  }
  if (elErrors) elErrors.textContent = priceErrors;
  if (elGross) {
    elGross.textContent = formatPercent(curGross);
    const delta = curGross - benchmarkGross;
    elGross.style.color = curGross < 0 ? "#ef4444" : (curGross < 20 ? "#f59e0b" : "#0abab5");
    if (elGrossBench) {
      const sign = delta > 0 ? "+" : "";
      const color = delta > 0 ? "#10b981" : "#ef4444"; 
      elGrossBench.innerHTML = `<span style="color:${color}; font-weight:600;">${sign}${delta.toFixed(1)}%</span> к средней`;
    }
  }

  // --- 4. ГРАФИКИ (С ШРИФТАМИ INTER) ---

  // A. Матрица (Scatter)
  const ctxMatrix = document.getElementById("cost-matrix-chart");
  // Сохраняем данные в глобальную переменную для модального окна (лайфхак)
  window.lastCostMatrixData = servicesArray
      .filter(s => s.revenue > 3000) 
      .map(s => ({
        x: s.opexPct,
        y: s.margin, 
        r: Math.min(Math.max(Math.sqrt(s.revenue) / 10, 3), 20),
        serviceName: s.name,
        rawRevenue: s.revenue
      }));

  if (ctxMatrix) {
    if (costMatrixChart) costMatrixChart.destroy();
    
    costMatrixChart = new Chart(ctxMatrix.getContext("2d"), {
      type: 'bubble',
      data: {
        datasets: [{
          label: 'Услуги',
          data: window.lastCostMatrixData,
          backgroundColor: window.lastCostMatrixData.map(d => d.x > 80 ? 'rgba(239, 68, 68, 0.7)' : (d.x > 50 ? 'rgba(245, 158, 11, 0.7)' : 'rgba(16, 185, 129, 0.6)')),
          borderColor: 'transparent'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleFont: fontConfigTitle,
            bodyFont: fontConfig,
            padding: 10,
            callbacks: {
              label: (ctx) => {
                const p = ctx.raw;
                return [p.serviceName, `Выручка: ${formatShortCurrency(p.rawRevenue)}`, `Прибыль: ${formatShortCurrency(p.y)}`, `OpEx: ${p.x.toFixed(1)}%`];
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Доля OpEx (%)', font: fontConfig },
            grid: { color: colorGrid },
            ticks: { font: fontConfig, color: colorText }
          },
          y: {
            title: { display: true, text: 'Прибыль (₽)', font: fontConfig },
            grid: { color: colorGrid },
            ticks: { font: fontConfig, callback: v => formatShortCurrency(v), color: colorText }
          }
        }
      }
    });
  }

  // B. Драйверы (Bar)
  const ctxDrivers = document.getElementById("cost-drivers-chart");
  if (ctxDrivers) {
    if (costDriversChart) costDriversChart.destroy();
    const topDrivers = servicesArray.sort((a, b) => b.opex - a.opex).slice(0, 10);
    
    costDriversChart = new Chart(ctxDrivers.getContext("2d"), {
      type: 'bar',
      data: {
        labels: topDrivers.map(s => s.name.length > 15 ? s.name.substr(0,15)+'...' : s.name),
        datasets: [
          {
            label: 'OpEx',
            data: topDrivers.map(s => s.opex),
            backgroundColor: '#ef4444',
            borderRadius: 3,
            barPercentage: 0.6
          },
          {
            label: 'Выручка',
            data: topDrivers.map(s => s.revenue),
            backgroundColor: '#e2e8f0',
            borderRadius: 3,
            barPercentage: 0.6,
            hidden: false 
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, font: fontConfig, color: colorText } },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleFont: fontConfigTitle,
            bodyFont: fontConfig,
            callbacks: {
                title: (items) => topDrivers[items[0].dataIndex].name,
                label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: fontConfig, callback: v => formatShortCurrency(v), color: colorText }
          },
          y: {
            grid: { display: false },
            ticks: { font: fontConfig, color: colorText }
          }
        }
      }
    });
  }

  // --- 5. ТАБЛИЦА (ПОЛНЫЙ ФУНКЦИОНАЛ: Search, Sort, Pagination, ABC) ---
  if (tbody) {
    tbody.innerHTML = "";
    
    // A. Подготовка данных (Добавляем ABC-метрики в массив)
    // curOpEx рассчитан выше в этой же функции (сумма costFull42)
    const totalOpEx = curOpEx || 1; 

    let tableData = servicesArray.map(s => {
        return {
            ...s,
            opexShare: (s.opex / totalOpEx * 100) // % вклада в расходы
        };
    });

    // B. Фильтрация (Поиск + Категория)
    tableData = tableData.filter(s => {
        // 1. Поиск
        if (costsTableState.search && !s.name.toLowerCase().includes(costsTableState.search)) {
            return false;
        }
        // 2. Фильтр
        if (costsTableState.filter === 'loss' && s.margin >= 0) return false;
        if (costsTableState.filter === 'low_margin' && s.marginPct >= 20) return false;
        // ABC Категория A = >5% от общих расходов (или >1% если клиника маленькая, возьмем 2% как среднее)
        if (costsTableState.filter === 'abc_a' && s.opexShare < 2.0) return false;
        
        return true;
    });

    // C. Сортировка
    tableData.sort((a, b) => {
        const valA = a[costsTableState.sortField];
        const valB = b[costsTableState.sortField];
        
        let comparison = 0;
        if (typeof valA === 'string') {
            comparison = valA.localeCompare(valB);
        } else {
            comparison = valA - valB;
        }
        
        return costsTableState.sortDir === 'asc' ? comparison : -comparison;
    });

    // D. Пагинация
    const totalItems = tableData.length;
    const totalPages = Math.ceil(totalItems / costsTableState.pageSize) || 1;
    
    if (costsTableState.page > totalPages) costsTableState.page = 1;
    if (costsTableState.page < 1) costsTableState.page = 1;

    const startIdx = (costsTableState.page - 1) * costsTableState.pageSize;
    const endIdx = startIdx + costsTableState.pageSize;
    const visibleRows = tableData.slice(startIdx, endIdx);

    // E. Отрисовка заголовков (обновление стрелочек)
    const theadRow = tbody.closest("table").querySelector("thead tr");
    if (theadRow) {
       const ths = theadRow.querySelectorAll("th.sortable");
       ths.forEach(th => {
           // Убираем старые стрелки
           th.textContent = th.textContent.replace(" ↑", "").replace(" ↓", "");
           // Ставим новую, если это активная колонка
           if (th.dataset.sort === costsTableState.sortField) {
               th.textContent += (costsTableState.sortDir === 'asc' ? " ↑" : " ↓");
           }
           // Восстанавливаем стили (они могут слететь при replace text)
           th.style.color = (th.dataset.sort === costsTableState.sortField) ? "#0f172a" : "#64748b";
           th.style.fontWeight = (th.dataset.sort === costsTableState.sortField) ? "600" : "500";
       });
    }

    // F. Отрисовка строк
    if (visibleRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center; padding:30px;">Ничего не найдено</td></tr>`;
    } else {
        visibleRows.forEach(s => {
          const tr = document.createElement("tr");
          // АНИМАЦИЯ: Класс table-row--clickable уже имеет hover эффекты в CSS
          tr.className = "clickable-row table-row--clickable"; 
          
          const isToxic = s.margin < 0;
          const marginColor = isToxic ? "#ef4444" : (s.marginPct < 20 ? "#f59e0b" : "#10b981");
          const nameStyle = isToxic ? "color: #ef4444; font-weight: 500;" : "color: #0f172a;";
          const cellStyle = `font-family: 'Inter', sans-serif; font-size: 12px;`;

          // Бейджи ABC
          let abcBadge = "";
          if (s.opexShare >= 5.0) abcBadge = `<span style="background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:4px; font-weight:700; font-size:10px; margin-left:6px;">A+</span>`;
          else if (s.opexShare >= 2.0) abcBadge = `<span style="background:#ffedd5; color:#c2410c; padding:2px 6px; border-radius:4px; font-weight:600; font-size:10px; margin-left:6px;">A</span>`;
          
          tr.innerHTML = `
            <td style="${cellStyle} ${nameStyle}" title="${s.name}">
               <div style="max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                   ${s.name} ${isToxic ? '⚠️' : ''}
               </div>
            </td>
            <td class="align-right" style="${cellStyle}">${formatCurrency(s.revenue)}</td>
            <td class="align-right muted" style="${cellStyle}">${formatShortCurrency(s.opex)}</td>
            <td class="align-right" style="${cellStyle}">
                <b>${s.opexShare.toFixed(1)}%</b>${abcBadge}
            </td>
            <td class="align-right" style="${cellStyle} color: ${marginColor}">${formatCurrency(s.margin)}</td>
            <td class="align-right" style="${cellStyle} color: ${marginColor}; font-weight: 600;">${s.marginPct.toFixed(1)}%</td>
          `;
          
          // Открытие модалки
          tr.addEventListener("click", () => {
             if (typeof openServiceDetailsModal === 'function') {
                 openServiceDetailsModal(s.code, s.name); 
             }
          });

          tbody.appendChild(tr);
        });
    }

    // G. Обновление футера пагинации
    const infoEl = document.getElementById("costs-pagination-info");
    const prevBtn = document.getElementById("costs-page-prev");
    const nextBtn = document.getElementById("costs-page-next");

    if (infoEl) {
        infoEl.textContent = `Услуги ${startIdx + 1}–${Math.min(endIdx, totalItems)} из ${totalItems}`;
    }
    if (prevBtn) prevBtn.disabled = costsTableState.page <= 1;
    if (nextBtn) nextBtn.disabled = costsTableState.page >= totalPages;
  }
}

/**
 * FOT DASHBOARD v6.8 (Final Polish)
 * 1. Clean Tooltips (No artifacts).
 * 2. Explained Table (Total Cost basis).
 * 3. Methodology: Back-calculation (130.2%).
 */
function renderMotivationDashboard() {
  var dashboard = document.querySelector('[data-dashboard="fot"]');
  if (!dashboard) return;

  var fontSpec = "Inter, system-ui, sans-serif";

  // 1. Проверка данных
  if (!preparedDataRows || preparedDataRows.length === 0) return;
  var filteredRows = applyFilters(preparedDataRows, appState.filters);
  var periodRows = filterRowsByPeriod(filteredRows, appState.periodA);
  
  if (!periodRows || periodRows.length === 0) {
    renderEmptyState(dashboard, { title: "Нет данных за период" });
    return;
  }

  var metrics = calculateMetrics(periodRows);

  // --- 2. ДАННЫЕ ---
  var totalSpent = metrics.totalPiecework || 0; // Это Total Cost (включая налоги)
  
  // Разделение по типам (Аудит)
  var fotFromRevenue = 0;
  var fotFromProfit = 0;
  
  periodRows.forEach(function(r) {
      var flag = (r.serviceFlag || "").toLowerCase();
      var pay = r.pieceworkAmount || 0;
      if (flag.includes("прием")) fotFromRevenue += pay;
      else fotFromProfit += pay;
  });
  
  var shareRev = totalSpent > 0 ? (fotFromRevenue / totalSpent * 100) : 0;
  var shareProf = totalSpent > 0 ? (fotFromProfit / totalSpent * 100) : 0;

  // Налоги (уже посчитаны по формуле /1.302 в calculateMetrics)
  var taxTotal = metrics.totalSocialCharges || 0;
  var valPfr = metrics.totalTaxPension || 0;
  var valFoms = metrics.totalTaxFoms || 0;
  var valFss = metrics.totalTaxFss || 0;

  var limit = metrics.totalFundLimit || 0;
  var netPay = metrics.totalPayMed || 0;
  var reserve = metrics.totalReserve || 0;
  
  var colorRes = reserve >= 0 ? "#10b981" : "#ef4444";
  var textRes = reserve >= 0 ? "Экономия (Резерв)" : "Перерасход (Дефицит)";

  // --- 3. HTML LAYOUT ---
  dashboard.innerHTML = `
    <!-- БЛОК АУДИТА БАЗЫ -->
    <div style="margin-bottom: 24px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 8px;">
            Структура начислений (Источники):
        </div>
        <div style="display:flex; height:12px; width:100%; background:#e2e8f0; border-radius:4px; overflow:hidden; margin-bottom:8px;">
             <div style="width:${shareRev}%; background:#3b82f6;"></div>
             <div style="width:${shareProf}%; background:#f59e0b;"></div>
        </div>
        <div style="display:flex; gap: 24px; font-size:12px; color:#64748b;">
             <div style="display:flex; align-items:center;">
                <span style="width:8px; height:8px; background:#3b82f6; border-radius:50%; margin-right:6px;"></span>
                <span>Приемы: <b>${formatShortCurrency(fotFromRevenue)}</b></span>
             </div>
             <div style="display:flex; align-items:center;">
                <span style="width:8px; height:8px; background:#f59e0b; border-radius:50%; margin-right:6px;"></span>
                <span>Процедуры: <b>${formatShortCurrency(fotFromProfit)}</b></span>
             </div>
        </div>
    </div>

    <!-- KPI CARDS -->
    <div class="kpi-grid" style="margin-bottom: 24px;">
      <article class="card kpi-card">
        <header class="kpi-card__header"><h3 class="kpi-card__title">Бюджет ФОТ</h3><p class="kpi-card__subtitle">Лимит (60% маржи)</p></header>
        <div class="kpi-card__body"><div class="kpi-card__value">${formatCurrency(limit)}</div></div>
      </article>

      <article class="card kpi-card">
        <header class="kpi-card__header"><h3 class="kpi-card__title">Начислено (Total)</h3><p class="kpi-card__subtitle">Включая налоги</p></header>
        <div class="kpi-card__body"><div class="kpi-card__value" style="color: #3b82f6">${formatCurrency(totalSpent)}</div></div>
      </article>

      <article class="card kpi-card">
        <header class="kpi-card__header"><h3 class="kpi-card__title">Налоги (в т.ч.)</h3></header>
        <div class="kpi-card__body">
          <div class="kpi-card__value" style="color: #ef4444">${formatCurrency(taxTotal)}</div>
          <div style="margin-top: 8px; font-size: 10px; color: #64748b;">
            ФСС: <b>${formatCurrency(valFss)}</b>
          </div>
        </div>
      </article>

      <article class="card kpi-card">
        <header class="kpi-card__header"><h3 class="kpi-card__title">${textRes}</h3></header>
        <div class="kpi-card__body"><div class="kpi-card__value" style="color:${colorRes}">${formatCurrency(reserve)}</div></div>
      </article>
    </div>

    <!-- SANKEY CHART -->
    <article class="card card--flow" style="margin-bottom: 24px;">
      <header class="card__header">
        <h2 class="card__title">Поток распределения Фонда</h2>
      </header>
      <div class="card__body">
        <div id="fot-sankey-container" style="height: 450px;"></div>
      </div>
    </article>

    <!-- TABLE -->
    <article class="card">
      <header class="card__header">
        <div>
            <h2 class="card__title">Детализация по отделениям</h2>
            <!-- ПОДСКАЗКА О РАБОТЕ ТАБЛИЦЫ -->
            <p class="card__subtitle" style="max-width: 600px; margin-top:4px; line-height:1.4;">
                Таблица показывает эффективность расходования фонда. <br>
                <span style="color:#0f172a; font-weight:600;">План</span> (Лимит) сравнивается с <span style="color:#0f172a; font-weight:600;">Фактом</span> (Полная стоимость с налогами). 
                Положительное отклонение — это экономия бюджета клиники.
            </p>
        </div>
      </header>
      <div class="card__body">
        <div class="placeholder-table">
          <table style="width:100%">
            <thead>
              <tr>
                <th>Отделение</th>
                <th class="align-right">План (Бюджет)</th>
                <th class="align-right">Факт (с налогами)</th>
                <th class="align-right muted">Налоги (внутри)</th>
                <th class="align-right" style="color:#0abab5">На руки (Net)</th>
                <th class="align-right">Отклонение</th>
                <th class="align-right" style="width:100px">Утиль</th>
              </tr>
            </thead>
            <tbody id="fot-table-body"></tbody>
          </table>
        </div>
      </div>
    </article>
  `;

  // 4. SANKEY (CLEAN TOOLTIPS)
  if (typeof Highcharts !== 'undefined') {
    function getMeta(val, base, baseName) {
        return {
            global: (limit > 0) ? (val / limit * 100).toFixed(1) + "%" : "0%",
            local: (base > 0) ? (val / base * 100).toFixed(1) + "%" : "0%",
            baseName: baseName
        };
    }
    var nodes = [
      { id: 'Limit', name: 'Бюджет', color: "#64748b" },
      { id: 'Spend', name: 'Начислено (Total)', color: "#3b82f6", custom: getMeta(totalSpent, limit, "Бюджета") },
      { id: 'Tax',   name: 'Налоги', color: "#ef4444", custom: getMeta(taxTotal, totalSpent, "Начислено") },
      { id: 'Net',   name: 'Чистый котел', color: "#8b5cf6", custom: getMeta(metrics.totalNetWagePool, totalSpent, "Начислено") },
      { id: 'Adm',   name: 'АУП (16%)', color: "#f59e0b", custom: getMeta(metrics.totalShareAdmin, metrics.totalNetWagePool, "Котла") },
      { id: 'DocS',  name: 'Врачам (84%)', color: "#06b6d4", custom: getMeta(metrics.totalNetWagePool - metrics.totalShareAdmin, metrics.totalNetWagePool, "Котла") },
      { id: 'Hand',  name: 'На руки', color: "#0abab5", custom: getMeta(netPay, metrics.totalNetWagePool - metrics.totalShareAdmin, "Доли Врачей") }
    ];
    var links = [];
    if (reserve >= 0) {
      if (totalSpent > 0) links.push({ from: 'Limit', to: 'Spend', weight: totalSpent });
      if (reserve > 0)    links.push({ from: 'Limit', to: 'Save',  weight: reserve, color: "#10b981" });
      nodes.push({ id: 'Save', name: 'Резерв', color: "#10b981", custom: getMeta(reserve, limit, "Бюджета") });
    } else {
      var deficit = Math.abs(reserve);
      links.push({ from: 'Limit', to: 'Spend', weight: limit });
      links.push({ from: 'Over',  to: 'Spend', weight: deficit, color: "#ef4444" });
      nodes.push({ id: 'Over', name: 'Дефицит', color: "#ef4444", custom: { local: "—" } });
    }
    if (taxTotal > 0) links.push({ from: 'Spend', to: 'Tax', weight: taxTotal });
    if (metrics.totalNetWagePool > 0) links.push({ from: 'Spend', to: 'Net', weight: metrics.totalNetWagePool });
    if (metrics.totalShareAdmin > 0) links.push({ from: 'Net', to: 'Adm', weight: metrics.totalShareAdmin });
    var docsPool = metrics.totalNetWagePool - metrics.totalShareAdmin;
    if (docsPool > 0) links.push({ from: 'Net', to: 'DocS', weight: docsPool });
    if (netPay > 0) links.push({ from: 'DocS', to: 'Hand', weight: netPay });

    Highcharts.chart('fot-sankey-container', {
      chart: { type: 'sankey', backgroundColor: 'transparent', style: { fontFamily: fontSpec }, height: 450 },
      title: { text: '' }, credits: { enabled: false },
      tooltip: {
          useHTML: true, backgroundColor: "rgba(15, 23, 42, 0.98)", borderRadius: 8, borderWidth: 0, shadow: false, padding: 0,
          // !!! FIX: ОТКЛЮЧАЕМ ДЕФОЛТНЫЕ ЗАГОЛОВКИ !!!
          headerFormat: '', 
          pointFormat: '',
          nodeFormat: '',
          formatter: function() {
              var c = this.point.custom;
              if (!c) return `<b>${this.point.name}</b>: ${formatCurrency(this.point.weight || this.point.sum)}`;
              if (this.point.isNode) return `<div style="padding:10px; color:#fff; font-family:${fontSpec}"><b>${this.point.name}</b><br/>${formatCurrency(this.point.sum)}<br/><span style="opacity:0.7; font-size:11px">Доля: ${c.local}</span></div>`;
              return `<div style="padding:8px; color:#fff; font-family:${fontSpec}">${this.point.fromNode.name} → ${this.point.toNode.name}<br/><b>${formatCurrency(this.point.weight)}</b></div>`;
          }
      },
      plotOptions: { sankey: { dataLabels: { style: { color: '#0f172a', fontWeight: '600', textOutline: 'none', fontFamily: fontSpec } } } },
      series: [{ nodes: nodes, data: links }]
    });
  }

  // 5. TABLE RENDER
  var tbody = document.getElementById("fot-table-body");
  var depts = Object.values(metrics.byDepartment || {});
  depts.sort((a,b) => b.fundLimit - a.fundLimit);

  depts.forEach(d => {
    var dSpent = d.pieceworkAmount || 0; // Total Cost (с налогами)
    var dLimit = d.fundLimit || 0;
    var dRes = dLimit - dSpent; // Правильный расчет: План - Факт
    var dUtil = dLimit > 0 ? (dSpent / dLimit * 100) : (dSpent > 0 ? 100 : 0);
    var dNetPay = d.payFinalMed || 0; 
    
    var barColor = "#3b82f6";
    if (dUtil > 100) barColor = "#ef4444";
    else if (dUtil < 80) barColor = "#10b981";

    var tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:500; font-family:${fontSpec}">${d.name}</td>
      <td class="align-right" style="font-family:${fontSpec}">${formatCurrency(dLimit)}</td>
      <td class="align-right" style="font-family:${fontSpec}">${formatCurrency(dSpent)}</td>
      <td class="align-right muted" style="font-family:${fontSpec}">${formatCurrency(d.socialCharges)}</td>
      <td class="align-right" style="font-family:${fontSpec}; font-weight:600; color:#0abab5">${formatCurrency(dNetPay)}</td>
      <td class="align-right" style="font-family:${fontSpec}; color:${dRes>=0?'#10b981':'#ef4444'}; font-weight:600">
        ${dRes > 0 ? "+" : ""}${formatCurrency(dRes)}
      </td>
      <td class="align-right">
        <div style="background:#e2e8f0; height:6px; width:100%; border-radius:3px; margin-top:2px; overflow:hidden">
          <div style="background:${barColor}; width:${Math.min(dUtil, 100)}%; height:100%;"></div>
        </div>
        <div style="font-size:10px; color:#64748b; text-align:right; margin-top:2px;">${dUtil.toFixed(0)}%</div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}


/**
 * MOTIVATION DASHBOARD v9.2 (Interactive & UX)
 * Updates:
 * 1. Search & Filter controls for the "Justice Rating" table.
 * 2. Pagination (50 items per page).
 * 3. Detailed methodology tooltip for the Matrix chart.
 */
// Локальное состояние UI для этого раздела
var motUiState = {
    sortField: 'revenue',
    sortDir: 'desc',
    search: '',
    filterCat: 'all',
    page: 1,
    pageSize: 50
};

/**
 * MOTIVATION DASHBOARD v9.3 (Added Net Pay Column)
 * Updates:
 * 1. Added 'payNet' (Income per doctor) to aggregation.
 * 2. Added column "На руки (мес)" to the table.
 */
function renderMotivationDoctorsDashboard() {
  var dashboard = document.querySelector('[data-dashboard="motivation-doctors"]');
  if (!dashboard) return;

  var fontSpec = "Inter, system-ui, sans-serif";

  // 1. Данные
  if (!preparedDataRows || preparedDataRows.length === 0) return;
  var filteredRows = applyFilters(preparedDataRows, appState.filters);
  var periodRows = filterRowsByPeriod(filteredRows, appState.periodA);
  
  if (!periodRows || periodRows.length === 0) {
    renderEmptyState(dashboard, { title: "Нет данных за период" });
    return;
  }

  // 2. Расчет метрик (Агрегация)
  var docsMap = {};
  var totalRevenue = 0;

  periodRows.forEach(row => {
      var docName = row.doctor || "Не указано";
      if (!docsMap[docName]) {
          docsMap[docName] = { 
              name: docName, 
              revenue: 0, 
              fotFixed: 0, 
              fotVar: 0, 
              payNet: 0, // <--- НОВОЕ ПОЛЕ: На руки
              netProfit: 0 
          };
      }
      var r = docsMap[docName];
      var rev = row.amountPaid || 0;
      
      var fFixed = (row.costLaborFull !== undefined) ? row.costLaborFull : ((row.laborCost||0) + (row.socialChargesTech||0));
      var fVar = row.pieceworkAmount || 0;
      
      // Агрегируем чистое начисление врачу (payFinalMed из calculateRowEconomics)
      var netPay = row.payFinalMed || 0; 
      
      var profit = row.netProfitFinal; 

      r.revenue += rev;
      r.fotFixed += fFixed;
      r.fotVar += fVar;
      r.payNet += netPay; // <--- СУММИРУЕМ
      r.netProfit += profit;
      totalRevenue += rev;
  });

  var docsArray = Object.values(docsMap).filter(d => d.revenue > 0).map(d => {
      var totalFot = d.fotFixed + d.fotVar;
      return {
          ...d,
          totalFot: totalFot,
          wageLoad: (d.revenue > 0) ? (totalFot / d.revenue * 100) : 0
      };
  });

  if (docsArray.length === 0) return;

  // 3. Расчет Медиан и Сегментация
  var revenues = docsArray.map(d => d.revenue).sort((a,b)=>a-b);
  var loads = docsArray.map(d => d.wageLoad).sort((a,b)=>a-b);
  
  var getMed = (arr) => arr[Math.floor(arr.length / 2)];
  var medRev = getMed(revenues);
  var medLoad = getMed(loads);

  var segments = { stars: [], workhorses: [], virtuosos: [], outsiders: [] };

  docsArray.forEach(d => {
      var isHighRev = d.revenue >= medRev;
      var isLowLoad = d.wageLoad <= medLoad; 

      if (isHighRev && isLowLoad) { d.cat = "stars"; segments.stars.push(d); }
      else if (isHighRev && !isLowLoad) { d.cat = "workhorses"; segments.workhorses.push(d); }
      else if (!isHighRev && isLowLoad) { d.cat = "virtuosos"; segments.virtuosos.push(d); }
      else { d.cat = "outsiders"; segments.outsiders.push(d); }
  });

  // KPI
  var lossSum = segments.outsiders.reduce((acc, d) => acc + (d.netProfit < 0 ? d.netProfit : 0), 0);

  // Текст подсказки для Матрицы
  var matrixTooltip = `
    <div style="text-align:left; max-width:300px; line-height:1.4;">
        <b>Как читать этот график?</b><br>
        График делит врачей на 4 группы относительно медиан по клинике.<br><br>
        💎 <b>Звезды:</b> Выручка выше средней, ФОТ ниже среднего. Самые эффективные.<br>
        🚜 <b>Тягачи:</b> Много выручки, но дорогие. Держат объем.<br>
        🎯 <b>Виртуозы:</b> Мало выручки, но очень маржинальные (дешевые). Потенциал.<br>
        🔻 <b>Аутсайдеры:</b> Мало выручки и дорогие. Генерируют убытки.
    </div>
  `;

  // 4. HTML Layout
  dashboard.innerHTML = `
    <!-- KPI GRID -->
    <div class="kpi-grid" style="margin-bottom: 24px;">
      <article class="card kpi-card">
        <header class="kpi-card__header"><h3 class="kpi-card__title">Медианная ФОТ-емкость</h3><span class="help-icon" data-tooltip="Нормальный процент затрат на персонал.">?</span></header>
        <div class="kpi-card__body"><div class="kpi-card__value">${medLoad.toFixed(1)}%</div></div>
      </article>
      <article class="card kpi-card">
        <header class="kpi-card__header"><h3 class="kpi-card__title">Звезды</h3><p class="kpi-card__subtitle">Эффективные</p></header>
        <div class="kpi-card__body"><div class="kpi-card__value" style="color:#0ABAB5">${segments.stars.length} чел.</div></div>
      </article>
      <article class="card kpi-card">
        <header class="kpi-card__header"><h3 class="kpi-card__title">Аутсайдеры</h3><p class="kpi-card__subtitle">Зона риска</p></header>
        <div class="kpi-card__body"><div class="kpi-card__value" style="color:#ef4444">${segments.outsiders.length} чел.</div></div>
      </article>
      <article class="card kpi-card">
        <header class="kpi-card__header"><h3 class="kpi-card__title">Убыток группы Риска</h3><p class="kpi-card__subtitle">Потерянные деньги</p></header>
        <div class="kpi-card__body"><div class="kpi-card__value" style="color:#ef4444">${formatShortCurrency(lossSum)}</div></div>
      </article>
    </div>

    <!-- ROW 2: MATRIX CHART -->
    <article class="card card--chart" style="margin-bottom: 24px;">
        <header class="card__header">
            <div class="kpi-card__title-row">
                <h2 class="card__title">Матрица эффективности (ROI Персонала)</h2>
                <span class="help-icon" data-tooltip='${matrixTooltip}'>?</span>
            </div>
            <p class="card__subtitle">Позиционирование врачей относительно медиан рынка</p>
        </header>
        <div class="card__body">
            <div class="chart-wrapper" style="height: 450px;">
                <canvas id="doc-matrix-chart"></canvas>
            </div>
        </div>
    </article>

    <!-- ROW 3: JUSTICE TABLE (With Controls) -->
    <article class="card card--table">
        <header class="card__header" style="flex-wrap: wrap; gap: 10px;">
            <div>
                <h2 class="card__title">Рейтинг справедливости оплаты</h2>
            </div>
            <!-- CONTROLS -->
            <div class="services-controls" style="margin-left: auto;">
                <div class="form-group" style="margin-bottom:0;">
                    <select id="mot-cat-filter" class="input">
                        <option value="all">Все категории</option>
                        <option value="stars">💎 Звезды</option>
                        <option value="workhorses">🚜 Тягачи</option>
                        <option value="virtuosos">🎯 Виртуозы</option>
                        <option value="outsiders">🔻 Аутсайдеры</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom:0; min-width: 200px;">
                    <input type="text" id="mot-search-input" class="input" placeholder="Поиск врача...">
                </div>
            </div>
        </header>
        <div class="card__body">
            <div class="placeholder-table">
                <table>
                    <thead>
                        <tr>
                            <th class="sortable" data-sort="name">Врач / Категория</th>
                            <th class="align-right sortable" data-sort="revenue">Выручка (Вал)</th>
                            <th class="align-right sortable" data-sort="totalFot">ФОТ Полный</th>
                            <th class="align-right sortable" data-sort="payNet" style="color:#0f172a">На руки (мес)</th> <!-- НОВЫЙ ХЕДЕР -->
                            <th class="align-right sortable" data-sort="wageLoad">ФОТ-емкость</th>
                            <th class="align-right sortable" data-sort="netProfit">Чистая прибыль</th>
                        </tr>
                    </thead>
                    <tbody id="doc-justice-body"></tbody>
                </table>
            </div>
            
            <!-- PAGINATION -->
            <div class="table-footer">
                <div class="table-footer__info" id="mot-pagination-info"></div>
                <div class="table-footer__controls">
                    <button type="button" class="btn btn--ghost btn--sm" id="mot-page-prev">←</button>
                    <button type="button" class="btn btn--ghost btn--sm" id="mot-page-next">→</button>
                </div>
            </div>
        </div>
    </article>
  `;

  // 5. ЛОГИКА ТАБЛИЦЫ (Render Logic)
  var tbody = document.getElementById("doc-justice-body");
  
  function renderTable() {
      // A. Фильтрация
      var filteredList = docsArray.filter(d => {
          var matchesSearch = motUiState.search === "" || d.name.toLowerCase().includes(motUiState.search.toLowerCase());
          var matchesCat = motUiState.filterCat === "all" || d.cat === motUiState.filterCat;
          return matchesSearch && matchesCat;
      });

      // B. Сортировка
      filteredList.sort((a, b) => {
          var valA = a[motUiState.sortField];
          var valB = b[motUiState.sortField];
          if (typeof valA === 'string') return motUiState.sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
          return motUiState.sortDir === 'asc' ? valA - valB : valB - valA;
      });

      // C. Пагинация
      var totalItems = filteredList.length;
      var totalPages = Math.ceil(totalItems / motUiState.pageSize) || 1;
      
      // Коррекция страницы если фильтр уменьшил список
      if (motUiState.page > totalPages) motUiState.page = 1;
      
      var start = (motUiState.page - 1) * motUiState.pageSize;
      var end = start + motUiState.pageSize;
      var pageData = filteredList.slice(start, end);

      // D. HTML Generation
      tbody.innerHTML = "";
      if (pageData.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center; padding:20px;">Ничего не найдено</td></tr>`;
      }

      var catConfig = {
          stars:      { icon: "💎", label: "Звезда", color: "#0ABAB5", bg: "#f0fdfa" },
          workhorses: { icon: "🚜", label: "Тягач", color: "#3b82f6", bg: "#eff6ff" },
          virtuosos:  { icon: "🎯", label: "Виртуоз", color: "#f59e0b", bg: "#fefce8" },
          outsiders:  { icon: "🔻", label: "Аутсайдер", color: "#ef4444", bg: "#fef2f2" }
      };
      var maxRev = Math.max(...docsArray.map(d => d.revenue));

      pageData.forEach(d => {
          var conf = catConfig[d.cat];
          var barW = (d.revenue / maxRev) * 60;
          var loadColor = d.wageLoad > medLoad ? (d.wageLoad > 50 ? "#ef4444" : "#f59e0b") : "#10b981";
          var profitColor = d.netProfit >= 0 ? "#0f172a" : "#ef4444";

          var tr = document.createElement("tr");
          tr.className = "table-row--clickable";
          tr.onclick = () => openDoctorDetailsModal(d.name);

          tr.innerHTML = `
            <td style="font-family:${fontSpec};">
                <div style="font-weight:500; color:#0f172a;">${d.name}</div>
                <div style="font-size:10px; margin-top:2px;">
                    <span style="background:${conf.bg}; color:${conf.color}; padding:1px 6px; border-radius:4px; font-weight:600;">
                        ${conf.icon} ${conf.label}
                    </span>
                </div>
            </td>
            <td class="align-right" style="font-family:${fontSpec};">
                <div style="font-weight:600; color:#0f172a;">${formatCurrency(d.revenue)}</div>
                <div style="display:flex; justify-content:flex-end; margin-top:2px;">
                    <div style="width:${barW}px; height:4px; background:#3b82f6; border-radius:2px; opacity:0.3"></div>
                </div>
            </td>
            <td class="align-right muted" style="font-family:${fontSpec};">${formatCurrency(d.totalFot)}</td>
            <!-- НОВАЯ ЯЧЕЙКА С NET PAY -->
            <td class="align-right" style="font-family:${fontSpec}; color:#0f172a; font-weight:600; background:rgba(241, 245, 249, 0.5)">
                ${formatCurrency(d.payNet)}
            </td>
            <td class="align-right" style="font-family:${fontSpec}; font-weight:600; color:${loadColor}">
                ${d.wageLoad.toFixed(1)}%
            </td>
            <td class="align-right" style="font-family:${fontSpec}; font-weight:600; color:${profitColor}">
                ${formatCurrency(d.netProfit)}
            </td>
          `;
          tbody.appendChild(tr);
      });

      // E. Update Controls UI
      var infoEl = document.getElementById("mot-pagination-info");
      var prevEl = document.getElementById("mot-page-prev");
      var nextEl = document.getElementById("mot-page-next");
      
      if (infoEl) infoEl.textContent = `Врачи ${start+1}–${Math.min(end, totalItems)} из ${totalItems}`;
      if (prevEl) prevEl.disabled = motUiState.page <= 1;
      if (nextEl) nextEl.disabled = motUiState.page >= totalPages;
      
      // Update Sort Arrows
      var ths = tbody.parentElement.querySelectorAll('th.sortable');
      ths.forEach(th => {
          var rawText = th.innerText.replace(' ↓', '').replace(' ↑', '');
          th.innerText = rawText + (th.dataset.sort === motUiState.sortField ? (motUiState.sortDir === 'asc' ? ' ↑' : ' ↓') : '');
      });
  }

  // 6. ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ (Event Listeners)
  
  // Сортировка
  var headerRow = tbody.parentElement.querySelector('thead tr');
  if (headerRow) {
      headerRow.addEventListener('click', function(e) {
          var th = e.target.closest('th.sortable');
          if (!th) return;
          
          var key = th.dataset.sort;
          if (motUiState.sortField === key) {
              motUiState.sortDir = motUiState.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
              motUiState.sortField = key;
              motUiState.sortDir = 'desc';
          }
          renderTable();
      });
  }

  // Поиск
  var searchInput = document.getElementById("mot-search-input");
  if (searchInput) {
      // Восстанавливаем значение при перерисовке
      searchInput.value = motUiState.search;
      // Используем клонирование для удаления старых лисенеров
      var newSearch = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(newSearch, searchInput);
      newSearch.addEventListener("input", function(e) {
          motUiState.search = e.target.value.trim();
          motUiState.page = 1;
          renderTable();
      });
  }

  // Фильтр
  var catSelect = document.getElementById("mot-cat-filter");
  if (catSelect) {
      catSelect.value = motUiState.filterCat;
      var newSelect = catSelect.cloneNode(true);
      catSelect.parentNode.replaceChild(newSelect, catSelect);
      newSelect.addEventListener("change", function(e) {
          motUiState.filterCat = e.target.value;
          motUiState.page = 1;
          renderTable();
      });
  }

  // Пагинация
  var btnPrev = document.getElementById("mot-page-prev");
  var btnNext = document.getElementById("mot-page-next");
  
  if (btnPrev) {
      var newPrev = btnPrev.cloneNode(true);
      btnPrev.parentNode.replaceChild(newPrev, btnPrev);
      newPrev.addEventListener("click", () => {
          if (motUiState.page > 1) { motUiState.page--; renderTable(); }
      });
  }
  if (btnNext) {
      var newNext = btnNext.cloneNode(true);
      btnNext.parentNode.replaceChild(newNext, btnNext);
      newNext.addEventListener("click", () => {
          motUiState.page++; renderTable();
      });
  }

  // Первый рендер
  renderTable();

  // 7. CHART: SCATTER PLOT
  var ctx = document.getElementById("doc-matrix-chart").getContext("2d");
  
  var ds = [
      { label: "Звезды (Эффективные)",   data: segments.stars.map(d=>({x:d.revenue, y:d.wageLoad, r:6, _name:d.name})), backgroundColor: "#0ABAB5" },
      { label: "Тягачи (Дорогие)",       data: segments.workhorses.map(d=>({x:d.revenue, y:d.wageLoad, r:6, _name:d.name})), backgroundColor: "#3b82f6" },
      { label: "Виртуозы (Потенциал)",   data: segments.virtuosos.map(d=>({x:d.revenue, y:d.wageLoad, r:5, _name:d.name})), backgroundColor: "#f59e0b" },
      { label: "Аутсайдеры (Проблема)",  data: segments.outsiders.map(d=>({x:d.revenue, y:d.wageLoad, r:5, _name:d.name})), backgroundColor: "#ef4444" }
  ];

  new Chart(ctx, {
      type: 'bubble',
      data: { datasets: ds },
      options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
              legend: { position: 'bottom', labels: { usePointStyle: true, font: { family: fontSpec } } },
              tooltip: {
                  backgroundColor: 'rgba(15,23,42,0.95)',
                  callbacks: {
                      label: c => `${c.raw._name}: Выр ${formatShortCurrency(c.raw.x)} | ФОТ ${c.raw.y.toFixed(1)}%`
                  }
              },
              annotation: {
                  annotations: {
                      medRevLine: {
                          type: 'line', scaleID: 'x', value: medRev,
                          borderColor: 'rgba(148,163,184,0.5)', borderWidth: 1, borderDash: [4,4],
                          label: { enabled: true, content: `Медиана Выручки: ${formatShortCurrency(medRev)}`, position: 'start', font: {size:10} }
                      },
                      medLoadLine: {
                          type: 'line', scaleID: 'y', value: medLoad,
                          borderColor: 'rgba(148,163,184,0.5)', borderWidth: 1, borderDash: [4,4],
                          label: { enabled: true, content: `Медиана ФОТ %: ${medLoad.toFixed(1)}%`, position: 'end', font: {size:10} }
                      }
                  }
              }
          },
          scales: {
              x: { title: {display:true, text:'Выручка (Объем)', color:'#94a3b8'}, grid:{color:"rgba(148,163,184,0.1)"}, ticks: { callback: v=>formatShortCurrency(v) } },
              y: { 
                  title: {display:true, text:'ФОТ-емкость (%)', color:'#94a3b8'}, 
                  grid:{color:"rgba(148,163,184,0.1)"},
                  reverse: true
              }
          }
      }
  });
}

/**
 * OVERVIEW CHART v8.0 (Rev vs Net Profit)
 * Visualizes the Top Line vs Bottom Line dynamics.
 */
function renderOverviewChart(rowsA, yearA, rowsB, yearB) {
  var canvas = document.getElementById("overview-revenue-profit-chart");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  // Очистка
  if (overviewChart) { overviewChart.destroy(); overviewChart = null; }
  if ((!rowsA || rowsA.length === 0) && (!rowsB || rowsB.length === 0)) return;

  var labels = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  var dRevA = Array(12).fill(0), dNetA = Array(12).fill(0);
  var dRevB = Array(12).fill(0), dNetB = Array(12).fill(0);

  function agg(rows, arrRev, arrNet, targetYear) {
    if (!rows) return;
    rows.forEach(function(r) {
      if (targetYear && r.serviceYear !== targetYear) return;
      var m = r.serviceMonth - 1;
      if (m >= 0 && m < 12) {
        arrRev[m] += (r.amountPaid || 0);
        // ВАЖНО: Используем Чистую Прибыль для графика
        arrNet[m] += (r.netProfitFinal || 0); 
      }
    });
  }

  agg(rowsA, dRevA, dNetA, yearA);
  agg(rowsB, dRevB, dNetB, yearB);

  var fontSpec = { family: "'Inter', sans-serif", size: 11 };
  var gradRev = createChartGradient(ctx, "#3b82f6", "#60a5fa"); // Blue
  var gradNet = createChartGradient(ctx, "#0abab5", "#2dd4bf"); // Tiffany

  overviewChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Выручка",
          data: dRevA,
          backgroundColor: gradRev,
          borderRadius: 4,
          order: 2
        },
        {
          label: "Чистая прибыль",
          data: dNetA,
          backgroundColor: gradNet,
          borderRadius: 4,
          order: 1 // Поверх выручки
        },
        // Пунктир прошлого года (если есть)
        ...(rowsB && rowsB.length > 0 ? [{
          label: "Выручка (прошлый)",
          type: "line",
          data: dRevB,
          borderColor: "#94a3b8", borderWidth: 2, borderDash: [4, 4], pointRadius: 0, order: 0
        }] : [])
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, font: fontSpec, color: "#64748b" } },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          // ШРИФТЫ (Inter)
          titleFont: { family: "Inter, system-ui, sans-serif", size: 13, weight: '600' },
          bodyFont: { family: "Inter, system-ui, sans-serif", size: 12 },
          padding: 10,
          cornerRadius: 6,
          displayColors: false, // Убираем цветные квадратики для чистоты
          callbacks: { 
            label: function(ctx) { 
              return ctx.dataset.label + ": " + formatCurrency(ctx.raw); 
            } 
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: fontSpec, color: "#94a3b8" } },
        y: { grid: { color: "rgba(148, 163, 184, 0.1)" }, ticks: { callback: v => formatShortCurrency(v), font: fontSpec, color: "#94a3b8" } }
      }
    }
  });
}

/**
 * OVERVIEW SANKEY v9.0 (Direct Costing)
 * Simplified Flow: Revenue -> [OpEx | Margin] -> [Net Profit | Piecework]
 */
function renderOverviewFlowDiagram(metrics) {
  var containerId = "overview-flow-chart";
  var container = document.getElementById(containerId);
  if (!container || typeof Highcharts === "undefined") return;
  container.innerHTML = "";

  if (!metrics || !metrics.totalRevenue) { renderEmptyState(container, { title: "Нет данных" }); return; }

  // 1. Данные
  var rev = metrics.totalRevenue; 
  var valOpEx = metrics.totalCostFull || 0; // В новой модели это чистый OpEx
  var valMargin = Math.max(0, metrics.totalProfitMethod);
  
  var valPiecework = metrics.totalPiecework || 0;
  if (valPiecework > valMargin) valPiecework = valMargin; // Clamp
  
  var valProfit = Math.max(0, metrics.totalNetProfitFinal);

  // 2. Визуал
  var fontSpec = "Inter, system-ui, sans-serif";
  var colors = { rev: "#1e3a8a", opex: "#64748b", marg: "#38bdf8", piece: "#f97316", prof: "#0abab5" };

  function getMeta(val, baseName) {
      return { global: (rev > 0) ? (val / rev * 100).toFixed(1) + "%" : "0%", local: baseName };
  }

  // 3. Граф
  var nodes = [
      { id: 'Rev',   name: 'Выручка', color: colors.rev },
      { id: 'OpEx',  name: 'OpEx (Материалы)', color: colors.opex, custom: getMeta(valOpEx, "Выручки") },
      { id: 'Marg',  name: 'Маржинальная прибыль', color: colors.marg, custom: getMeta(valMargin, "Выручки") },
      { id: 'Piece', name: 'ФОТ Сделка', color: colors.piece, custom: getMeta(valPiecework, "Маржи") },
      { id: 'Prof',  name: 'Чистая прибыль', color: colors.prof, custom: getMeta(valProfit, "Маржи") }
  ];

  var links = [];
  if (valOpEx > 0) links.push({ from: 'Rev', to: 'OpEx', weight: valOpEx });
  if (valMargin > 0) links.push({ from: 'Rev', to: 'Marg', weight: valMargin });
  if (valPiecework > 0) links.push({ from: 'Marg', to: 'Piece', weight: valPiecework });
  if (valProfit > 0) links.push({ from: 'Marg', to: 'Prof', weight: valProfit });

  Highcharts.chart(containerId, {
    chart: { type: 'sankey', height: 350, backgroundColor: 'transparent', style: { fontFamily: fontSpec } },
    title: { text: '' }, credits: { enabled: false },
    tooltip: {
        useHTML: true, backgroundColor: "rgba(15, 23, 42, 0.98)", borderRadius: 8, borderWidth: 0, shadow: false, padding: 0,
        formatter: function() {
            var c = this.point.custom;
            if (this.point.isNode) {
                if(!c) return `<b>${this.point.name}</b>`;
                return `<div style="padding:10px; color:#f8fafc; font-family:${fontSpec}">
                          <div style="font-size:12px; font-weight:600; color:${this.point.color}">${this.point.name}</div>
                          <div style="font-size:16px; font-weight:700; margin:4px 0">${formatCurrency(this.point.sum)}</div>
                          <div style="font-size:11px; opacity:0.8">Доля: ${c.global}</div>
                        </div>`;
            }
            return `<div style="padding:8px; color:#f8fafc; font-family:${fontSpec}">${this.point.fromNode.name} → ${this.point.toNode.name}<br/><b>${formatCurrency(this.point.weight)}</b></div>`;
        }
    },
    plotOptions: { sankey: { nodePadding: 30, dataLabels: { style: { color: '#0f172a', fontSize: '11px', fontWeight: '600', fontFamily: fontSpec, textOutline: 'none' } } } },
    series: [{ nodes: nodes, data: links }]
  });
}

/**
 * Создаёт линейный градиент для использования в графиках Chart.js.
 * @param {CanvasRenderingContext2D} ctx - Контекст canvas.
 * @param {string} startColor - Начальный цвет градиента.
 * @param {string} endColor - Конечный цвет градиента.
 * @returns {CanvasGradient} - Готовый объект градиента.
 */
function createChartGradient(ctx, startColor, endColor) {
  var gradient = ctx.createLinearGradient(0, 0, 800, 0); // Градиент по горизонтали
  gradient.addColorStop(0, startColor);
  gradient.addColorStop(1, endColor);
  return gradient;
}

/**
 * Форматирование валюты (рубли).
 */
function formatCurrency(value) {
  var amount = Number(value) || 0;
  return amount.toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  });
}

/**
 * Форматирование процентов.
 */
function formatPercent(value) {
  var num = Number(value) || 0;
  return num.toFixed(1) + "%";
}

/**
 * Короткий формат чисел для подписей на барах.
 */
function formatShortCurrency(value) {
  var amount = Number(value) || 0;
  var abs = Math.abs(amount);

  if (abs >= 1000000000) {
    return (amount / 1000000000).toFixed(1) + " млрд";
  }
  if (abs >= 1000000) {
    return (amount / 1000000).toFixed(1) + " млн";
  }
  if (abs >= 1000) {
    return (amount / 1000).toFixed(1) + " тыс";
  }
  return amount.toLocaleString("ru-RU");
}

/**
 * Отрисовывает красивое "пустое состояние" внутри элемента-контейнера.
 * @param {HTMLElement} container - DOM-элемент, куда будет вставлен блок.
 * @param {object} options - Опции для текста.
 * @param {string} options.title - Заголовок сообщения.
 * @param {string} options.subtitle - Поясняющий подзаголовок.
 */
function renderEmptyState(container, options) {
  if (!container) {
    return;
  }

  var title = options.title || "Нет данных для отображения";
  var subtitle =
    options.subtitle ||
    "Попробуйте изменить выбранный период или сбросить фильтры.";

  // Очищаем контейнер перед отрисовкой
  container.innerHTML = "";

  var wrapper = document.createElement("div");
  wrapper.className = "empty-state-wrapper";

  var iconSvg =
    '<svg class="empty-state__icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>';

  var titleEl = document.createElement("h3");
  titleEl.className = "empty-state__title";
  titleEl.textContent = title;

  var subtitleEl = document.createElement("p");
  subtitleEl.className = "empty-state__subtitle";
  subtitleEl.textContent = subtitle;

  wrapper.innerHTML = iconSvg;
  wrapper.appendChild(titleEl);
  wrapper.appendChild(subtitleEl);

  container.appendChild(wrapper);
}

/**
 * Показывает скелетон-загрузчик.
 */
function showLoadingState() {
  var loader = document.getElementById("loader");
  if (loader) {
    loader.classList.remove("hidden");
  }
}

/**
 * Скрывает скелетон-загрузчик.
 */
function hideLoadingState() {
  var loader = document.getElementById("loader");
  if (loader) {
    loader.classList.add("hidden");
  }
}

/**
 * Рисует график-пилюлю (Stacked Bar) структуры выручки.
 * ОБНОВЛЕНО: Добавлены градиенты для эффекта объема.
 */
var overviewPillChart = null;

function renderContractPillChart(rows) {
  var canvas = document.getElementById("overview-contract-pill");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");

  // 1. Очистка старого графика
  if (overviewPillChart) {
    overviewPillChart.destroy();
    overviewPillChart = null;
  }

  if (!rows || rows.length === 0) return;

  // 2. Считаем суммы
  var totalAmbulatory = 0;
  var totalInpatient = 0;
  var totalDaycare = 0;
  var totalOther = 0;
  var totalRevenue = 0;

  rows.forEach(function (row) {
    var amount = row.amountPaid || 0;
    var type = row.contractTypeKey; 

    totalRevenue += amount;

    if (type === "ambulatory") totalAmbulatory += amount;
    else if (type === "inpatient") totalInpatient += amount;
    else if (type === "daycare") totalDaycare += amount;
    else totalOther += amount;
  });

  if (totalRevenue === 0) return;

  // 3. Настройка ГРАДИЕНТОВ (Start -> End)
  var colors = {
    ambulatory: { start: "#059669", end: "#34d399" }, // Изумрудный
    inpatient:  { start: "#1d4ed8", end: "#60a5fa" }, // Королевский синий
    daycare:    { start: "#334155", end: "#94a3b8" }, // Темно-серый
    other:      { start: "#9ca3af", end: "#e2e8f0" }  // Светло-серый
  };

  // 4. Формируем сегменты
  var segments = [
    { 
      key: 'ambulatory', 
      value: totalAmbulatory, 
      colorStart: colors.ambulatory.start, colorEnd: colors.ambulatory.end,
      label: "Амбулатория", short: "АМБ" 
    },
    { 
      key: 'inpatient', 
      value: totalInpatient, 
      colorStart: colors.inpatient.start, colorEnd: colors.inpatient.end,
      label: "Стационар", short: "СТАЦ" 
    },
    { 
      key: 'daycare', 
      value: totalDaycare, 
      colorStart: colors.daycare.start, colorEnd: colors.daycare.end,
      label: "Дн. стационар", short: "ДН.СТ" 
    },
    { 
      key: 'other', 
      value: totalOther, 
      colorStart: colors.other.start, colorEnd: colors.other.end,
      label: "Прочее", short: "ПРОЧ" 
    }
  ];

  var visibleSegments = segments.filter(function(s) { return s.value > 0; });

  var datasets = visibleSegments.map(function(seg, index) {
    var isFirst = index === 0;
    var isLast = index === visibleSegments.length - 1;

    return {
      label: seg.label,
      shortLabel: seg.short,
      data: [seg.value],
      // Создаем градиент
      backgroundColor: createChartGradient(ctx, seg.colorStart, seg.colorEnd),
      borderWidth: 0, // Убрали обводку для чистоты градиента
      borderRadius: {
        topLeft: isFirst ? 50 : 0, bottomLeft: isFirst ? 50 : 0,
        topRight: isLast ? 50 : 0, bottomRight: isLast ? 50 : 0
      },
      borderSkipped: false,
      barPercentage: 1.0,
      categoryPercentage: 1.0
    };
  });

  overviewPillChart = new Chart(ctx, {
    type: "bar",
    data: { labels: ["Выручка"], datasets: datasets },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }, 
        tooltip: { enabled: true },
        datalabels: {
          display: function(context) { return (context.dataset.data[0] / totalRevenue) > 0.06; },
          color: "#ffffff",
          font: { family: "Inter, sans-serif", weight: "600", size: 13 },
          formatter: function (value, context) {
            var pct = (value / totalRevenue) * 100;
            return context.dataset.shortLabel + " " + Math.round(pct) + "%";
          },
          align: "center", anchor: "center"
        }
      },
      scales: { x: { display: false, stacked: true }, y: { display: false, stacked: true } }
    },
    plugins: [ChartDataLabels]
  });
}

/**
 * Рисует график-пилюлю (Stacked Bar) структуры по КАНАЛАМ ПРОДАЖ.
 * Цвета: Тиффани (Физлица), Индиго (ДМС), Серый (Корп).
 */
var overviewProgramChart = null;

function renderProgramPillChart(rows) {
  var canvas = document.getElementById("overview-program-pill");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");

  // 1. Очистка старого графика
  if (overviewProgramChart) {
    overviewProgramChart.destroy();
    overviewProgramChart = null;
  }

  if (!rows || rows.length === 0) return;

  // 2. Считаем суммы по programKey
  var totals = { phys: 0, dms: 0, corp: 0 };
  var totalRevenue = 0;

  rows.forEach(function (row) {
    var amount = row.amountPaid || 0;
    var key = row.programKey || "corp"; // phys, dms, corp
    
    if (totals[key] !== undefined) {
      totals[key] += amount;
      totalRevenue += amount;
    } else {
      // На случай если придет что-то странное, кидаем в corp
      totals.corp += amount;
      totalRevenue += amount;
    }
  });

  if (totalRevenue === 0) return;

  // 3. Настройка Цветов (Градиенты)
  var colors = {
    phys: { start: "#0cc8c2ff", end: "#0abab5" }, // Тиффани (Cash Cow)
    dms:  { start: "#4338ca", end: "#818cf8" }, // Индиго (ДМС)
    corp: { start: "#475569", end: "#94a3b8" }  // Серый (Прочее)
  };

  // 4. Формируем сегменты
  var segments = [
    { 
      key: 'phys', value: totals.phys, 
      colorStart: colors.phys.start, colorEnd: colors.phys.end,
      label: "Физ.лица", short: "КАССА" 
    },
    { 
      key: 'dms', value: totals.dms, 
      colorStart: colors.dms.start, colorEnd: colors.dms.end,
      label: "ДМС", short: "ДМС" 
    },
    { 
      key: 'corp', value: totals.corp, 
      colorStart: colors.corp.start, colorEnd: colors.corp.end,
      label: "Корпоративные", short: "КОРП" 
    }
  ];

  // Сортируем: сначала самые большие куски, чтобы красиво выглядело
  segments.sort((a, b) => b.value - a.value);

  var visibleSegments = segments.filter(function(s) { return s.value > 0; });

  var datasets = visibleSegments.map(function(seg, index) {
    var isFirst = index === 0;
    var isLast = index === visibleSegments.length - 1;

    return {
      label: seg.label,
      shortLabel: seg.short,
      data: [seg.value],
      backgroundColor: createChartGradient(ctx, seg.colorStart, seg.colorEnd),
      borderWidth: 0,
      // Скругления только по краям всей "колбасы"
      borderRadius: {
        topLeft: isFirst ? 50 : 0, bottomLeft: isFirst ? 50 : 0,
        topRight: isLast ? 50 : 0, bottomRight: isLast ? 50 : 0
      },
      borderSkipped: false,
      barPercentage: 1.0,
      categoryPercentage: 1.0
    };
  });

  // 5. Рисуем
  overviewProgramChart = new Chart(ctx, {
    type: "bar",
    data: { labels: ["Выручка"], datasets: datasets },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }, 
        tooltip: { enabled: true },
        datalabels: {
          display: function(context) { return (context.dataset.data[0] / totalRevenue) > 0.06; },
          color: "#ffffff",
          font: { family: "Inter, sans-serif", weight: "600", size: 12 },
          formatter: function (value, context) {
            var pct = (value / totalRevenue) * 100;
            return context.dataset.shortLabel + " " + Math.round(pct) + "%";
          },
          align: "center", anchor: "center"
        }
      },
      scales: { x: { display: false, stacked: true }, y: { display: false, stacked: true } }
    },
    plugins: [ChartDataLabels]
  });
}

/**
 * REVENUE SANKEY v9.0 (Smart Tooltips)
 * Flow: Contract Type (Source) -> Department (Target).
 * Tooltips now show % relative to the Source node.
 */
function renderRevenueSankey(rows) {
  var containerId = "departments-sankey-chart";
  var container = document.getElementById(containerId);
  if (!container || typeof Highcharts === "undefined") return;
  container.innerHTML = "";

  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет данных</div>';
    return;
  }

  var fontSpec = "Inter, system-ui, sans-serif";

  // 1. Агрегация
  var linksMap = {}; 
  var deptTotals = {}; 
  var sourceTotals = {}; // Для расчета % от источника
  var totalRevenue = 0;

  rows.forEach(function(row) {
    var amount = row.amountPaid || 0;
    if (amount <= 0) return;
    totalRevenue += amount;

    var typeKey = row.contractTypeKey || "other";
    var sourceName = "Прочее";
    if (typeKey === "ambulatory") sourceName = "Амбулатория";
    else if (typeKey === "inpatient") sourceName = "Стационар";
    else if (typeKey === "daycare") sourceName = "Дн. стационар";

    var targetName = row.department || "Не указано";
    var key = sourceName + "|" + targetName;
    
    linksMap[key] = (linksMap[key] || 0) + amount;
    deptTotals[targetName] = (deptTotals[targetName] || 0) + amount;
    sourceTotals[sourceName] = (sourceTotals[sourceName] || 0) + amount;
  });

  // 2. Сортировка и Топ-15
  var sortedDepts = Object.keys(deptTotals).sort((a, b) => deptTotals[b] - deptTotals[a]);
  var TOP_LIMIT = 15;
  var targetList = sortedDepts.slice(0, TOP_LIMIT);
  if (sortedDepts.length > TOP_LIMIT) targetList.push("Прочие отделения");

  // 3. Узлы
  var nodes = [];
  var colors = { 
      "Амбулатория": "#10b981", // Green
      "Стационар": "#3b82f6",   // Blue
      "Дн. стационар": "#8b5cf6", // Purple
      "Прочее": "#94a3b8",      // Gray
      "Прочие отделения": "#cbd5e1" 
  };

  // Источники
  Object.keys(colors).forEach(function(name) {
      if (name !== "Прочие отделения" && sourceTotals[name]) {
          nodes.push({ id: name, name: name, color: colors[name], column: 0 });
      }
  });

  // Отделения (Цвета из палитры)
  var deptPalette = ["#0ea5e9", "#06b6d4", "#14b8a6", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#d946ef", "#8b5cf6", "#6366f1"];
  targetList.forEach(function(name, index) {
      var color = colors[name] || deptPalette[index % deptPalette.length];
      nodes.push({ id: name, name: name, color: color, column: 1 });
  });

  // 4. Связи
  var finalLinks = [];
  var sources = ["Амбулатория", "Стационар", "Дн. стационар", "Прочее"];

  targetList.forEach(function(target) {
      sources.forEach(function(source) {
          var weight = 0;
          if (target === "Прочие отделения") {
             sortedDepts.slice(TOP_LIMIT).forEach(realDept => { weight += (linksMap[source + "|" + realDept] || 0); });
          } else {
             weight = linksMap[source + "|" + target] || 0;
          }

          if (weight > 0) {
              // Считаем % от Источника
              var sourceTotal = sourceTotals[source] || 1;
              var pctSource = (weight / sourceTotal * 100).toFixed(1) + "%";
              
              finalLinks.push({ from: source, to: target, weight: weight, custom: { pct: pctSource } });
          }
      });
  });

  // 5. Рендер
  Highcharts.chart(containerId, {
    chart: { type: "sankey", backgroundColor: "transparent", style: { fontFamily: fontSpec }, height: 600 },
    title: { text: "" }, credits: { enabled: false },
    
    tooltip: {
      useHTML: true, backgroundColor: "rgba(15, 23, 42, 0.98)", borderRadius: 8, borderWidth: 0, shadow: false, padding: 0,
      formatter: function() {
        // NODE
        if (this.point.isNode) {
          var val = this.point.sum;
          var pct = totalRevenue > 0 ? (val / totalRevenue * 100).toFixed(1) + "%" : "0%";
          return `
            <div style="padding:10px; font-family:${fontSpec}; color:#f8fafc; min-width:150px">
                <div style="font-size:12px; font-weight:600; color:${this.point.color}">${this.point.name}</div>
                <div style="font-size:16px; font-weight:700; margin:4px 0">${formatCurrency(val)}</div>
                <div style="font-size:11px; opacity:0.8">Доля в клинике: ${pct}</div>
            </div>`;
        } 
        // LINK (С умным процентом)
        else {
          var c = this.point.custom || {};
          return `
            <div style="padding:8px; font-family:${fontSpec}; color:#f8fafc; font-size:11px;">
                <span style="opacity:0.7">${this.point.fromNode.name} → ${this.point.toNode.name}</span><br/>
                <b style="font-size:14px;">${formatCurrency(this.point.weight)}</b>
                <div style="margin-top:2px; color:#cbd5e1">Это ${c.pct} от ${this.point.fromNode.name}</div>
            </div>`;
        }
      }
    },
    
    plotOptions: {
      sankey: {
        nodeWidth: 30, nodePadding: 15,
        dataLabels: {
          enabled: true, useHTML: true,
          style: { color: "#0f172a", fontSize: "11px", fontWeight: "600", textOutline: "none", fontFamily: fontSpec },
          formatter: function() {
            if (!this.point.isNode) return "";
            if (totalRevenue > 0 && (this.point.sum / totalRevenue) < 0.015) return "";
            var name = this.point.name.length > 20 ? this.point.name.substring(0, 18) + "..." : this.point.name;
            return `${name}<br/><span style="opacity:0.6; font-weight:400; font-size:10px">${formatShortCurrency(this.point.sum)}</span>`;
          }
        }
      }
    },
    series: [{ nodes: nodes, data: finalLinks }]
  });
}

/**
 * DOCTORS SCATTER v9.1 (FIX: Tooltip Name)
 * Axis Y: Wage Load % (Piecework / Revenue). Fixed Labor excluded.
 * Bubble Size: Net Profit (Bottom Line).
 */
function renderDoctorsScatter(metrics, targetCanvasId) {
  var canvasId = targetCanvasId || "doctors-scatter-chart";
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (Chart.getChart(canvas)) Chart.getChart(canvas).destroy();

  if (!metrics || !metrics.byDoctor) return;

  // 1. Подготовка данных
  var points = [];
  var doctorKeys = Object.keys(metrics.byDoctor);
  
  var revenues = [];
  var loads = [];

  doctorKeys.forEach(function(key) {
    var d = metrics.byDoctor[key];
    var rev = d.revenue || 0;
    if (rev <= 0) return; 

    var fot = d.pieceworkAmount || 0; 
    var load = (fot / rev) * 100;
    var profit = d.netProfitFinal || 0;

    revenues.push(rev);
    loads.push(load);

    points.push({
      x: rev,
      y: load,
      r: 0, 
      _name: d.name, // <--- ИСПРАВЛЕНО: было name, стало _name
      profit: profit
    });
  });

  // Расчет медиан
  var medRev = computeMedianValue(revenues);
  var medLoad = computeMedianValue(loads);

  // 2. Сегментация
  var buckets = {
    stars:     { label: "💎 Звезды",        data: [], color: "#0ABAB5" },
    workhorse: { label: "🚜 Тягачи",        data: [], color: "#3b82f6" },
    virtuoso:  { label: "🎯 Виртуозы",      data: [], color: "#f59e0b" },
    outsider:  { label: "🔻 Аутсайдеры",    data: [], color: "#ef4444" }
  };

  var maxProfit = Math.max(...points.map(p => Math.abs(p.profit))) || 1;
  var scale = targetCanvasId ? 40 : 25; 

  points.forEach(p => {
    p.r = 5 + (Math.abs(p.profit) / maxProfit) * scale;

    var isHighRev = p.x >= medRev;
    var isLowLoad = p.y <= medLoad; 

    if (isHighRev && isLowLoad) buckets.stars.data.push(p);
    else if (isHighRev && !isLowLoad) buckets.workhorse.data.push(p);
    else if (!isHighRev && isLowLoad) buckets.virtuoso.data.push(p);
    else buckets.outsider.data.push(p);
  });

  // 3. Датасеты
  var datasets = Object.values(buckets).map(b => ({
    label: b.label,
    data: b.data,
    backgroundColor: b.color,
    borderColor: "#ffffff",
    borderWidth: 1,
    hoverBorderColor: "#0f172a",
    hoverBorderWidth: 2
  }));

  var fontSpec = "Inter, system-ui, sans-serif";
  var fontSize = targetCanvasId ? 14 : 11;

  new Chart(ctx, {
    type: 'bubble',
    data: { datasets: datasets },
    options: {
      responsive: true, 
      maintainAspectRatio: false, 
      layout: { padding: 15 },
      
      // Клик по точке
      onClick: function(e, elements, chart) {
        if (elements && elements.length > 0) {
          var datasetIndex = elements[0].datasetIndex;
          var dataIndex = elements[0].index;
          var pointData = chart.data.datasets[datasetIndex].data[dataIndex];
          
          // Теперь _name существует и модалка откроется корректно
          if (pointData && pointData._name) {
            openDoctorDetailsModal(pointData._name);
          }
        }
      },
      onHover: function(e, elements) {
        var el = e.native ? e.native.target : e.target;
        el.style.cursor = elements.length ? 'pointer' : 'default';
      },

      plugins: {
        legend: { position: "bottom", labels: { font: { family: fontSpec, size: fontSize }, usePointStyle: true, color: "#475569" } },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { family: fontSpec, size: 0 }, 
          bodyFont: { family: fontSpec, size: fontSize + 1 },
          padding: 10,
          callbacks: {
            label: function(ctx) {
              var p = ctx.raw;
              return [
                p._name, // <--- Теперь здесь есть данные
                `💰 Выручка: ${formatShortCurrency(p.x)}`,
                `📉 ФОТ-емкость: ${p.y.toFixed(1)}%`,
                `💵 Чистая прибыль: ${formatShortCurrency(p.profit)}`
              ];
            }
          }
        },
        annotation: {
          annotations: {
            lineX: { type: 'line', scaleID: 'x', value: medRev, borderColor: 'rgba(148,163,184,0.4)', borderWidth: 1, borderDash: [4,4], label: { enabled: false } },
            lineY: { type: 'line', scaleID: 'y', value: medLoad, borderColor: 'rgba(148,163,184,0.4)', borderWidth: 1, borderDash: [4,4], label: { enabled: false } }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Выручка (Объем)', color: '#94a3b8', font: {family:fontSpec} }, grid: { color: "rgba(148,163,184,0.1)" }, ticks: { callback: v=>formatShortCurrency(v), font:{family:fontSpec} } },
        y: { 
            title: { display: true, text: 'ФОТ-емкость (%)', color: '#94a3b8', font: {family:fontSpec} }, 
            grid: { color: "rgba(148,163,184,0.1)" }, 
            reverse: true,
            ticks: { callback: v=>v+"%", font:{family:fontSpec} } 
        }
      }
    }
  });
}

/**
 * DOCTORS TOP CHART v9.0 (Net Profit Ranking)
 * Shows who generates real money (Bottom Line).
 */
function renderDoctorsTopChart(metrics) {
  var canvas = document.getElementById("doctors-top-chart");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (Chart.getChart(canvas)) Chart.getChart(canvas).destroy();

  if (!metrics || !metrics.byDoctor) return;

  var list = Object.values(metrics.byDoctor).map(d => ({
    name: d.name,
    profit: d.netProfitFinal || 0 // Strict Net Profit
  }));

  list.sort((a,b) => b.profit - a.profit);
  var top15 = list.slice(0, 15);

  var labels = top15.map(d => d.name.length > 20 ? d.name.substr(0, 18)+"..." : d.name);
  var data = top15.map(d => d.profit);

  // Градиенты
  var gWin = createChartGradient(ctx, "#0abab5", "#2dd4bf");
  var gLoss = createChartGradient(ctx, "#ef4444", "#f87171");
  var colors = data.map(v => v >= 0 ? gWin : gLoss);

  var fontSpec = "Inter, system-ui, sans-serif";

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ label: 'Чистая прибыль', data: data, backgroundColor: colors, borderRadius: 4, barPercentage: 0.7 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { family: fontSpec, size: 13 }, bodyFont: { family: fontSpec, size: 12 },
          callbacks: { label: c => `Чистая прибыль: ${formatCurrency(c.raw)}` }
        }
      },
      scales: {
        x: { grid: { color: "rgba(148,163,184,0.15)" }, ticks: { callback: v => formatShortCurrency(v), font: { family: fontSpec }, color: "#64748b" } },
        y: { grid: { display: false }, ticks: { font: { family: fontSpec, weight: 500 }, color: "#0f172a" } }
      }
    }
  });
}

/**
 * DOCTOR DETAILS MODAL v9.3 (Fixes & Fonts)
 * 1. Filter: Uses .trim() to ensure name matching works.
 * 2. Fonts: Explicit Inter font for Table and Donut.
 * 3. Tooltip: eff. rate explained.
 */
function openDoctorDetailsModal(doctorName) {
  var modal = document.getElementById("doctor-details-modal");
  if (!modal) return;

  var fontSpec = "Inter, system-ui, sans-serif";

  // 1. Фильтрация (Безопасное сравнение)
  var filteredRows = applyFilters(preparedDataRows, appState.filters);
  var periodRows = filterRowsByPeriod(filteredRows, appState.periodA);
  
  // FIX: Убираем пробелы, чтобы сравнение было точным
  var safeName = (doctorName || "").trim().toLowerCase();
  var docRows = periodRows.filter(r => (r.doctor || "").trim().toLowerCase() === safeName);

  if (docRows.length === 0) {
      console.warn("Doctor data not found for:", doctorName);
      // Убрали alert, чтобы не блокировать интерфейс, если вдруг данных нет
      return; 
  }

  // 2. Агрегация
  var totalRevenue = 0;
  var sumOpEx = 0;      
  var sumVarFot = 0;    
  var totalNetPay = 0;  
  var channels = { phys: 0, dms: 0, corp: 0 };
  var servicesMap = {};

  docRows.forEach(r => {
    var rev = r.amountPaid || 0;
    totalRevenue += rev;
    
    sumOpEx += (r.costFull42 !== undefined) ? r.costFull42 : 0; 
    sumVarFot += (r.pieceworkAmount || 0);
    totalNetPay += (r.payFinalMed || 0);

    var prog = r.programKey || "corp";
    if (channels[prog] !== undefined) channels[prog] += rev; else channels.corp += rev;
    
    var svc = r.serviceName || "Услуга";
    if(!servicesMap[svc]) servicesMap[svc] = { count: 0, revenue: 0 };
    servicesMap[svc].count += (r.quantity||1);
    servicesMap[svc].revenue += rev;
  });

  var totalNetProfit = totalRevenue - sumOpEx - sumVarFot;
  var rentabilityPct = totalRevenue > 0 ? (totalNetProfit / totalRevenue * 100) : 0;
  var effRate = totalRevenue > 0 ? (totalNetPay / totalRevenue * 100) : 0;

  // 3. UI Updates
  var nameEl = document.getElementById("doctor-details-name");
  if(nameEl) {
      nameEl.textContent = doctorName;
      nameEl.style.fontFamily = fontSpec;
  }
  
  var subEl = document.getElementById("doctor-details-subtitle");
  if(subEl) {
      subEl.innerHTML = `
        <span style="font-family:${fontSpec}">Выручка: <b>${formatCurrency(totalRevenue)}</b></span> · 
        <span style="font-family:${fontSpec}">На руки: <b>${formatCurrency(totalNetPay)}</b></span> 
        <span style="font-family:${fontSpec}; color:#64748b; cursor:help; border-bottom:1px dashed #ccc;" 
              title="Эффективная ставка: Процент, который врач получил на руки от своей выручки (Net Pay / Revenue).">
              (eff. ${effRate.toFixed(1)}%)
        </span>
      `;
  }

  // KPI Cards
  var elRev = document.getElementById("doc-modal-revenue");
  if(elRev) elRev.textContent = formatCurrency(totalRevenue);
  
  var elProf = document.getElementById("doc-modal-profit");
  if(elProf) {
      elProf.textContent = formatCurrency(totalNetProfit);
      elProf.style.color = totalNetProfit >= 0 ? "#0abab5" : "#ef4444";
      var lbl = elProf.previousElementSibling;
      if(lbl) lbl.textContent = "Чистая прибыль";
  }
  
  var elMarg = document.getElementById("doc-modal-margin");
  if(elMarg) {
      elMarg.textContent = formatPercent(rentabilityPct);
      elMarg.style.color = rentabilityPct >= 15 ? "#10b981" : (rentabilityPct > 0 ? "#0f172a" : "#ef4444");
  }

  // Payor Mix Bar
  var mixContainer = document.getElementById("doc-modal-mix-bar");
  if (mixContainer) {
    var pPhys = totalRevenue>0 ? (channels.phys/totalRevenue*100) : 0;
    var pDms = totalRevenue>0 ? (channels.dms/totalRevenue*100) : 0;
    var pCorp = totalRevenue>0 ? (channels.corp/totalRevenue*100) : 0;
    
    mixContainer.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-family:${fontSpec}; font-size:11px; color:#64748b;">
        <span>Структура выручки</span>
        <span>
          <span style="color:#0abab5">● Касса (${pPhys.toFixed(0)}%)</span> 
          <span style="color:#6366f1; margin-left:8px;">● ДМС (${pDms.toFixed(0)}%)</span>
        </span>
      </div>
      <div style="height:6px; width:100%; background:#f1f5f9; border-radius:3px; overflow:hidden; display:flex;">
        <div style="width:${pPhys}%; background:#0abab5;"></div>
        <div style="width:${pDms}%; background:#6366f1;"></div>
        <div style="width:${pCorp}%; background:#94a3b8;"></div>
      </div>
    `;
  }

  // 5. Services Table (Шрифты исправлены)
  var sortedSvc = Object.keys(servicesMap).map(k => ({name:k, ...servicesMap[k]}))
                  .sort((a,b) => b.revenue - a.revenue).slice(0, 5);
  var tbody = document.getElementById("doc-modal-services-body");
  if(tbody) {
      tbody.innerHTML = "";
      sortedSvc.forEach(s => {
          var tr = document.createElement("tr");
          // Явный шрифт в ячейках
          tr.innerHTML = `<td style="font-family:${fontSpec}; font-size:12px">${s.name}</td>
                          <td class="align-right" style="font-family:${fontSpec}; font-size:12px">${s.count}</td>
                          <td class="align-right" style="font-family:${fontSpec}; font-size:12px">${formatCurrency(s.revenue)}</td>`;
          tbody.appendChild(tr);
      });
  }

  // 6. Donut Chart (Шрифты исправлены)
  var canvas = document.getElementById("doc-modal-chart");
  if (canvas) {
    var ctx = canvas.getContext("2d");
    if (typeof docModalChart !== 'undefined' && docModalChart) docModalChart.destroy();

    var visProfit = Math.max(0, totalNetProfit);
    var gOpEx = createChartGradient(ctx, "#64748b", "#94a3b8");
    var gVar  = createChartGradient(ctx, "#f97316", "#fb923c");
    var gProf = totalNetProfit >= 0 ? createChartGradient(ctx, "#0abab5", "#2dd4bf") : createChartGradient(ctx, "#ef4444", "#f87171");

    docModalChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ["OpEx (Мат/Внеш)", "ФОТ Сделка", "Чистая прибыль"],
        datasets: [{
          data: [sumOpEx, sumVarFot, visProfit],
          backgroundColor: [gOpEx, gVar, gProf],
          borderWidth: 2, borderColor: "#ffffff"
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "70%", layout: { padding: 10 },
        plugins: {
          legend: { 
              position: 'bottom', 
              labels: { 
                  boxWidth: 8, 
                  font: { family: "Inter, sans-serif", size: 11 }, // LEGEND FONT
                  padding: 10, color: "#334155" 
              } 
          },
          tooltip: {
             backgroundColor: 'rgba(15, 23, 42, 0.95)',
             titleFont: { family: "Inter, sans-serif" }, // TOOLTIP TITLE FONT
             bodyFont: { family: "Inter, sans-serif" }, // TOOLTIP BODY FONT
             callbacks: {
                 label: function(c) {
                     var val = c.raw;
                     if(c.label === "Чистая прибыль") val = totalNetProfit;
                     var pct = totalRevenue > 0 ? (val/totalRevenue*100).toFixed(1) : 0;
                     return `${c.label}: ${formatShortCurrency(val)} (${pct}%)`;
                 }
             }
          },
          doughnutCenterText: {
            text: formatPercent(rentabilityPct),
            subtext: "Рентабельность",
            color: totalNetProfit >= 0 ? "#0abab5" : "#ef4444",
            fontFamily: "Inter, sans-serif" // CENTER FONT
          }
        }
      },
      plugins: [doughnutCenterTextPlugin]
    });
  }

  modal.classList.add("modal--open");
  modal.setAttribute("aria-hidden", "false");
}

/**
 * DOCTORS STRUCTURE v9.0 (Segments)
 * Consistent segmentation with the Scatter Matrix.
 */
function renderDoctorsStructureBar(metrics) {
  var canvas = document.getElementById("doctors-structure-chart");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (Chart.getChart(canvas)) Chart.getChart(canvas).destroy();

  if (!metrics || !metrics.byDoctor) return;

  // 1. Расчет Медиан (дублируем логику Scatter для синхронности)
  var allDocs = Object.values(metrics.byDoctor).filter(d => d.revenue > 0);
  if (allDocs.length === 0) return;

  var revs = allDocs.map(d => d.revenue).sort((a,b)=>a-b);
  var loads = allDocs.map(d => (d.pieceworkAmount/d.revenue*100)).sort((a,b)=>a-b);
  
  var medRev = revs[Math.floor(revs.length/2)];
  var medLoad = loads[Math.floor(loads.length/2)];

  var counts = { stars: 0, workhorse: 0, virtuoso: 0, outsider: 0 };
  var total = 0;

  allDocs.forEach(d => {
      var load = (d.pieceworkAmount/d.revenue*100);
      var isHighRev = d.revenue >= medRev;
      var isLowLoad = load <= medLoad;

      if (isHighRev && isLowLoad) counts.stars++;
      else if (isHighRev && !isLowLoad) counts.workhorse++;
      else if (!isHighRev && isLowLoad) counts.virtuoso++;
      else counts.outsider++;
      total++;
  });

  // 2. График
  var colors = {
      stars:     "#0ABAB5",
      workhorse: "#3b82f6",
      virtuoso:  "#f59e0b",
      outsider:  "#ef4444"
  };
  
  var datasets = [
      { label: "Звезды",      data: [counts.stars],     backgroundColor: colors.stars },
      { label: "Тягачи",      data: [counts.workhorse], backgroundColor: colors.workhorse },
      { label: "Виртуозы",    data: [counts.virtuoso],  backgroundColor: colors.virtuoso },
      { label: "Аутсайдеры",  data: [counts.outsider],  backgroundColor: colors.outsider }
  ].map((ds, i, arr) => ({
      ...ds,
      borderWidth: 0, barPercentage: 1.0, categoryPercentage: 1.0,
      borderRadius: { 
          topLeft: i===0?50:0, bottomLeft: i===0?50:0, 
          topRight: i===arr.length-1?50:0, bottomRight: i===arr.length-1?50:0 
      }
  }));

  var fontSpec = "Inter, system-ui, sans-serif";

  new Chart(ctx, {
    type: 'bar',
    data: { labels: ["Штат"], datasets: datasets },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true, backgroundColor:'rgba(15,23,42,0.95)', titleFont:{size:0}, bodyFont:{family:fontSpec} },
        datalabels: {
          display: ctx => (ctx.dataset.data[0] / total) > 0.05,
          color: "#fff", font: { weight: "bold", size: 12, family: fontSpec },
          formatter: v => v + " (" + Math.round(v/total*100) + "%)"
        }
      },
      scales: { x: { display: false, stacked: true }, y: { display: false, stacked: true } }
    },
    plugins: [ChartDataLabels]
  });
}

/**
 * 1. Flow Bar: Структура услуг (Градиенты + Inter Font)
 */
function renderServicesStructureBar(metrics) {
  var canvas = document.getElementById("services-structure-chart");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (Chart.getChart(canvas)) Chart.getChart(canvas).destroy();

  if (!metrics || !metrics.byService) return;

  // Группировка
  var groups = {
    consultation: { label: "Приемы", val: 0, c1: "#1d4ed8", c2: "#60a5fa" },
    diagnostic:   { label: "Диагностика", val: 0, c1: "#475569", c2: "#94a3b8" },
    surgery:      { label: "Хирургия", val: 0, c1: "#be123c", c2: "#fb7185" },
    procedure:    { label: "Процедуры", val: 0, c1: "#0f766e", c2: "#14b8a6" }
  };

  var totalRev = 0;
  Object.values(metrics.byService).forEach(s => {
    var cat = detectServiceCategory(s.name);
    groups[cat].val += s.revenue;
    totalRev += s.revenue;
  });

  if (totalRev === 0) return;

  var datasets = Object.values(groups).filter(g => g.val > 0).map((g, i, arr) => ({
    label: g.label,
    data: [g.val],
    backgroundColor: createChartGradient(ctx, g.c1, g.c2),
    borderWidth: 0,
    barPercentage: 1.0, categoryPercentage: 1.0,
    borderRadius: {
      topLeft: i===0?50:0, bottomLeft: i===0?50:0,
      topRight: i===arr.length-1?50:0, bottomRight: i===arr.length-1?50:0
    }
  }));

  var fontSpec = "Inter, system-ui, sans-serif";

  new Chart(ctx, {
    type: 'bar',
    data: { labels: ["Выручка"], datasets: datasets },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { 
            enabled: true, 
            backgroundColor: 'rgba(15,23,42,0.95)', 
            titleFont: { family: fontSpec }, bodyFont: { family: fontSpec } 
        },
        datalabels: {
          display: ctx => (ctx.dataset.data[0] / totalRev) > 0.05,
          color: "#fff", font: { weight: "bold", size: 12, family: fontSpec },
          formatter: (v, ctx) => ctx.dataset.label + " " + Math.round(v/totalRev*100) + "%"
        }
      },
      scales: { x: { display: false, stacked: true }, y: { display: false, stacked: true } }
    },
    plugins: [ChartDataLabels]
  });
}

/**
 * 2. Матрица услуг (Scatter): Inter Font + Tiffany/Red Logic
 */
function renderServicesScatter(metrics) {
  var canvas = document.getElementById("services-scatter-chart");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (Chart.getChart(canvas)) Chart.getChart(canvas).destroy();

  if (!metrics || !metrics.byService) return;

  var buckets = {
    stars:  { label: "💎 Звезды (>30%)", color: "#0ABAB5", data: [] },
    normal: { label: "⚪ Норма (10-30%)",color: "#64748b", data: [] },
    risk:   { label: "🟠 Риск (<10%)",   color: "#f97316", data: [] },
    loss:   { label: "🔴 Убыток",        color: "#ef4444", data: [] }
  };

  Object.values(metrics.byService).forEach(s => {
    if (s.count < 5 || s.revenue < 3000) return; // Noise filter
    var marg = s.marginPct;
    var p = { x: s.count, y: marg, r: s.revenue > 500000 ? 10 : (s.revenue > 100000 ? 7 : 4), _name: s.name, _rev: s.revenue, _prof: s.profitAfterMotivation };
    
    if (marg < 0) buckets.loss.data.push(p);
    else if (marg < 10) buckets.risk.data.push(p);
    else if (marg > 30) buckets.stars.data.push(p);
    else buckets.normal.data.push(p);
  });

  var datasets = Object.values(buckets).map(b => ({
    label: b.label, data: b.data, backgroundColor: b.color,
    borderColor: "#fff", borderWidth: 1, hoverBorderColor: "#0f172a", hoverBorderWidth: 2
  }));

  var fontSpec = "Inter, system-ui, sans-serif";

  new Chart(ctx, {
    type: 'bubble',
    data: { datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: 10 },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, font: { family: fontSpec, size: 11 }, color: "#475569" } },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { size: 0 }, bodyFont: { family: fontSpec, size: 12 }, padding: 10,
          callbacks: {
            label: c => [
                c.raw._name,
                `💰 Выручка: ${formatShortCurrency(c.raw._rev)}`,
                `📊 Маржа: ${c.raw.y.toFixed(1)}%`,
                `💵 Прибыль: ${formatShortCurrency(c.raw._prof)}`
            ]
          }
        },
        annotation: {
            zeroLine: { type: 'line', yMin: 0, yMax: 0, borderColor: 'rgba(15,23,42,0.2)', borderWidth: 1, borderDash:[4,4] }
        }
      },
      scales: {
        x: { type: 'logarithmic', title: { display:true, text:'Популярность (Log)', font:{family:fontSpec}, color:'#94a3b8' }, grid:{color:'rgba(148,163,184,0.1)'} },
        y: { title: { display:true, text:'Рентабельность (%)', font:{family:fontSpec}, color:'#94a3b8' }, grid:{color:'rgba(148,163,184,0.1)'} }
      }
    }
  });
}

/**
 * 3. Топ-15 услуг по ПРИБЫЛИ (Gradient Bars + Inter)
 */
function renderServicesTopChart(metrics) {
  var canvas = document.getElementById("services-top-chart");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (Chart.getChart(canvas)) Chart.getChart(canvas).destroy();

  if (!metrics || !metrics.byService) return;

  var list = Object.values(metrics.byService).map(s => ({
    name: s.name, profit: s.profitAfterMotivation || 0
  })).sort((a,b) => b.profit - a.profit).slice(0, 15);

  var fontSpec = "Inter, system-ui, sans-serif";
  var gWin = createChartGradient(ctx, "#0abab5", "#2dd4bf");
  var gLoss = createChartGradient(ctx, "#ef4444", "#f87171");

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: list.map(s => s.name.length > 25 ? s.name.substr(0,23)+"..." : s.name),
      datasets: [{
        data: list.map(s => s.profit),
        backgroundColor: list.map(s => s.profit >= 0 ? gWin : gLoss),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { 
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleFont: { family: fontSpec, size: 13 }, bodyFont: { family: fontSpec, size: 12 },
            callbacks: { label: c => `Прибыль: ${formatCurrency(c.raw)}` }
        }
      },
      scales: {
        x: { grid: { color: "rgba(148,163,184,0.15)" }, ticks: { callback: v => formatShortCurrency(v), font: { family: fontSpec }, color: "#64748b" } },
        y: { grid: { display: false }, ticks: { font: { family: fontSpec, weight: 500 }, color: "#0f172a" } }
      }
    }
  });
}

/**
 * 1. Динамика трафика (FINAL COLORS & TOOLTIPS).
 * Исправлено: Тултипы с белым текстом, шрифт Inter, заливка Тиффани.
 */
function renderPatientsDynamics(periodRows) {
  var canvas = document.getElementById("patients-dynamics-chart-canvas");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  var existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  var months = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  var patientsMap = Array.from({length: 12}, () => ({}));
  var visitsMap = Array.from({length: 12}, () => ({})); 
  var servicesData = new Array(12).fill(0);

  periodRows.forEach(function(row) {
    var m = row.serviceMonth;
    if (m >= 1 && m <= 12) {
      var idx = m - 1;
      servicesData[idx] += (row.quantity || 1);
      if (row.patientKey) patientsMap[idx][row.patientKey] = true;
      if (row.visitKey) visitsMap[idx][row.visitKey] = true;
    }
  });

  var patientsData = patientsMap.map(m => Object.keys(m).length);
  var visitsData = visitsMap.map(m => Object.keys(m).length);

  // Градиент заливки (Тиффани)
  var gradVisits = ctx.createLinearGradient(0, 0, 0, 350);
  gradVisits.addColorStop(0, "rgba(10, 186, 181, 0.25)"); 
  gradVisits.addColorStop(1, "rgba(10, 186, 181, 0.0)");

  var fontSpec = "Inter, system-ui, sans-serif";

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Услуги (шт)',
          data: servicesData,
          borderColor: "#64748b", // Серый
          backgroundColor: "transparent",
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          yAxisID: 'y1'
        },
        {
          label: 'Визиты',
          data: visitsData,
          borderColor: "#0abab5", // Тиффани
          backgroundColor: gradVisits,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          borderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'Уникальные пациенты',
          data: patientsData,
          borderColor: "#1e3a8a", // Темно-синий
          backgroundColor: "transparent",
          fill: false,
          tension: 0.4,
          pointRadius: 3,
          borderWidth: 2,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { 
          position: 'top', 
          align: 'end', 
          labels: { usePointStyle: true, boxWidth: 8, font: { family: fontSpec, size: 11 }, color: "#64748b" } 
        },
        tooltip: { 
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#ffffff', // Белый
          bodyColor: '#ffffff',  // Белый
          titleFont: { family: fontSpec, size: 13 },
          bodyFont: { family: fontSpec, size: 12 },
          padding: 12,
          cornerRadius: 6,
          callbacks: {
            label: function(ctx) {
              return ctx.dataset.label + ": " + ctx.raw.toLocaleString("ru-RU");
            }
          }
        }
      },
      scales: {
        x: { 
          grid: { display: false }, 
          ticks: { font: { family: fontSpec }, color: "#94a3b8" } 
        },
        y: { 
          title: { display: true, text: 'Люди / Визиты', font: { family: fontSpec }, color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.1)" }, 
          beginAtZero: true, 
          ticks: { font: { family: fontSpec }, color: "#64748b" }
        },
        y1: {
          position: 'right',
          title: { display: true, text: 'Услуги', font: { family: fontSpec }, color: "#94a3b8" },
          grid: { display: false },
          beginAtZero: true,
          ticks: { font: { family: fontSpec }, color: "#64748b" }
        }
      }
    }
  });
}

/**
 * 2. Демография (Corrected Name Access)
 * Fix: Uses p.name (which is populated from patientName in metrics).
 */
function renderPatientsDemographics(metrics) {
  var canvas = document.getElementById("patients-demographics-chart");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (Chart.getChart(canvas)) Chart.getChart(canvas).destroy();

  if (!metrics || !metrics.byPatient) return;

  var buckets = { "0-17": {m:0,f:0}, "18-30": {m:0,f:0}, "31-45": {m:0,f:0}, "46-60": {m:0,f:0}, "60+": {m:0,f:0} };
  var totalM = 0, totalF = 0;
  
  // Проходим по уникальным пациентам
  Object.values(metrics.byPatient).forEach(function(p) {
    // В calculateMetrics: byPatient[key] = { name: row.patientName ... }
    var nameToTest = p.name || ""; 
    
    var gender = detectGender(nameToTest);
    var age = calculateAge(p.birthDate);
    
    if (age === null) age = 35; // Fallback если даты нет

    var key = "60+";
    if (age <= 17) key = "0-17"; 
    else if (age <= 30) key = "18-30"; 
    else if (age <= 45) key = "31-45"; 
    else if (age <= 60) key = "46-60";

    if (gender === "male") { 
        buckets[key].m++; 
        totalM++; 
    } else if (gender === "female") { 
        buckets[key].f++; 
        totalF++; 
    } 
    // Unknown пол игнорируем на графике для чистоты
  });

  var labels = Object.keys(buckets);
  // Мужчины влево (отрицательные значения), Женщины вправо
  var dataM = labels.map(k => buckets[k].m * -1); 
  var dataF = labels.map(k => buckets[k].f);

  var totalKnown = totalM + totalF;
  
  var elM = document.getElementById("demo-male-pct");
  var elF = document.getElementById("demo-female-pct");
  
  if(elM) elM.textContent = totalKnown > 0 ? (totalM / totalKnown * 100).toFixed(0) + "%" : "0%";
  if(elF) elF.textContent = totalKnown > 0 ? (totalF / totalKnown * 100).toFixed(0) + "%" : "0%";

  var fontSpec = "Inter, system-ui, sans-serif";

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { 
          label: 'Мужчины', 
          data: dataM, 
          backgroundColor: "#3b82f6", 
          borderRadius: {topLeft:4, bottomLeft:4}, 
          barPercentage: 0.6 
        },
        { 
          label: 'Женщины', 
          data: dataF, 
          backgroundColor: "#ec4899", 
          borderRadius: {topRight:4, bottomRight:4}, 
          barPercentage: 0.6 
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { 
          stacked: true, 
          grid: { color: "rgba(148, 163, 184, 0.15)" }, 
          ticks: { 
            callback: function(v){ return Math.abs(v); }, 
            font: { family: fontSpec, size: 10 },
            color: "#64748b" 
          } 
        },
        y: { 
          stacked: true, 
          grid: { display: false }, 
          ticks: { font: { family: fontSpec, size: 11 }, color: "#64748b" } 
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { family: fontSpec }, bodyFont: { family: fontSpec },
          callbacks: { 
            label: function(ctx) { return ctx.dataset.label + ": " + Math.abs(ctx.raw); } 
          }
        }
      }
    }
  });
}


/**
 * Эвристика: Определение Программы (Канала продаж).
 * ИСПРАВЛЕНО: Использует attachmentTypeRaw и paymentMethodRaw.
 */
function detectProgramType(row) {
  var attach = (row.attachmentTypeRaw || "").toLowerCase();
  var payment = (row.paymentMethodRaw || "").toLowerCase();
  
  if (attach.indexOf("дмс") !== -1 || attach.indexOf("dms") !== -1) {
    return "ДМС (Страховые)";
  }
  
  if (payment.indexOf("карт") !== -1 || payment.indexOf("card") !== -1 || payment.indexOf("налич") !== -1 || payment.indexOf("cash") !== -1) {
    return "Физ.лица (Прямые)";
  }

  return "Юр.лица / Прочее";
}

/**
 * Рендер раздела "Программы" (Каналы продаж).
 * Версия v5.4 (Enhanced Table): Добавлены колонки "Услуг" и "Средний чек" для оценки нагрузки.
 */
function renderProgramsDashboard() {
  // DOM элементы
  var kpiCashRatio = document.getElementById("prog-kpi-dms-share");
  var kpiMargin = document.getElementById("prog-kpi-total-margin");
  var kpiLeader = document.getElementById("prog-kpi-leader");
  var kpiCheck = document.getElementById("prog-kpi-check-phys");
  var tbody = document.getElementById("programs-table-body");
  var canvas = document.getElementById("programs-efficiency-chart");

  if (!tbody || !canvas) return;

  // Очистка
  tbody.innerHTML = "";
  if(kpiCashRatio) kpiCashRatio.textContent = "0%";
  
  if (!preparedDataRows || preparedDataRows.length === 0) {
    renderEmptyState(tbody.closest(".placeholder-table"), { title: "Нет данных" });
    return;
  }

  // Фильтры и Период
  var filteredRows = applyFilters(preparedDataRows, appState.filters);
  var periodRows = filterRowsByPeriod(filteredRows, appState.periodA);
  
  if (!periodRows || periodRows.length === 0) {
    renderEmptyState(tbody.closest(".placeholder-table"), { title: "Нет данных за период" });
    return;
  }

  // Словарь названий
  var programLabels = {
    "phys": "Физ.лица (Касса)",
    "dms": "ДМС (Страховые)",
    "corp": "Корпоративные / Прочее"
  };

  // 1. Агрегация данных
  var programsMap = {};
  var totalRevenue = 0;
  var totalNetProfit = 0;

  periodRows.forEach(function(row) {
    var key = row.programKey || "corp";
    
    if (!programsMap[key]) {
      programsMap[key] = { 
        name: programLabels[key] || "Прочее", 
        key: key,
        revenue: 0, profit: 0, costFull: 0,
        patientsSet: {}, services: 0
      };
    }
    
    var rev = row.amountPaid || 0;
    
    // Фактическая Чистая Прибыль
    var prof = (typeof row.profitAfterMotivation === 'number') 
      ? row.profitAfterMotivation 
      : (rev - (row.costFull42 || 0));

    var cost = rev - prof;

    programsMap[key].revenue += rev;
    programsMap[key].profit += prof;
    programsMap[key].costFull += cost;
    programsMap[key].services += (row.quantity || 1); // Считаем нагрузку
    
    if (row.patientKey) programsMap[key].patientsSet[row.patientKey] = true;

    totalRevenue += rev;
    totalNetProfit += prof;
  });

  // Преобразуем в массив
  var programsArray = Object.values(programsMap).map(function(p) {
    var uniquePatients = Object.keys(p.patientsSet).length;
    return {
      name: p.name,
      key: p.key,
      revenue: p.revenue,
      profit: p.profit,
      costFull: p.costFull,
      services: p.services, // Нагрузка
      patients: uniquePatients,
      margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
      avgCheck: uniquePatients > 0 ? p.revenue / uniquePatients : 0
    };
  });

  programsArray.sort(function(a, b) { return b.revenue - a.revenue; });

  // --- 2. KPI ---
  
  // KPI 1: Cash Ratio
  var physData = programsArray.find(p => p.key === "phys");
  var cashRatio = totalRevenue > 0 ? ((physData?.revenue || 0) / totalRevenue * 100) : 0;
  
  if (kpiCashRatio) {
    var card = kpiCashRatio.closest(".kpi-card");
    if(card) {
       var title = card.querySelector(".kpi-card__title");
       var sub = card.querySelector(".kpi-card__subtitle");
       if(title) title.textContent = "Доля Кассы (Cash Ratio)";
       if(sub) sub.textContent = "Живые деньги (Физ.лица)";
    }
    kpiCashRatio.textContent = formatPercent(cashRatio);
    kpiCashRatio.style.color = cashRatio > 50 ? "#10b981" : "#f59e0b";
  }

  // KPI 2: Рентабельность
  var totalMargin = totalRevenue > 0 ? (totalNetProfit / totalRevenue * 100) : 0;
  if (kpiMargin) {
    kpiMargin.textContent = formatPercent(totalMargin);
    kpiMargin.style.color = totalMargin >= 0 ? "#0abab5" : "#dc2626";
  }

  // KPI 3: Лидер по прибыли
  var profitLeader = [...programsArray].sort((a,b) => b.profit - a.profit)[0];
  if (kpiLeader && profitLeader) {
    kpiLeader.textContent = profitLeader.name.split('(')[0].trim();
    kpiLeader.style.color = profitLeader.profit > 0 ? "#0f172a" : "#dc2626";
  }

  // KPI 4: Средний чек Физлиц
  if (kpiCheck) {
    kpiCheck.textContent = physData ? formatCurrency(physData.avgCheck) : "0 ₽";
  }

  // --- 3. Таблица (Обновленная структура) ---
  // Нам нужно обновить заголовок таблицы в HTML через JS, так как мы добавляем колонки
  var tableHead = document.querySelector("#programs-table-body").closest("table").querySelector("thead tr");
  if (tableHead) {
    tableHead.innerHTML = `
      <th>Канал продаж</th>
      <th class="align-right">Пациентов</th>
      <th class="align-right">Услуг</th>
      <th class="align-right">Ср. чек</th>
      <th class="align-right">Выручка</th>
      <th class="align-right">Прибыль</th>
      <th class="align-right">Маржа</th>
    `;
  }

  var maxRev = programsArray.length > 0 ? programsArray[0].revenue : 1;
  var fontStyle = 'font-family: "Inter", system-ui, sans-serif;';

  programsArray.forEach(p => {
    var tr = document.createElement("tr");
    tr.classList.add("table-row--clickable");
    
    var marginClass = "";
    if (p.margin < 0) marginClass = "color:#dc2626; font-weight:600;";
    else if (p.margin > 30) marginClass = "color:#10b981; font-weight:600;";
    
    var profitColor = p.profit >= 0 ? "#0abab5" : "#dc2626";
    var barWidth = (p.revenue / maxRev) * 50;

    tr.innerHTML = 
      `<td style="${fontStyle} font-weight:500;">
          ${p.name}
       </td>
       <td class="align-right" style="${fontStyle}">${p.patients.toLocaleString("ru-RU")}</td>
       <td class="align-right" style="${fontStyle}">${p.services.toLocaleString("ru-RU")}</td>
       <td class="align-right" style="${fontStyle} color:#64748b;">${formatCurrency(p.avgCheck)}</td>
       <td class="align-right" style="${fontStyle}">
          <div>${formatCurrency(p.revenue)}</div>
          <div style="height:3px; background:#3b82f6; width:${barWidth}px; margin-left:auto; opacity:0.5; border-radius:2px;"></div>
       </td>
       <td class="align-right" style="${fontStyle} font-weight:600; color:${profitColor};">${formatCurrency(p.profit)}</td>
       <td class="align-right" style="${fontStyle} ${marginClass}">${formatPercent(p.margin)}</td>`;
    tbody.appendChild(tr);
  });

  // --- 4. График (Без изменений, он хороший) ---
  var ctx = canvas.getContext("2d");
  var existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  var labels = programsArray.map(p => p.name.split('(')[0].trim());
  var dataRev = programsArray.map(p => p.revenue);
  var dataProf = programsArray.map(p => p.profit);
  var fontSpec = "Inter, system-ui, sans-serif";

  // Градиенты
  var tealGrad = createChartGradient(ctx, "#0abab5", "#2dd4bf");
  var redGrad = createChartGradient(ctx, "#ef4444", "#f87171");
  var profitColors = dataProf.map(v => v >= 0 ? tealGrad : redGrad);

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { 
          label: 'Выручка (Объем)', 
          data: dataRev, 
          backgroundColor: "rgba(148, 163, 184, 0.2)", 
          borderColor: "#94a3b8", 
          borderWidth: 1, 
          borderRadius: 4, 
          barPercentage: 0.6,
          categoryPercentage: 0.8,
          order: 2 
        },
        { 
          label: 'Чистая Прибыль', 
          data: dataProf, 
          backgroundColor: profitColors, 
          borderRadius: 4, 
          barPercentage: 0.4, 
          categoryPercentage: 0.8,
          order: 1 
        }
      ]
    },
    options: {
      indexAxis: 'y', 
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { 
          grid: { color: "rgba(148, 163, 184, 0.15)" }, 
          ticks: { callback: v => formatShortCurrency(v), font: { family: fontSpec }, color: "#64748b" } 
        },
        y: { 
          grid: { display: false }, 
          ticks: { font: { family: fontSpec, size: 12, weight: '500' }, color: "#0f172a" } 
        }
      },
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: fontSpec }, boxWidth: 10, usePointStyle: true } },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { family: fontSpec, size: 13 },
          bodyFont: { family: fontSpec, size: 12 },
          callbacks: { label: function(ctx) { return `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`; } }
        }
      }
    }
  });
}

/**
 * UPDATED SCHEMA v5.1 (NO BONUS, ONLY PIECEWORK)
 */
const MUE_SRS_SCHEMA = {
  // 1. Пациент и Визит
  "patientName":      { id: 1,  m: false, t: "String", label: "ФИО пациента" },
  "birthDate":        { id: 2,  m: false, t: "Date",   label: "Дата рождения" },
  "department":       { id: 5,  m: true,  t: "String", label: "Отделение" },
  "doctor":           { id: 4,  m: true,  t: "String", label: "Исполнитель" },
  "serviceDate":      { id: 17, m: true,  t: "Date",   label: "Дата оказания" },

  // 2. Услуга и Финансы
  "serviceName":      { id: 7,  m: true,  t: "String", label: "Услуга" },
  "amountPaid":       { id: 13, m: true,  t: "Float",  label: "Оплачено (Выручка)" },
  "quantity":         { id: 10, m: true,  t: "Int",    label: "Кол-во" },
  
  // 3. Себестоимость (Расходы)
  "costDirect38":     { id: 38, m: false, t: "Float",  label: "Прямые расходы" },
  "commission39":     { id: 39, m: false, t: "Float",  label: "Комиссия" },
  "laborCost":        { id: 31, m: false, t: "Float",  label: "ФОТ (Оклад)" },
  "socialChargesTech":{ id: 32, m: false, t: "Float",  label: "Налог (Оклад)" },
  "costFull42":       { id: 42, m: true,  t: "Float",  label: "Полная себестоимость (База)" },

  // 4. Прибыль (Результат)
  "profitMethod43":   { id: 43, m: true,  t: "Float",  label: "Маржинальная прибыль" },

  // 5. Мотивация (Piecework - Сдельная часть)
  "pieceworkRate":    { id: 45, m: false, t: "Float",  label: "Ставка (%)" },
  "pieceworkAmount":  { id: 46, m: false, t: "Float",  label: "ФОТ Сделка (Gross)" },
  
  // 6. Налоги (Детализация)
  "socialChargesTotal":{ id: 51, m: false, t: "Float", label: "Налоги (Сделка)" },
  "taxPension":       { id: 47, m: false, t: "Float",  label: "ПФР" },
  
  // 7. Распределение (Net)
  "netWagePool":      { id: 52, m: false, t: "Float",  label: "Чистый котел" },
  "payFinalMed":      { id: 56, m: false, t: "Float",  label: "На руки врачу" },
  
  // 8. Лимиты
  "fundLimit":        { id: 44, m: false, t: "Float",  label: "Лимит фонда (План)" },
  "reserveFund":      { id: 58, m: false, t: "Float",  label: "Резерв (Экономия)" }
};

/**
 * Утилита: Извлечение значения (из объекта или из raw)
 */
function getValue(row, key) {
  if (row[key] !== undefined) return row[key];
  // Если нет в верхнем уровне, ищем в raw
  if (row.raw && row.raw[key] !== undefined) return row.raw[key];
  return undefined;
}

/**
 * Утилита: Проверка на пустоту
 */
function isEmpty(val) {
  return val === null || val === undefined || val === "";
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ ЭКСПЕРТИЗЫ
 */
function runMUE_SRS_Audit() {
  if (!preparedDataRows || preparedDataRows.length === 0) {
    alert("❌ Данные не загружены.");
    return;
  }

  console.clear();
  console.log("%c🏥 MUE SRS v5.0 AUDIT STARTED", "font-size: 18px; font-weight: bold; color: #2563eb; background: #eff6ff; padding: 5px;");
  
  var fieldStats = {};
  Object.keys(MUE_SRS_SCHEMA).forEach(function(key) {
    fieldStats[key] = { label: MUE_SRS_SCHEMA[key].label, filled: 0, total: 0 };
  });

  var reportRows = [];
  var currentPeriod = appState.periodA;
  
  // Счетчики глобальных проблем
  var counters = {
    total: preparedDataRows.length,
    hiddenByPeriod: 0,
    criticalErrors: 0,
    logicErrors: 0
  };

  preparedDataRows.forEach(function(row, index) {
    var issues = [];
    var status = "OK";
    
    // 1. ПРОВЕРКА ПЕРИОДА (Filter Check)
    var isVisible = false;
    if (row.serviceYear === currentPeriod.year) {
      if (currentPeriod.mode === 'month' && row.serviceMonth === currentPeriod.monthFrom) isVisible = true;
      else if (currentPeriod.mode === 'ytd' && row.serviceMonth <= currentPeriod.monthTo) isVisible = true;
      else if (currentPeriod.mode === 'range' && row.serviceMonth >= currentPeriod.monthFrom && row.serviceMonth <= currentPeriod.monthTo) isVisible = true;
    }
    if (!isVisible) {
      counters.hiddenByPeriod++;
      status = "HIDDEN";
    }

    // 2. ВАЛИДАЦИЯ ВСЕХ 60 ПОЛЕЙ
    Object.keys(MUE_SRS_SCHEMA).forEach(function(key) {
      var rule = MUE_SRS_SCHEMA[key];
      var val = getValue(row, key); // Умное извлечение (processed или raw)
      
      fieldStats[key].total++;
      if (!isEmpty(val)) fieldStats[key].filled++;

      // Проверка обязательности
      if (rule.m && isEmpty(val)) {
        issues.push(`MISSING [${rule.id}]: ${rule.label}`);
        if (status !== "HIDDEN") status = "CRITICAL";
      }
      
      // Проверка типа (если значение есть)
      if (!isEmpty(val)) {
        var isTypeOk = true;
        if (rule.t === "Float" || rule.t === "Int") {
          if (isNaN(Number(val))) isTypeOk = false;
        } else if (rule.t === "Date") {
          if (!(val instanceof Date) && isNaN(Date.parse(val))) isTypeOk = false;
        }
        
        if (!isTypeOk) {
          issues.push(`TYPE ERROR [${rule.id}]: ${rule.label} ожидал ${rule.t}`);
          if (status !== "HIDDEN") status = "CRITICAL";
        }
      }
    });

    // 3. БИЗНЕС-ЛОГИКА (CROSS-CHECK)
    var paid = row.amountPaid || 0;
    var cost = row.costFull42 || 0;
    var profit = row.profitMethod43 || 0;
    
    // Проверка 3.3.6: Profit = Paid - Cost
    if (Math.abs((paid - cost) - profit) > 1.0) {
      issues.push("LOGIC [43]: Прибыль не равна Выручка - Себестоимость");
      counters.logicErrors++;
    }

    // Сохранение в отчет (только если есть проблемы или скрыто)
    if (issues.length > 0 || status === "HIDDEN") {
      // Чтобы не перегружать Excel, пишем в отчет только если есть проблемы
      if (status === "CRITICAL" || status === "HIDDEN" || counters.logicErrors < 1000) {
         reportRows.push({
           "Row": index + 2,
           "Status": status,
           "Issues": issues.join(" | "),
           "Date": row.serviceDate ? row.serviceDate.toLocaleDateString() : "INVALID",
           "Amount": paid,
           "Profit": profit,
           "Raw JSON": JSON.stringify(row.raw).substring(0, 100)
         });
      }
    }
    
    if (status === "CRITICAL") counters.criticalErrors++;
  });

  // 4. ВЫВОД В КОНСОЛЬ (Таблица заполненности)
  console.group("📊 FILL RATE REPORT (Заполненность полей)");
  var tableData = [];
  Object.keys(fieldStats).forEach(function(key) {
    var s = fieldStats[key];
    var pct = ((s.filled / s.total) * 100).toFixed(1);
    // Выводим, если заполнено менее 100% или это обязательное поле
    if (pct < 100 || MUE_SRS_SCHEMA[key].m) {
      tableData.push({
        "ID": MUE_SRS_SCHEMA[key].id,
        "Field": s.label,
        "Mandatory": MUE_SRS_SCHEMA[key].m ? "YES" : "-",
        "Fill Rate": pct + "%",
        "Missing Rows": s.total - s.filled
      });
    }
  });
  console.table(tableData);
  console.groupEnd();

  // 5. ГЕНЕРАЦИЯ CSV
  if (reportRows.length === 0) {
    alert("✨ Идеальные данные! 100% соответствие SRS v5.0.");
  } else {
    var csv = convertToCSV_Final(reportRows);
    var fileName = "MUE_SRS_v5_Audit_" + new Date().toISOString().slice(0,10) + ".csv";
    downloadFile_Final(csv, fileName);
    
    var msg = `АУДИТ ЗАВЕРШЕН:\n` +
              `Всего строк: ${counters.total}\n` +
              `👁️ Скрыто фильтром: ${counters.hiddenByPeriod}\n` +
              `❌ Критических ошибок: ${counters.criticalErrors}\n` +
              `🧠 Ошибок логики: ${counters.logicErrors}\n` +
              `\nДетальная статистика в консоли (F12).\nCSV-отчет скачивается...`;
    alert(msg);
  }
}

// Вспомогательные функции CSV
function convertToCSV_Final(rows) {
  if (!rows || !rows.length) return "";
  var headers = Object.keys(rows[0]).join(";");
  var content = headers + "\n";
  rows.forEach(function(r) {
    content += Object.values(r).map(function(v) {
      return '"' + String(v).replace(/"/g, '""').replace(/\n/g, " ") + '"';
    }).join(";") + "\n";
  });
  return content;
}

function downloadFile_Final(content, fileName) {
  var blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Создание кнопки SRS Audit.
 * Расположение: Хедер, рядом с версией.
 * Стиль: Компактный, ghost-button.
 */
function createSRSBtn() {
  // 1. Удаляем старую кнопку если есть
  var existing = document.getElementById("mue-audit-btn");
  if (existing) existing.remove();

  // 2. Ищем контейнер в хедере (где бейдж версии)
  var headerMeta = document.querySelector(".app-header__meta");
  if (!headerMeta) return;

  // 3. Создаем кнопку
  var btn = document.createElement("button");
  btn.id = "mue-audit-btn";
  btn.textContent = "SRS Audit"; 
  btn.title = "Запустить проверку качества данных (SRS v5.0)"; // Тултип при наведении

  // 4. Стили (Компактный дизайн)
  btn.style.cssText = `
    margin-left: 12px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    font-family: Inter, system-ui, sans-serif;
    color: #64748b;
    background-color: transparent;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    vertical-align: middle;
  `;

  // 5. Ховер-эффект (через JS, так как стили инлайновые)
  btn.onmouseover = function() {
    this.style.borderColor = "#0abab5";
    this.style.color = "#0abab5";
    this.style.backgroundColor = "rgba(10, 186, 181, 0.05)";
  };
  btn.onmouseout = function() {
    this.style.borderColor = "#cbd5e1";
    this.style.color = "#64748b";
    this.style.backgroundColor = "transparent";
  };

  btn.onclick = runMUE_SRS_Audit;

  // 6. Вставляем в хедер
  headerMeta.appendChild(btn);
}

window.addEventListener("load", function() { setTimeout(createSRSBtn, 2000); });

/**
 * MATH HELPER: Простая линейная регрессия (Least Squares Method).
 * y = mx + b
 * Возвращает объект { m: наклон, b: смещение, predict: функция(x) }
 */
function calculateLinearRegression(xValues, yValues) {
  var n = xValues.length;
  if (n === 0 || n !== yValues.length) return null;

  var sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

  for (var i = 0; i < n; i++) {
    sumX += xValues[i];
    sumY += yValues[i];
    sumXY += xValues[i] * yValues[i];
    sumXX += xValues[i] * xValues[i];
  }

  var slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  var intercept = (sumY - slope * sumX) / n;

  return {
    m: slope,
    b: intercept,
    predict: function(x) { return slope * x + intercept; }
  };
}

/**
 * HR Drill-down: Обновление состояния и первый рендер.
 */
function updateDrilldownState(category, doctors) {
  // 1. Сохраняем в стейт
  hrTableState.category = category;
  hrTableState.rawData = doctors.sort((a,b) => b.y - a.y); // Сортировка по доходу
  hrTableState.filteredData = [...hrTableState.rawData]; // Сначала показываем всех
  hrTableState.page = 1;
  hrTableState.searchTerm = "";

  // 2. Сбрасываем инпут поиска
  var searchInput = document.getElementById("hr-drilldown-search");
  if (searchInput) searchInput.value = "";

  // 3. Открываем контейнер
  var container = document.getElementById("hr-drilldown-container");
  container.classList.add("active");
  container.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // 4. Рисуем
  renderDrilldownTable();
}

/**
 * HR Drill-down: Отрисовка таблицы и пагинации.
 */
function renderDrilldownTable() {
  var title = document.getElementById("hr-drilldown-title");
  var tbody = document.getElementById("hr-drilldown-body");
  var info = document.getElementById("hr-drilldown-info");
  var btnPrev = document.getElementById("hr-btn-prev");
  var btnNext = document.getElementById("hr-btn-next");

  if (!tbody) return;

  // Заголовок
  title.innerHTML = `Врачи категории <span style="color:#2563eb">${hrTableState.category}</span> (${hrTableState.filteredData.length})`;

  // Пагинация
  var start = (hrTableState.page - 1) * hrTableState.pageSize;
  var end = start + hrTableState.pageSize;
  var pageData = hrTableState.filteredData.slice(start, end);

  // Рендер строк
  tbody.innerHTML = "";
  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted" style="text-align:center">Ничего не найдено</td></tr>`;
  } else {
    pageData.forEach(d => {
      var tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d.name}</td>
        <td class="align-right">${formatCurrency(d.x)}</td>
        <td class="align-right" style="font-weight:600">${formatCurrency(d.y)}</td>
        <td class="align-right muted">${d.rate.toFixed(1)}%</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Обновление футера
  info.textContent = `Показано ${Math.min(start + 1, hrTableState.filteredData.length)}–${Math.min(end, hrTableState.filteredData.length)} из ${hrTableState.filteredData.length}`;
  
  var totalPages = Math.ceil(hrTableState.filteredData.length / hrTableState.pageSize);
  btnPrev.disabled = hrTableState.page <= 1;
  btnNext.disabled = hrTableState.page >= totalPages || totalPages === 0;
}

/**
 * HR Drill-down: Инициализация обработчиков событий (Search/Page).
 * Вызывается один раз при рендере дашборда.
 */
function initDrilldownEvents() {
  var searchInput = document.getElementById("hr-drilldown-search");
  var btnPrev = document.getElementById("hr-btn-prev");
  var btnNext = document.getElementById("hr-btn-next");

  // Удаляем старые слушатели (клонированием), чтобы не дублировать при перерисовке графика
  if (searchInput) {
    var newSearch = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearch, searchInput);
    
    newSearch.addEventListener("input", function(e) {
      var term = e.target.value.toLowerCase();
      hrTableState.searchTerm = term;
      hrTableState.page = 1; // Сброс на 1 страницу
      
      // Фильтрация
      hrTableState.filteredData = hrTableState.rawData.filter(doc => 
        doc.name.toLowerCase().includes(term)
      );
      renderDrilldownTable();
    });
  }

  if (btnPrev) {
    var newPrev = btnPrev.cloneNode(true);
    btnPrev.parentNode.replaceChild(newPrev, btnPrev);
    newPrev.addEventListener("click", function() {
      if (hrTableState.page > 1) {
        hrTableState.page--;
        renderDrilldownTable();
      }
    });
  }

  if (btnNext) {
    var newNext = btnNext.cloneNode(true);
    btnNext.parentNode.replaceChild(newNext, btnNext);
    newNext.addEventListener("click", function() {
      var totalPages = Math.ceil(hrTableState.filteredData.length / hrTableState.pageSize);
      if (hrTableState.page < totalPages) {
        hrTableState.page++;
        renderDrilldownTable();
      }
    });
  }
}

/**
 * Открытие модалки с крупной картой ОТДЕЛЕНИЙ.
 */
function openScatterModal(summary) {
  // 1. Ищем модалку (ID из index.html)
  var modal = document.getElementById("scatter-modal");
  
  if (!modal) {
      console.error("Modal #scatter-modal not found!");
      return;
  }

  // 2. Открываем
  modal.classList.add("modal--open");
  modal.setAttribute("aria-hidden", "false");

  // 3. Рисуем с задержкой (чтобы DOM успел отрисоваться)
  setTimeout(function() {
    // В renderDepartmentsPortfolioScatter передаем ID канваса, который ВНУТРИ модалки
    // В index.html это "departments-portfolio-scatter-modal"
    renderDepartmentsPortfolioScatter(summary, "departments-portfolio-scatter-modal");
  }, 100);
}


/**
 * UNIT ECONOMICS SANKEY v9.2 (100k Model)
 * Shows how 100,000 RUB of revenue is distributed.
 * Features: Absolute & Relative values in tooltips.
 */
function renderUnitSankey(metrics) {
  var container = document.getElementById("clinic-unit-sankey");
  if (!container || typeof Highcharts === 'undefined') return;
  container.innerHTML = "";

  var totalActualRevenue = metrics.totalRevenue || 0;
  if (totalActualRevenue <= 0) {
    container.innerHTML = '<div class="empty-state">Нет данных для моделирования</div>';
    return;
  }

  // Масштабирование
  const MODEL_BASE = 100000;
  var ratio = MODEL_BASE / totalActualRevenue;

  // --- 1. Расчет ---
  
  // Уровень 1: OpEx vs Margin
  var rawOpEx = metrics.totalCostFull || 0; // Чистый OpEx
  var uOpEx = rawOpEx * ratio;
  
  var uMargin = MODEL_BASE - uOpEx; // Остаток (Маржа)
  var visMargin = Math.max(0, uMargin);

  // Уровень 2: Margin -> Piecework vs Profit
  var rawPiecework = metrics.totalPiecework || 0;
  var uPiecework = rawPiecework * ratio;
  if (uPiecework > visMargin) uPiecework = visMargin; // Clamp
  
  var uProfit = visMargin - uPiecework;
  var visProfit = Math.max(0, uProfit);

  // Уровень 3: Piecework -> Tax + NetPool (Admin + Docs)
  // Пропорции внутри сделки
  var rawGross = metrics.totalPiecework || 1;
  var rawTax = metrics.totalSocialCharges || 0;
  var rawNetPool = metrics.totalNetWagePool || 0;
  var rawAdmin = metrics.totalShareAdmin || 0;
  var rawDocs = (rawNetPool - rawAdmin); // Врачи

  var uTax = uPiecework * (rawTax / rawGross);
  var uAdmin = uPiecework * (rawAdmin / rawGross);
  var uDocs = uPiecework * (rawDocs / rawGross);

  // Уровень 4: Docs -> Hand
  var rawHand = metrics.totalPayFinalMed || 0;
  var uHand = uDocs * (rawHand / rawDocs || 0);

  // --- 2. Визуал ---
  var fontSpec = "Inter, system-ui, sans-serif";
  var colors = {
      rev: "#0f172a",   opex: "#64748b", marg: "#38bdf8",
      piece: "#f97316", profit: "#0abab5",
      tax: "#ef4444",   adm: "#d97706",  doc: "#06b6d4", hand: "#10b981"
  };

  // Хелпер: "12 500 ₽ (12.5%)"
  function getMeta(val) {
      var v = Math.round(val);
      var pct = (val / MODEL_BASE * 100).toFixed(1) + "%";
      return { val: v, pct: pct, text: `${v.toLocaleString()} ₽ (${pct})` };
  }

  var nodes = [
    { id: 'Rev',   name: '100 000 ₽', color: colors.rev },
    { id: 'OpEx',  name: 'OpEx', color: colors.opex, custom: getMeta(uOpEx) },
    { id: 'Marg',  name: 'Маржа', color: colors.marg, custom: getMeta(visMargin) },
    { id: 'Piece', name: 'Сделка', color: colors.piece, custom: getMeta(uPiecework) },
    { id: 'Prof',  name: 'Прибыль', color: colors.profit, custom: getMeta(visProfit) },
    { id: 'Tax',   name: 'Налоги', color: colors.tax, custom: getMeta(uTax) },
    { id: 'Adm',   name: 'АУП', color: colors.adm, custom: getMeta(uAdmin) },
    { id: 'Doc',   name: 'Фонд Врачей', color: colors.doc, custom: getMeta(uDocs) },
    { id: 'Hand',  name: 'На руки', color: colors.hand, custom: getMeta(uHand) }
  ];

  var links = [];
  if (uOpEx > 0) links.push({ from: 'Rev', to: 'OpEx', weight: uOpEx });
  if (visMargin > 0) links.push({ from: 'Rev', to: 'Marg', weight: visMargin });
  
  if (uPiecework > 0) links.push({ from: 'Marg', to: 'Piece', weight: uPiecework });
  if (visProfit > 0) links.push({ from: 'Marg', to: 'Prof', weight: visProfit });
  
  if (uTax > 0) links.push({ from: 'Piece', to: 'Tax', weight: uTax });
  if (uAdmin > 0) links.push({ from: 'Piece', to: 'Adm', weight: uAdmin });
  if (uDocs > 0) links.push({ from: 'Piece', to: 'Doc', weight: uDocs });
  
  if (uHand > 0) links.push({ from: 'Doc', to: 'Hand', weight: uHand });

  Highcharts.chart(container, {
    chart: { type: 'sankey', backgroundColor: 'transparent', style: { fontFamily: fontSpec }, height: 350 },
    title: { text: '' }, credits: { enabled: false },
    tooltip: {
        useHTML: true, backgroundColor: "rgba(15, 23, 42, 0.98)", borderRadius: 8, borderWidth: 0, shadow: false, padding: 0,
        formatter: function() {
            if (this.point.isNode) {
                var c = this.point.custom;
                if (!c) return `<b>${this.point.name}</b>`;
                return `<div style="padding:10px; color:#fff; font-family:${fontSpec}; min-width:120px;">
                          <div style="font-size:12px; font-weight:600; color:${this.point.color}">${this.point.name}</div>
                          <div style="font-size:16px; font-weight:700; margin-top:4px;">${c.text}</div>
                        </div>`;
            }
            // Link
            var val = this.point.weight;
            var pct = (val / MODEL_BASE * 100).toFixed(1) + "%";
            return `<div style="padding:8px; color:#fff; font-family:${fontSpec}">
                      <span style="opacity:0.7">${this.point.fromNode.name} → ${this.point.toNode.name}</span><br/>
                      <b>${Math.round(val).toLocaleString()} ₽ (${pct})</b>
                    </div>`;
        }
    },
    plotOptions: {
        sankey: {
            nodePadding: 15,
            dataLabels: {
                enabled: true, useHTML: true,
                style: { color: '#0f172a', fontSize: '10px', fontWeight: '600', textOutline: 'none', fontFamily: fontSpec },
                formatter: function() {
                    if (!this.point.isNode) return "";
                    if (this.point.sum < 1000) return "";
                    return `<div style="text-align:center; line-height:1">${this.point.name}<br/><span style="opacity:0.6; font-size:9px">${Math.round(this.point.sum/1000)}k</span></div>`;
                }
            }
        }
    },
    series: [{ nodes: nodes, data: links }]
  });
}

/**
 * PAYMENTS DASHBOARD v6.1 (Cashbox Deep Dive)
 * 1. Grid: 1/3 (Payers) vs 2/3 (Cashbox Detail).
 * 2. Visuals: Micro-Flow Bars for every cashbox to show payment mix.
 * 3. Palette: Added Green (#10b981) for Cash to distinguish from Wire/Card.
 */
function renderPaymentsDashboard() {
  var dashboard = document.querySelector('[data-dashboard="payments"]');
  if (!dashboard) return;

  var fontSpec = "Inter, system-ui, sans-serif";

  // 1. Проверка данных
  if (!preparedDataRows || preparedDataRows.length === 0) return;
  var filteredRows = applyFilters(preparedDataRows, appState.filters);
  var periodRows = filterRowsByPeriod(filteredRows, appState.periodA);
  
  if (!periodRows || periodRows.length === 0) {
    renderEmptyState(dashboard, { title: "Нет данных об оплатах за период" });
    return;
  }

  // --- РАСШИРЕННАЯ ПАЛИТРА ---
  const PALETTE = {
      card:    "#0ABAB5", // Тиффани (Карта)
      wire:    "#8B5CF6", // Фиолетовый (Безнал)
      cash:    "#10b981", // Зеленый (Наличные - Живые деньги)
      advance: "#F97316", // Оранжевый (Аванс)
      other:   "#94A3B8", // Серый
      kpi:     "#0ABAB5"
  };

  // Контекст времени
  var pYear = appState.periodA.year;
  var pMonth = appState.periodA.monthFrom;
  var monthName = new Date(pYear, pMonth - 1).toLocaleString('ru', { month: 'long' });
  var periodLabel = `${monthName} ${pYear}`;
  if (appState.periodA.mode !== 'month') periodLabel = `${pYear} год (сводный)`;

  // 2. Агрегация
  var totalRevenue = 0; 
  var totalRealCash = 0; 
  var totalAdvance = 0;  
  var totalComm = 0;
  var txCount = 0;

  // Общая статистика
  var stats = {
    card:    { label: "Карта",   rev: 0, comm: 0, count: 0, isCash: true,  color: PALETTE.card },
    wire:    { label: "Безнал",  rev: 0, comm: 0, count: 0, isCash: true,  color: PALETTE.wire },
    cash:    { label: "Наличные",rev: 0, comm: 0, count: 0, isCash: true,  color: PALETTE.cash },
    advance: { label: "Аванс",   rev: 0, comm: 0, count: 0, isCash: false, color: PALETTE.advance },
    other:   { label: "Прочее",  rev: 0, comm: 0, count: 0, isCash: true,  color: PALETTE.other }
  };

  var daysMap = {};
  var daysInMonth = new Date(pYear, pMonth, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) daysMap[i] = { cash: 0, advance: 0 };

  var byPatient = {};
  var byCashbox = {};

  periodRows.forEach(function(row) {
    var rev = row.amountPaid || 0;
    var comm = row.commission39 || 0;
    var rawMethod = (row.paymentMethod || "").toLowerCase();

    // Определение типа (Более точное)
    var key = "other";
    if (rawMethod.includes("аванс") || rawMethod.includes("advance") || rawMethod.includes("депозит")) key = "advance";
    else if (rawMethod.includes("карт") || rawMethod.includes("card") || rawMethod.includes("эквайринг")) key = "card";
    else if (rawMethod.includes("безнал") || rawMethod.includes("wire") || rawMethod.includes("счет")) key = "wire";
    else if (rawMethod.includes("нал") || rawMethod.includes("cash") || rawMethod.includes("касса")) key = "cash";

    // Глобальные счетчики
    stats[key].rev += rev;
    stats[key].comm += comm;
    stats[key].count++;
    
    totalRevenue += rev;
    totalComm += comm;
    txCount++;

    if (stats[key].isCash) totalRealCash += rev; else totalAdvance += rev;

    // Дни
    var day = 0;
    if (row.serviceDate) day = row.serviceDate.getDate();
    if (day >= 1 && day <= daysInMonth) {
        if (stats[key].isCash) daysMap[day].cash += rev; else daysMap[day].advance += rev;
    }

    // Пациенты
    var pName = row.patientName || "Неизвестный";
    if (!byPatient[pName]) byPatient[pName] = 0;
    byPatient[pName] += rev;

    // Кассы (Детализация)
    var boxName = row.cashbox || (row.raw && row.raw.cashbox) || "Основная касса";
    boxName = boxName.split('(')[0].trim(); // Упрощение имени
    
    if (!byCashbox[boxName]) {
        byCashbox[boxName] = { rev: 0, count: 0, mix: { card:0, wire:0, cash:0, advance:0, other:0 } };
    }
    byCashbox[boxName].rev += rev;
    byCashbox[boxName].count++;
    byCashbox[boxName].mix[key] += rev;
  });

  // Сортировка
  var topPatients = Object.entries(byPatient)
      .map(([name, val]) => ({ name, val }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 10);

  var cashboxList = Object.entries(byCashbox)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.rev - a.rev);

  var advanceShare = totalRevenue > 0 ? (totalAdvance / totalRevenue * 100) : 0;

  // --- 3. HTML Layout ---
  dashboard.innerHTML = `
    <!-- ROW 1: KPI GRID -->
    <div class="kpi-grid" style="margin-bottom: 24px;">
      <article class="card kpi-card">
        <header class="kpi-card__header"><h3 class="kpi-card__title">Живой приток (Cash In)</h3><p class="kpi-card__subtitle">Карты + Наличные + Безнал</p></header>
        <div class="kpi-card__body"><div class="kpi-card__value" style="color:${PALETTE.kpi}">${formatCurrency(totalRealCash)}</div></div>
      </article>

      <article class="card kpi-card">
        <header class="kpi-card__header"><h3 class="kpi-card__title">Расход авансов</h3><p class="kpi-card__subtitle">В счет депозитов</p></header>
        <div class="kpi-card__body">
            <div class="kpi-card__value" style="color:${PALETTE.advance}">${formatCurrency(totalAdvance)}</div>
            <div class="kpi-card__delta muted">Доля: ${advanceShare.toFixed(1)}%</div>
        </div>
      </article>

      <article class="card kpi-card">
        <header class="kpi-card__header"><h3 class="kpi-card__title">Комиссия банков</h3><p class="kpi-card__subtitle">Эквайринг</p></header>
        <div class="kpi-card__body"><div class="kpi-card__value" style="color:#ef4444">${formatCurrency(totalComm)}</div></div>
      </article>

      <article class="card kpi-card">
        <header class="kpi-card__header"><h3 class="kpi-card__title">Всего выручка</h3><p class="kpi-card__subtitle">Сумма по актам</p></header>
        <div class="kpi-card__body"><div class="kpi-card__value">${formatCurrency(totalRevenue)}</div></div>
      </article>
    </div>

    <!-- ROW 2: BIG FLOW BAR -->
    <article class="card" style="margin-bottom: 24px; padding: 20px;">
        <header class="card__header" style="margin-bottom: 16px;">
            <h3 class="card__title">Структура денежной массы</h3>
            <p class="card__subtitle">Соотношение источников поступления средств</p>
        </header>
        <div class="chart-wrapper" style="height: 60px;">
            <canvas id="payment-flow-bar"></canvas>
        </div>
    </article>

    <!-- ROW 3: DYNAMICS -->
    <article class="card card--chart" style="margin-bottom: 24px;">
        <header class="card__header">
            <div>
                <h2 class="card__title">Динамика: ${periodLabel}</h2>
                <p class="card__subtitle">
                    Ежедневный анализ ликвидности. 
                    <span style="color:${PALETTE.card}">● Cash</span> vs <span style="color:${PALETTE.advance}">● Авансы</span>
                </p>
            </div>
        </header>
        <div class="card__body" style="padding: 10px 20px 20px 20px;">
            <div class="chart-wrapper" style="height: 300px;"><canvas id="payment-daily-chart"></canvas></div>
        </div>
    </article>

    <!-- ROW 4: EFFICIENCY TABLE -->
    <article class="card card--table" style="margin-bottom: 24px;">
        <header class="card__header">
            <h3 class="card__title">Эффективность каналов продаж</h3>
            <span class="help-icon" data-tooltip="Анализ качества выручки.">?</span>
        </header>
        <div class="card__body">
            <div class="placeholder-table">
                <table>
                    <thead>
                        <tr>
                            <th>Метод оплаты</th>
                            <th class="align-right">Транзакций</th>
                            <th class="align-right">Оборот (Gross)</th>
                            <th class="align-right" style="width: 20%">Доля выручки</th>
                            <th class="align-right" style="width: 20%">Средний чек</th>
                            <th class="align-right muted">Комиссия</th>
                        </tr>
                    </thead>
                    <tbody id="pay-efficiency-body"></tbody>
                </table>
            </div>
        </div>
    </article>

    <!-- ROW 5: SPLIT GRID (1fr : 2fr) -->
    <div class="dashboard-split" style="grid-template-columns: 1fr 2fr; gap: 24px;">
        
        <!-- LEFT: Top Payers -->
        <article class="card card--table">
            <header class="card__header"><h3 class="card__title">Топ-10 Плательщиков</h3></header>
            <div class="card__body">
                <div class="placeholder-table">
                    <table style="font-size: 11px;">
                        <thead><tr><th>Пациент</th><th class="align-right">Сумма</th></tr></thead>
                        <tbody>
                            ${topPatients.map((p, i) => `
                                <tr>
                                    <td style="font-family:${fontSpec}; color:#0f172a; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${p.name}">
                                        ${i+1}. ${p.name}
                                    </td>
                                    <td class="align-right" style="font-family:${fontSpec}; font-weight:600; color:${PALETTE.kpi}">${formatShortCurrency(p.val)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </article>

        <!-- RIGHT: Cashbox Detail (Detailed) -->
        <article class="card card--table">
            <header class="card__header">
                <div>
                    <h3 class="card__title">Нагрузка на кассы</h3>
                    <div style="font-size:10px; color:#64748b; margin-top:4px;">
                        <span style="color:${PALETTE.card}">● Карта</span> &nbsp;
                        <span style="color:${PALETTE.cash}">● Нал</span> &nbsp;
                        <span style="color:${PALETTE.wire}">● Безнал</span> &nbsp;
                        <span style="color:${PALETTE.advance}">● Аванс</span>
                    </div>
                </div>
            </header>
            <div class="card__body">
                <div class="placeholder-table">
                    <table style="font-size: 13px;">
                        <thead><tr><th>Касса</th><th class="align-right">Оборот</th></tr></thead>
                        <tbody>
                            ${cashboxList.map(box => {
                                // Расчет ширины сегментов для микро-бара
                                var totalBox = box.rev;
                                var pCard = (box.mix.card / totalBox) * 100;
                                var pCash = (box.mix.cash / totalBox) * 100;
                                var pWire = (box.mix.wire / totalBox) * 100;
                                var pAdv  = (box.mix.advance / totalBox) * 100;
                                var pOth  = (box.mix.other / totalBox) * 100;

                                return `
                                <tr>
                                    <td style="font-family:${fontSpec}; color:#0f172a; padding: 12px 8px; vertical-align: middle;">
                                        <div style="font-weight: 500; font-size: 14px;">${box.name}</div>
                                        <!-- Micro Flow Bar -->
                                        <div style="display:flex; height:6px; width:100%; max-width:200px; background:#f1f5f9; border-radius:3px; overflow:hidden; margin-top:6px;">
                                            ${pCard > 0 ? `<div style="width:${pCard}%; background:${PALETTE.card}" title="Карта: ${formatShortCurrency(box.mix.card)}"></div>` : ''}
                                            ${pCash > 0 ? `<div style="width:${pCash}%; background:${PALETTE.cash}" title="Нал: ${formatShortCurrency(box.mix.cash)}"></div>` : ''}
                                            ${pWire > 0 ? `<div style="width:${pWire}%; background:${PALETTE.wire}" title="Безнал: ${formatShortCurrency(box.mix.wire)}"></div>` : ''}
                                            ${pAdv  > 0 ? `<div style="width:${pAdv}%;  background:${PALETTE.advance}" title="Аванс: ${formatShortCurrency(box.mix.advance)}"></div>` : ''}
                                            ${pOth  > 0 ? `<div style="width:${pOth}%;  background:${PALETTE.other}" title="Прочее"></div>` : ''}
                                        </div>
                                    </td>
                                    <td class="align-right" style="font-family:${fontSpec}; padding: 12px 8px; vertical-align: middle;">
                                        <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${formatCurrency(box.rev)}</div>
                                        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${box.count} транз.</div>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </article>
    </div>
  `;

  // 4. Заполнение Эффективной Таблицы
  var tbody = document.getElementById("pay-efficiency-body");
  var maxAvg = 0;
  var methodKeys = ["card", "cash", "wire", "advance", "other"];
  methodKeys.forEach(k => { if (stats[k].count > 0) maxAvg = Math.max(maxAvg, stats[k].rev / stats[k].count); });

  methodKeys.forEach(key => {
      var d = stats[key];
      if (d.rev === 0) return;
      var share = (d.rev / totalRevenue * 100);
      var avgCheck = d.rev / d.count;
      var barShare = `width:${share}%; background:${d.color};`;
      var barCheck = `width:${(avgCheck/maxAvg)*100}%; background:${d.color}; opacity:0.5;`;

      var tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight:500; font-family:${fontSpec}; color:#0f172a;">
            <span style="color:${d.color}; margin-right:8px; font-size:14px;">●</span>${d.label}
        </td>
        <td class="align-right" style="font-family:${fontSpec};">${d.count}</td>
        <td class="align-right" style="font-family:${fontSpec}; font-weight:600;">${formatCurrency(d.rev)}</td>
        <td class="align-right">
            <div style="display:flex; align-items:center; justify-content:flex-end;">
                <span style="font-family:${fontSpec}; font-size:11px; margin-right:8px;">${share.toFixed(1)}%</span>
                <div style="width:50px; height:4px; background:#e2e8f0; border-radius:2px;"><div style="${barShare} height:100%; border-radius:2px;"></div></div>
            </div>
        </td>
        <td class="align-right">
            <div style="display:flex; align-items:center; justify-content:flex-end;">
                <span style="font-family:${fontSpec}; font-size:11px; margin-right:8px;">${formatCurrency(avgCheck)}</span>
                <div style="width:50px; height:4px; background:#e2e8f0; border-radius:2px;"><div style="${barCheck} height:100%; border-radius:2px;"></div></div>
            </div>
        </td>
        <td class="align-right muted" style="font-family:${fontSpec};">${formatCurrency(d.comm)}</td>
      `;
      tbody.appendChild(tr);
  });

  // 5. BIG FLOW BAR
  var ctxFlow = document.getElementById("payment-flow-bar").getContext("2d");
  var flowDatasets = [];
  var activeFlows = methodKeys.filter(k => stats[k].rev > 0);
  
  activeFlows.forEach((k, idx) => {
      var isFirst = idx === 0;
      var isLast = idx === activeFlows.length - 1;
      flowDatasets.push({
          label: stats[k].label,
          data: [stats[k].rev],
          backgroundColor: PALETTE[k],
          borderWidth: 0,
          barPercentage: 1.0, categoryPercentage: 1.0,
          borderRadius: { topLeft: isFirst?50:0, bottomLeft: isFirst?50:0, topRight: isLast?50:0, bottomRight: isLast?50:0 },
          borderSkipped: false
      });
  });

  new Chart(ctxFlow, {
      type: 'bar',
      data: { labels: ["Структура"], datasets: flowDatasets },
      options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: {
              legend: { display: false },
              tooltip: { enabled: true, backgroundColor: 'rgba(15,23,42,0.95)', titleFont: { size: 0 }, bodyFont: { family: fontSpec, size: 12 }, padding: 8,
                  callbacks: { label: c => `${c.dataset.label.split('(')[0]}: ${formatShortCurrency(c.raw)} (${(c.raw/totalRevenue*100).toFixed(1)}%)` } },
              datalabels: {
                  display: ctx => (ctx.dataset.data[0] / totalRevenue) > 0.05,
                  color: "#fff", font: { weight: 'bold', size: 12, family: fontSpec },
                  formatter: (v, ctx) => { var name = ctx.dataset.label.split(' ')[0]; return (v/totalRevenue) < 0.10 ? Math.round(v/totalRevenue*100)+"%" : `${name} ${Math.round(v/totalRevenue*100)}%`; }
              }
          },
          scales: { x: { display: false, stacked: true }, y: { display: false, stacked: true } }
      },
      plugins: [ChartDataLabels]
  });

  // 6. График Динамики
  var ctxDaily = document.getElementById("payment-daily-chart").getContext("2d");
  var labelsDaily = Object.keys(daysMap);
  var gCash = createChartGradient(ctxDaily, PALETTE.card, "#2dd4bf"); 
  var gAdv  = createChartGradient(ctxDaily, PALETTE.advance, "#fb923c");

  new Chart(ctxDaily, {
      type: 'bar',
      data: {
          labels: labelsDaily,
          datasets: [
              { label: 'Живые деньги', data: labelsDaily.map(d=>daysMap[d].cash), backgroundColor: gCash, borderRadius: 2, stack: '0' },
              { label: 'Аванс', data: labelsDaily.map(d=>daysMap[d].advance), backgroundColor: gAdv, borderRadius: 2, stack: '0' }
          ]
      },
      options: {
          responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { 
              legend: { position:'top', align:'end', labels: { usePointStyle:true, boxWidth:8, font:{family:fontSpec} } }, 
              tooltip: { backgroundColor:'rgba(15,23,42,0.95)', callbacks:{label:c=>formatCurrency(c.raw)} } 
          },
          scales: {
              x: { grid: { display: false }, stacked: true, ticks: { font: { family: fontSpec, size: 11 } } },
              y: { grid: { color: "rgba(148,163,184,0.1)" }, stacked: true, ticks: { callback: v => formatShortCurrency(v), font: { family: fontSpec, size: 11 }, color: "#64748b" } }
          }
      }
  });
}

/**
 * Открытие модалки с большой матрицей врачей.
 * FIX: Теперь используем отдельное модальное окно и отдельный ID канваса.
 */
function openDoctorsScatterModal(metrics) {
  // 1. Ищем правильную модалку (для врачей)
  var modal = document.getElementById("doctors-scatter-modal");
  
  if (!modal) {
    console.error("Critical Error: Modal #doctors-scatter-modal not found in DOM");
    return;
  }

  // 2. Открываем её
  modal.classList.add("modal--open");
  modal.setAttribute("aria-hidden", "false");

  // 3. Рисуем график с небольшой задержкой (чтобы CSS-транзишн не ломал размеры канваса)
  setTimeout(function() {
    // Передаем metrics и ID канваса, который находится внутри ЭТОЙ модалки
    renderDoctorsScatter(metrics, "doctors-scatter-chart-modal");
  }, 100);
}