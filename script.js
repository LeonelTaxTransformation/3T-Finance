
const data = window.DASHBOARD_DATA;
const state = {
  selected: new Set(["__ALL__"]),
  chart: null,
  modalEntity: null,
  modalYear: null,
  axisMode: 'intermediario',
  chartYear: null,
  detailEntity: '__ALL__',
  detailYear: null,
  detailShowSaldo: true,
  detailShowJuros: true,
  detailShowSaldoMenosJuros: false,
  detailShowContaCorrente: false,
  detailShowDescricaoDetalhada: false,
};

const companyMap = Object.fromEntries(data.companies.map(c => [c.id, c]));


function formatTooltipDate(value) {
  const v = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const year = v.slice(0, 4);
  const month = v.slice(5, 7);
  const monthMap = {
    '01': 'Janeiro',
    '02': 'Fevereiro',
    '03': 'Março',
    '04': 'Abril',
    '05': 'Maio',
    '06': 'Junho',
    '07': 'Julho',
    '08': 'Agosto',
    '09': 'Setembro',
    '10': 'Outubro',
    '11': 'Novembro',
    '12': 'Dezembro'
  };
  return `${monthMap[month] || month}/${year}`;
}

function formatBRL(value) {
  return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNegativeBRL(value) {
  return `-${formatBRL(Math.abs(Number(value) || 0))}`;
}

function activeEntities() {
  if (state.selected.has("__ALL__")) {
    return data.companies.filter(c => c.id !== "__ALL__").map(c => c.id);
  }
  return Array.from(state.selected);
}

function selectedRows() {
  const entities = new Set(activeEntities());
  return data.rows.filter(item => entities.has(item.empresa));
}

function buildFilters() {
  const wrap = document.getElementById('companyFilters');
  wrap.innerHTML = '';

  data.companies.forEach(company => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip';
    chip.dataset.company = company.id;
    chip.style.setProperty('--chip-color', company.color);
    chip.innerHTML = `
      <span class="filter-box" aria-hidden="true"></span>
      <span>${company.label}</span>
    `;
    chip.addEventListener('click', () => toggleCompany(company.id));
    wrap.appendChild(chip);
  });

  paintFilters();
}

function toggleCompany(id) {
  if (id === "__ALL__") {
    state.selected = new Set(["__ALL__"]);
  } else {
    if (state.selected.has("__ALL__")) state.selected.delete("__ALL__");
    if (state.selected.has(id)) {
      state.selected.delete(id);
    } else {
      state.selected.add(id);
    }
    if (state.selected.size === 0) {
      state.selected = new Set(["__ALL__"]);
    }
  }
  paintFilters();
  updateKPIs();
  updateChart();
  updateDetails();
}

function paintFilters() {
  document.querySelectorAll('#companyFilters .filter-chip').forEach(chip => {
    const id = chip.dataset.company;
    const active = state.selected.has(id);
    chip.classList.toggle('active', active);
    chip.classList.toggle('inactive', !active);
    chip.style.color = active ? companyMap[id].color : '#b7c1cf';
    const box = chip.querySelector('.filter-box');
    if (active) {
      box.innerHTML = '✓';
      box.style.background = companyMap[id].color;
      box.style.borderColor = companyMap[id].color;
      box.style.color = '#08111b';
      box.style.fontWeight = '900';
      box.style.fontSize = '19px';
      box.style.lineHeight = '1';
      box.style.textAlign = 'center';
    } else {
      box.innerHTML = '';
      box.style.background = 'rgba(7,12,22,.98)';
      box.style.borderColor = 'rgba(160,178,205,.55)';
      box.style.color = 'transparent';
    }
  });
}


function availableChartYears() {
  return [...new Set(data.detail_rows.map(item => Number(item.ano)).filter(Boolean))].sort((a, b) => a - b);
}

function normalizeChartYear() {
  if (state.chartYear === null) return;
  const years = availableChartYears();
  if (!years.includes(Number(state.chartYear))) {
    state.chartYear = null;
  }
}

function buildChartYearChips() {
  const wrap = document.getElementById('chartYearChipRow');
  if (!wrap) return;

  normalizeChartYear();
  wrap.innerHTML = '';

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = `year-chip chart-year-chip chart-year-chip-all ${state.chartYear === null ? 'active' : ''}`;
  allChip.textContent = 'Todos os períodos';
  allChip.addEventListener('click', () => {
    state.chartYear = null;
    buildChartYearChips();
    updateKPIs();
    updateChart();
  });
  wrap.appendChild(allChip);

  availableChartYears().forEach(year => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `year-chip chart-year-chip ${Number(state.chartYear) === Number(year) ? 'active' : ''}`;
    chip.textContent = year;
    chip.addEventListener('click', () => {
      state.chartYear = year;
      buildChartYearChips();
      updateKPIs();
      updateChart();
    });
    wrap.appendChild(chip);
  });
}

function chartFilterRows() {
  const entities = new Set(activeEntities());
  return data.detail_rows.filter(item => {
    if (!entities.has(item.empresa)) return false;
    if (state.chartYear !== null && Number(item.ano) !== Number(state.chartYear)) return false;
    return true;
  });
}

function aggregateChartMonthTotals(rows) {
  const totals = new Map();
  rows.forEach(row => {
    const key = normalizeDetailMonthToStart(row.data);
    if (!/^\d{4}-\d{2}-01$/.test(key)) return;
    totals.set(key, (totals.get(key) || 0) + Math.abs(Number(row.valor) || 0));
  });
  return totals;
}

function buildChartLabels(rows) {
  if (state.chartYear !== null) {
    const year = Number(state.chartYear);
    return Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, '0');
      return `${year}-${month}-01`;
    });
  }

  const valid = rows
    .map(row => normalizeDetailMonthToStart(row.data))
    .filter(value => /^\d{4}-\d{2}-01$/.test(value))
    .sort();

  if (!valid.length) return [];

  const start = new Date(valid[0].slice(0, 7) + '-01T00:00:00');
  const end = new Date(valid[valid.length - 1].slice(0, 7) + '-01T00:00:00');

  const labels = [];
  const current = new Date(start);
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    labels.push(`${y}-${m}-01`);
    current.setMonth(current.getMonth() + 1);
  }
  return labels;
}

function chartVariationValue(rows) {
  const totals = aggregateChartMonthTotals(rows);
  const labels = [...totals.keys()].sort();
  if (!labels.length) return 0;
  const first = -(totals.get(labels[0]) || 0);
  const last = -(totals.get(labels[labels.length - 1]) || 0);
  return last - first;
}

function axisLabelMeta(value, index, labels, mode) {
  const text = formatAxisLabel(value, index, labels, mode);
  return {
    text,
    isYear: /^\d{4}$/.test(text),
    isMonth: Boolean(text) && !/^\d{4}$/.test(text)
  };
}

function aggregateRows(rows) {
  const saldoFinal = rows.reduce((acc, row) => acc + (row.saldo_final || 0), 0);
  const saldoInicial = rows.reduce((acc, row) => acc + (row.saldo_inicial || 0), 0);
  return { saldoFinal, saldoInicial, variacao: saldoFinal - saldoInicial };
}


function updateKPIs() {
  const rows = chartFilterRows();
  const totalJuros = rows.reduce((acc, row) => acc + Math.abs(Number(row.valor) || 0), 0);

  const totalText = totalJuros > 0 ? formatNegativeBRL(totalJuros) : formatBRL(0);

  const saldoFinalEl = document.getElementById('saldoFinalValue');
  if (saldoFinalEl) saldoFinalEl.textContent = totalText;

  const entityCount = state.selected.has("__ALL__") ? data.companies.length - 1 : state.selected.size;
  const periodLabel = state.chartYear === null ? 'Todos os períodos' : String(state.chartYear);
  const saldoFinalSubEl = document.getElementById('saldoFinalSub');
  if (saldoFinalSubEl) saldoFinalSubEl.textContent = `${rows.length} lançamentos · ${entityCount} empresas · ${periodLabel}`;
}

function sortedPeriods(rows) {
  const labels = [...new Set(rows.map(r => r.data_final).filter(Boolean))].sort();
  return labels;
}


function monthRangeLabels(rows) {
  const valid = rows
    .map(r => String(r.data_final || ''))
    .filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v))
    .sort();
  if (!valid.length) return [];

  const start = new Date(valid[0].slice(0, 7) + '-01T00:00:00');
  const end = new Date(valid[valid.length - 1].slice(0, 7) + '-01T00:00:00');

  const labels = [];
  const current = new Date(start);
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    labels.push(`${y}-${m}-01`);
    current.setMonth(current.getMonth() + 1);
  }
  return labels;
}

function normalizeToMonthStart(value) {
  const v = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.slice(0, 7) + '-01';
  return v;
}

function normalizeDetailMonthToStart(value) {
  const v = String(value || '');
  if (/^\d{2}\/\d{4}$/.test(v)) {
    const month = v.slice(0, 2);
    const year = v.slice(3, 7);
    return `${year}-${month}-01`;
  }
  return normalizeToMonthStart(v);
}


function buildDatasets() {
  const rows = chartFilterRows();
  const labels = buildChartLabels(rows);

  if (state.selected.has("__ALL__")) {
    const vals = labels.map(label =>
      rows
        .filter(r => normalizeDetailMonthToStart(r.data) === label)
        .reduce((acc, item) => acc + Math.abs(Number(item.valor) || 0), 0)
    );
    return {
      labels,
      datasets: [{
        label: 'Todas as empresas',
        data: vals,
        borderColor: '#E5E7EB',
        backgroundColor: '#E5E7EB',
        pointRadius: 3,
        pointHoverRadius: 4,
        borderWidth: 2.5,
        tension: 0.25
      }]
    };
  }

  const entitiesList = activeEntities();
  const detailRowsByEntity = Object.fromEntries(entitiesList.map(entity => [entity, rows.filter(r => r.empresa === entity)]));

  const datasets = entitiesList.map(entity => {
    const vals = labels.map(label =>
      detailRowsByEntity[entity]
        .filter(r => normalizeDetailMonthToStart(r.data) === label)
        .reduce((acc, item) => acc + Math.abs(Number(item.valor) || 0), 0)
    );
    return {
      label: entity,
      data: vals,
      borderColor: companyMap[entity].color,
      backgroundColor: companyMap[entity].color,
      pointRadius: 3,
      pointHoverRadius: 4,
      borderWidth: 2.5,
      tension: 0.25
    };
  });
  return { labels, datasets };
}


function formatAxisLabel(value, index, labels, mode) {
  if (!value) return '';
  const valueStr = String(value);
  const year = valueStr.slice(0, 4);
  const month = valueStr.slice(5, 7);
  const prev = index > 0 ? String(labels[index - 1]) : '';
  const prevYear = prev.slice(0, 4);

  if (mode === 'ano') {
    return year !== prevYear ? year : '';
  }

  const monthName = {
    '04': 'ABR',
    '07': 'JUL',
    '10': 'OUT'
  }[month];

  if (year !== prevYear) return year;
  return monthName || '';
}


function applyAxisMode() {
  if (!state.chart) return;
  const labels = state.chart.data.labels || [];
  state.chart.options.scales.x.ticks.callback = function(value, index) {
    const raw = labels[index];
    return axisLabelMeta(raw, index, labels, state.axisMode).text;
  };
  state.chart.options.scales.x.ticks.autoSkip = false;
  state.chart.options.scales.x.ticks.maxTicksLimit = labels.length;
  state.chart.update();
}


function buildChart() {
  const ctx = document.getElementById('lineChart').getContext('2d');
  const built = buildDatasets();
  state.chart = new Chart(ctx, {
    type: 'line',
    data: built,
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0d1526',
          borderColor: 'rgba(66, 92, 128, .30)',
          borderWidth: 1,
          padding: 10,
          titleColor: '#ffffff',
          bodyColor: '#dce6f7',
          callbacks: {
            title: (items) => {
              const raw = items && items.length ? items[0].label : '';
              return formatTooltipDate(raw);
            },
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y ? formatNegativeBRL(ctx.parsed.y) : formatBRL(0)}`
          }
        }
      },
      scales: {
        x: {
          offset: true,
          ticks: {
            color: (ctx) => {
              const raw = ctx.chart.data.labels[ctx.index];
              const meta = axisLabelMeta(raw, ctx.index, ctx.chart.data.labels, state.axisMode);
              return meta.isYear ? '#cfdaf0' : '#8ea0bc';
            },
            font: (ctx) => {
              const raw = ctx.chart.data.labels[ctx.index];
              const meta = axisLabelMeta(raw, ctx.index, ctx.chart.data.labels, state.axisMode);
              return { size: 12, weight: meta.isYear ? '800' : '700' };
            },
            autoSkip: false,
            maxTicksLimit: 24,
            maxRotation: 0,
            padding: 12,
            callback: function(value, index) {
              const raw = this.chart.data.labels[index];
              return axisLabelMeta(raw, index, this.chart.data.labels, state.axisMode).text;
            }
          },
          grid: {
            color: 'rgba(66, 92, 128, .12)',
            lineWidth: 1,
            drawTicks: true
          }
        },
        y: {
          ticks: {
            color: (ctx) => {
              const v = Number(ctx.tick?.value || 0);
              return v > 0 ? '#ef4444' : '#7f8faa';
            },
            callback: (value) => Number(value) === 0 ? formatBRL(0) : formatNegativeBRL(value)
          },
          beginAtZero: true,
          grid: { color: 'rgba(66, 92, 128, .12)' }
        }
      }
    }
  });
  updateLegend(built.datasets);
  applyAxisMode();
}

function updateChart() {
  const built = buildDatasets();
  state.chart.data.labels = built.labels;
  state.chart.data.datasets = built.datasets;
  state.chart.update();
  updateLegend(built.datasets);
  applyAxisMode();
}

function updateLegend(datasets) {
  const legend = document.getElementById('customLegend');
  legend.innerHTML = '';
  datasets.forEach(ds => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="background:${ds.borderColor}"></span><span>${ds.label}</span>`;
    legend.appendChild(item);
  });
}

function detailEntities() {
  if (state.selected.has("__ALL__")) {
    return ["Todas as empresas", ...data.companies.filter(c => c.id !== "__ALL__").map(c => c.id)];
  }
  return activeEntities();
}

function updateDetails() {
  const wrap = document.getElementById('detailsList');
  wrap.innerHTML = '';
  detailEntities().forEach(entity => {
    const row = document.createElement('div');
    row.className = 'company-summary-row';
    row.innerHTML = `
      <div class="company-summary-name">${entity}</div>
      <button class="detail-button" data-entity="${entity}">Detalhes</button>
    `;
    row.querySelector('.detail-button').addEventListener('click', () => openDetailModal(entity));
    wrap.appendChild(row);
  });
}


function detailEntityOptions() {
  return activeEntities();
}

function normalizeDetailEntity() {
  const options = detailEntityOptions();
  if (!options.length) {
    state.detailEntity = '__ALL__';
    return;
  }

  if (!state.selected.has('__ALL__') && options.length === 1) {
    state.detailEntity = options[0];
    return;
  }

  if (state.detailEntity !== '__ALL__' && !options.includes(state.detailEntity)) {
    state.detailEntity = '__ALL__';
  }
}

function detailEntitiesForView() {
  const options = detailEntityOptions();
  if (state.detailEntity === '__ALL__') return options;
  return options.includes(state.detailEntity) ? [state.detailEntity] : [];
}

function detailBalanceRows() {
  const entities = new Set(detailEntitiesForView());
  return (data.detail_balances || []).filter(item => entities.has(item.empresa));
}

function detailLaunchRows() {
  const entities = new Set(detailEntitiesForView());
  return (data.detail_rows || []).filter(item => entities.has(item.empresa));
}

function availableDetailYears() {
  const years = new Set();

  detailBalanceRows().forEach(item => {
    if (item.ano) years.add(Number(item.ano));
  });

  detailLaunchRows().forEach(item => {
    if (item.ano) years.add(Number(item.ano));
  });

  return [...years].sort((a, b) => a - b);
}

function normalizeDetailYear() {
  const years = availableDetailYears();
  if (!years.length) {
    state.detailYear = null;
    return;
  }
  if (!years.includes(state.detailYear)) {
    state.detailYear = years[0];
  }
}

function periodSortKey(period, year) {
  const value = String(period || '');
  const match = value.match(/^(\d{2})\/(\d{4})$/);
  if (match) return `${match[2]}-${match[1]}`;
  if (year) return `${year}-${value}`;
  return value;
}

function daySortValue(day) {
  const value = String(day || '');
  const match = value.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return 99;
  return Number(match[1]);
}

function createDetailCompanyChip(id, label, color) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'filter-chip detail-filter-chip';
  chip.dataset.company = id;
  chip.style.setProperty('--chip-color', color);
  chip.innerHTML = `
    <span class="filter-box" aria-hidden="true"></span>
    <span>${label}</span>
  `;
  chip.addEventListener('click', () => {
    state.detailEntity = id;
    normalizeDetailYear();
    updateDetails();
  });
  return chip;
}

function buildDetailCompanyFilters() {
  const wrap = document.getElementById('detailCompanyFilters');
  if (!wrap) return;

  wrap.innerHTML = '';
  wrap.appendChild(createDetailCompanyChip('__ALL__', 'Todas as empresas', companyMap['__ALL__'].color));

  detailEntityOptions().forEach(id => {
    const company = companyMap[id];
    if (!company) return;
    wrap.appendChild(createDetailCompanyChip(id, company.label, company.color));
  });

  paintDetailCompanyFilters();
}

function paintDetailCompanyFilters() {
  document.querySelectorAll('#detailCompanyFilters .detail-filter-chip').forEach(chip => {
    const id = chip.dataset.company;
    const active = state.detailEntity === id;
    const company = companyMap[id];
    chip.classList.toggle('active', active);
    chip.classList.toggle('inactive', !active);
    chip.style.color = active ? company.color : '#b7c1cf';
    const box = chip.querySelector('.filter-box');

    if (active) {
      box.innerHTML = '✓';
      box.style.background = company.color;
      box.style.borderColor = company.color;
      box.style.color = '#08111b';
      box.style.fontWeight = '900';
      box.style.fontSize = '19px';
      box.style.lineHeight = '1';
      box.style.textAlign = 'center';
    } else {
      box.innerHTML = '';
      box.style.background = 'rgba(7,12,22,.98)';
      box.style.borderColor = 'rgba(160,178,205,.55)';
      box.style.color = 'transparent';
    }
  });
}

function buildDetailYearChips() {
  const wrap = document.getElementById('detailYearChipRow');
  if (!wrap) return;

  const years = availableDetailYears();
  wrap.innerHTML = '';

  years.forEach(year => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `year-chip ${year === state.detailYear ? 'active' : ''}`;
    chip.textContent = year;
    chip.addEventListener('click', () => {
      state.detailYear = year;
      updateDetails();
    });
    wrap.appendChild(chip);
  });
}

function aggregateDetailByPeriod() {
  const monthlyMap = new Map();

  detailBalanceRows()
    .filter(item => !state.detailYear || item.ano === state.detailYear)
    .forEach(item => {
      const periodo = item.data || '-';
      if (!monthlyMap.has(periodo)) {
        monthlyMap.set(periodo, {
          periodo,
          ano: item.ano,
          sortKey: periodSortKey(periodo, item.ano),
          saldo: 0,
          juros: 0,
        });
      }
      monthlyMap.get(periodo).saldo += Number(item.valor || 0);
    });

  detailLaunchRows()
    .filter(item => !state.detailYear || item.ano === state.detailYear)
    .forEach(item => {
      const periodo = item.data || '-';
      if (!monthlyMap.has(periodo)) {
        monthlyMap.set(periodo, {
          periodo,
          ano: item.ano,
          sortKey: periodSortKey(periodo, item.ano),
          saldo: 0,
          juros: 0,
        });
      }
      monthlyMap.get(periodo).juros += Number(item.valor || 0);
    });

  return Array.from(monthlyMap.values()).sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
}

function displayedDetailValue(saldo, juros) {
  if (state.detailShowSaldo && state.detailShowJuros) return saldo - juros;
  if (state.detailShowSaldo) return saldo;
  if (state.detailShowJuros) return juros;
  return 0;
}

function saldoMenosJurosValue(saldo, juros) {
  return (Number(saldo) || 0) - (Number(juros) || 0);
}

function renderDetailSummary() {
  const wrap = document.getElementById('detailSummaryGrid');
  if (!wrap) return;

  const rows = aggregateDetailByPeriod();

  if (!rows.length) {
    wrap.innerHTML = `
      <div class="detail-period-card">
        <div class="detail-period-head">
          <div class="detail-period-label">Sem dados</div>
        </div>
        <div class="detail-period-breakdown">
          <div class="detail-breakdown-row">
            <span>Nenhum lançamento encontrado para os filtros selecionados.</span>
          </div>
        </div>
      </div>
    `;
    return;
  }

  wrap.innerHTML = rows.map(item => {
    const total = displayedDetailValue(item.saldo, item.juros);
    const totalClass = total < 0 ? 'negative' : '';
    const breakdown = [];

    if (state.detailShowSaldo) {
      breakdown.push(`
        <div class="detail-breakdown-row">
          <span>Saldo Final</span>
          <strong>${formatBRL(item.saldo)}</strong>
        </div>
      `);
    }

    if (state.detailShowJuros) {
      breakdown.push(`
        <div class="detail-breakdown-row">
          <span>Juros</span>
          <strong>${formatBRL(item.juros)}</strong>
        </div>
      `);
    }

    return `
      <div class="detail-period-card">
        <div class="detail-period-head">
          <div class="detail-period-label">${item.periodo}</div>
          <div class="detail-period-total ${totalClass}">${formatBRL(total)}</div>
        </div>
        <div class="detail-period-breakdown">
          ${breakdown.join('')}
        </div>
      </div>
    `;
  }).join('');
}



function shouldShowDetailDescriptionLabel() {
  return state.detailShowSaldo && state.detailShowJuros;
}

function buildDetailDisplayRows() {
  const rows = [];
  const grouped = new Map();
  const showContaCorrente = state.detailShowContaCorrente;
  const showDetailedDescription = state.detailShowDescricaoDetalhada;
  const showDescriptionLabel = shouldShowDetailDescriptionLabel();

  if (state.detailShowSaldo) {
    detailBalanceRows()
      .filter(item => !state.detailYear || item.ano === state.detailYear)
      .forEach(item => {
        rows.push({
          conta_corrente: item.conta_corrente,
          descricao: 'Saldo Final',
          descricao_detalhada: 'Saldo final do período',
          saldo_valor: Number(item.valor || 0),
          juros_valor: null,
          data: item.data || '-',
          dia: '',
          sortKey: periodSortKey(item.data, item.ano),
          daySort: 99,
          rowType: 'saldo',
        });
      });
  }

  if (state.detailShowJuros) {
    detailLaunchRows()
      .filter(item => !state.detailYear || item.ano === state.detailYear)
      .forEach(item => {
        rows.push({
          conta_corrente: item.conta_corrente,
          descricao: item.descricao || '-',
          descricao_detalhada: item.descricao_detalhada || '-',
          saldo_valor: null,
          juros_valor: Number(item.valor || 0),
          data: item.data || '-',
          dia: item.dia || '',
          sortKey: periodSortKey(item.data, item.ano),
          daySort: daySortValue(item.dia),
          rowType: 'juros',
        });
      });
  }

  rows.forEach(item => {
    const keyParts = [item.data, item.rowType];

    if (showDescriptionLabel) keyParts.push(item.descricao || '');
    if (showDetailedDescription) keyParts.push(item.descricao_detalhada || '');
    if (showContaCorrente) keyParts.push(item.conta_corrente || '');

    const key = keyParts.join('||');

    if (!grouped.has(key)) {
      grouped.set(key, { ...item });
      return;
    }

    const current = grouped.get(key);
    current.saldo_valor = (Number(current.saldo_valor) || 0) + (Number(item.saldo_valor) || 0);
    current.juros_valor = (Number(current.juros_valor) || 0) + (Number(item.juros_valor) || 0);
    current.daySort = Math.min(Number(current.daySort) || 99, Number(item.daySort) || 99);
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const periodCompare = String(a.sortKey).localeCompare(String(b.sortKey));
    if (periodCompare !== 0) return periodCompare;
    const typeCompare = (a.rowType === 'saldo' ? 0 : 1) - (b.rowType === 'saldo' ? 0 : 1);
    if (typeCompare !== 0) return typeCompare;
    const descriptionCompare = String(a.descricao).localeCompare(String(b.descricao));
    if (descriptionCompare !== 0) return descriptionCompare;
    const detailedCompare = String(a.descricao_detalhada).localeCompare(String(b.descricao_detalhada));
    if (detailedCompare !== 0) return detailedCompare;
    const accountCompare = String(a.conta_corrente).localeCompare(String(b.conta_corrente));
    if (accountCompare !== 0) return accountCompare;
    return (Number(a.daySort) || 99) - (Number(b.daySort) || 99);
  });
}

function renderDetailTable() {
  const head = document.getElementById('detailTableHead');
  const body = document.getElementById('detailTableBody');
  if (!head || !body) return;

  const showContaCorrente = state.detailShowContaCorrente;
  const showDetailedDescription = state.detailShowDescricaoDetalhada;
  const showSaldoMenosJuros = state.detailShowSaldoMenosJuros;
  const showDescriptionLabel = shouldShowDetailDescriptionLabel();
  const keepDescriptionSpacer = !showDescriptionLabel && !showContaCorrente && !showDetailedDescription;
  const showDescriptionColumn = showDescriptionLabel || keepDescriptionSpacer;
  const contaClass = showContaCorrente ? '' : 'detail-hidden';
  const descriptionClass = showDescriptionColumn
    ? (showDescriptionLabel ? '' : 'detail-description-neutral')
    : 'detail-hidden';
  const detailedClass = showDetailedDescription ? '' : 'detail-hidden';
  const saldoMenosJurosClass = showSaldoMenosJuros ? '' : 'detail-hidden';
  const infoColSpan = (showDescriptionColumn ? 1 : 0) + (showContaCorrente ? 1 : 0) + (showDetailedDescription ? 1 : 0);
  const colSpan = infoColSpan + 3 + (showSaldoMenosJuros ? 1 : 0);
  const periodSummaries = aggregateDetailByPeriod();
  const periodSummaryMap = new Map(
    periodSummaries.map(item => [item.periodo, item])
  );
  const rows = buildDetailDisplayRows();

  head.innerHTML = `
    <tr>
      <th class="detail-account-cell ${contaClass}">Conta Corrente</th>
      <th class="detail-description-cell ${descriptionClass}">${showDescriptionLabel ? 'Descrição' : ''}</th>
      <th class="detail-description-detailed ${detailedClass}">Descrição detalhada</th>
      <th class="detail-saldo-cell">Saldo</th>
      <th class="detail-juros-cell">Juros</th>
      <th class="detail-saldo-menos-juros-cell ${saldoMenosJurosClass}">Saldo - Juros</th>
      <th>Data</th>
    </tr>
  `;

  if (!rows.length) {
    body.innerHTML = `
      <tr class="detail-empty-row">
        <td colspan="${colSpan}">Nenhum lançamento encontrado para os filtros selecionados.</td>
      </tr>
    `;
    return;
  }

  let currentPeriod = null;
  const html = [];
  const periodRowCounts = rows.reduce((acc, item) => {
    acc[item.data] = (acc[item.data] || 0) + 1;
    return acc;
  }, {});
  const showOnlySaldo = state.detailShowSaldo && !state.detailShowJuros && !showSaldoMenosJuros;
  const showOnlyJuros = state.detailShowJuros && !state.detailShowSaldo && !showSaldoMenosJuros;

  rows.forEach(item => {
    if (item.data !== currentPeriod) {
      currentPeriod = item.data;
      const summary = periodSummaryMap.get(item.data) || { saldo: 0, juros: 0 };
      const saldoMenosJurosTotal = saldoMenosJurosValue(summary.saldo, summary.juros);
      const saldoTotalClass = summary.saldo < 0 ? 'negative' : '';
      const jurosTotalClass = summary.juros < 0 ? 'negative' : '';
      const saldoMenosJurosTotalClass = saldoMenosJurosTotal < 0 ? 'negative' : '';
      const linkedTotalClass = state.detailShowContaCorrente ? 'detail-month-total-linked' : '';
      const neutralMonthlyTotalClass = (showOnlySaldo || showOnlyJuros) ? 'detail-month-total-neutral' : '';

      html.push(`
        <tr class="detail-month-row">
          <td colspan="${infoColSpan}" class="detail-month-label-cell">
            <div class="detail-month-row-content">
              <span>${item.data}</span>
            </div>
          </td>
          <td class="detail-month-total-cell ${neutralMonthlyTotalClass} ${saldoTotalClass} ${linkedTotalClass}">${state.detailShowSaldo ? formatBRL(summary.saldo) : ''}</td>
          <td class="detail-month-total-cell detail-month-total-juros ${neutralMonthlyTotalClass} ${jurosTotalClass} ${linkedTotalClass}">${state.detailShowJuros ? formatNegativeBRL(summary.juros) : ''}</td>
          <td class="detail-month-total-cell detail-month-total-net ${saldoMenosJurosClass} ${neutralMonthlyTotalClass} ${saldoMenosJurosTotalClass} ${linkedTotalClass}">${showSaldoMenosJuros ? formatBRL(saldoMenosJurosTotal) : ''}</td>
          <td class="detail-month-spacer-cell"></td>
        </tr>
      `);
    }

    const shouldSkipSingleDetailRow = (showOnlySaldo || showOnlyJuros) && periodRowCounts[item.data] === 1;
    if (shouldSkipSingleDetailRow) return;

    const neutralDetailValueClass = showDescriptionLabel ? 'detail-value-neutral' : '';
    const saldoValueClass = showDescriptionLabel
      ? neutralDetailValueClass
      : (item.rowType === 'saldo' && Number(item.saldo_valor || 0) < 0 ? 'negative' : '');
    const jurosValueClass = showDescriptionLabel
      ? neutralDetailValueClass
      : (item.rowType === 'juros' && Number(item.juros_valor || 0) < 0 ? 'negative' : '');
    const saldoMenosJurosRowValue = item.rowType === 'saldo'
      ? Number(item.saldo_valor || 0)
      : (Number(item.juros_valor || 0) * -1);
    const saldoMenosJurosValueClass = showDescriptionLabel
      ? 'detail-value-neutral'
      : (saldoMenosJurosRowValue < 0 ? 'negative' : '');

    html.push(`
      <tr class="detail-${item.rowType}-row">
        <td class="detail-account-cell ${contaClass}">${item.conta_corrente}</td>
        <td class="detail-description-cell ${descriptionClass}">${showDescriptionLabel ? item.descricao : ''}</td>
        <td class="detail-description-detailed ${detailedClass}">${item.descricao_detalhada}</td>
        <td class="detail-value-cell detail-saldo-value ${saldoValueClass}">${item.rowType === 'saldo' ? formatBRL(item.saldo_valor) : ''}</td>
        <td class="detail-value-cell detail-juros-value ${jurosValueClass}">${item.rowType === 'juros' ? formatNegativeBRL(item.juros_valor) : ''}</td>
        <td class="detail-value-cell detail-saldo-menos-juros-value ${saldoMenosJurosClass} ${saldoMenosJurosValueClass}">${showSaldoMenosJuros ? formatBRL(saldoMenosJurosRowValue) : ''}</td>
        <td>${item.data}</td>
      </tr>
    `);
  });

  if (showOnlySaldo || showOnlyJuros) {
    const yearlyTotals = periodSummaries.reduce((acc, item) => {
      acc.saldo += Number(item.saldo || 0);
      acc.juros += Number(item.juros || 0);
      return acc;
    }, { saldo: 0, juros: 0 });
    const totalSaldoClass = yearlyTotals.saldo < 0 ? 'negative' : '';
    const totalJurosClass = yearlyTotals.juros < 0 ? 'negative' : '';

    html.push(`
      <tr class="detail-month-row detail-grand-total-row">
        <td colspan="${infoColSpan}" class="detail-month-label-cell">
          <div class="detail-month-row-content">
            <span class="detail-total-label">Total</span>
          </div>
        </td>
        <td class="detail-month-total-cell ${totalSaldoClass}">${showOnlySaldo ? formatBRL(yearlyTotals.saldo) : ''}</td>
        <td class="detail-month-total-cell detail-month-total-juros ${totalJurosClass}">${showOnlyJuros ? formatNegativeBRL(yearlyTotals.juros) : ''}</td>
        <td class="detail-month-total-cell detail-month-total-net ${saldoMenosJurosClass}"></td>
        <td class="detail-month-spacer-cell"></td>
      </tr>
    `);
  }

  body.innerHTML = html.join('');
}

function syncDetailControls() {
  const saldoToggle = document.getElementById('detailToggleSaldo');
  const jurosToggle = document.getElementById('detailToggleJuros');
  const saldoMenosJurosToggle = document.getElementById('detailToggleSaldoMenosJuros');
  const accountButton = document.getElementById('detailAccountToggle');
  const descriptionButton = document.getElementById('detailDescriptionToggle');

  if (saldoToggle) saldoToggle.checked = state.detailShowSaldo;
  if (jurosToggle) jurosToggle.checked = state.detailShowJuros;
  if (saldoMenosJurosToggle) saldoMenosJurosToggle.checked = state.detailShowSaldoMenosJuros;
  if (accountButton) {
    accountButton.classList.toggle('active', state.detailShowContaCorrente);
  }
  if (descriptionButton) {
    descriptionButton.classList.toggle('active', state.detailShowDescricaoDetalhada);
  }
}

function updateDetails() {
  normalizeDetailEntity();
  normalizeDetailYear();
  buildDetailCompanyFilters();
  buildDetailYearChips();
  syncDetailControls();
  renderDetailTable();
}

const detailToggleSaldo = document.getElementById('detailToggleSaldo');
if (detailToggleSaldo) {
  detailToggleSaldo.addEventListener('change', (e) => {
    state.detailShowSaldo = e.target.checked;
    updateDetails();
  });
}

const detailToggleJuros = document.getElementById('detailToggleJuros');
if (detailToggleJuros) {
  detailToggleJuros.addEventListener('change', (e) => {
    state.detailShowJuros = e.target.checked;
    updateDetails();
  });
}

const detailToggleSaldoMenosJuros = document.getElementById('detailToggleSaldoMenosJuros');
if (detailToggleSaldoMenosJuros) {
  detailToggleSaldoMenosJuros.addEventListener('change', (e) => {
    state.detailShowSaldoMenosJuros = e.target.checked;
    updateDetails();
  });
}

const detailAccountToggle = document.getElementById('detailAccountToggle');
if (detailAccountToggle) {
  detailAccountToggle.addEventListener('click', () => {
    state.detailShowContaCorrente = !state.detailShowContaCorrente;
    updateDetails();
  });
}

const detailDescriptionToggle = document.getElementById('detailDescriptionToggle');
if (detailDescriptionToggle) {
  detailDescriptionToggle.addEventListener('click', () => {
    state.detailShowDescricaoDetalhada = !state.detailShowDescricaoDetalhada;
    updateDetails();
  });
}

function closeModal() {
  document.getElementById('detailModal').classList.add('hidden');
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', closeModal);

const axisDetailSelect = document.getElementById('axisDetailSelect');
if (axisDetailSelect) {
  axisDetailSelect.addEventListener('change', (e) => {
    state.axisMode = e.target.value;
    applyAxisMode();
  });
}

buildFilters();
buildChartYearChips();
updateKPIs();
buildChart();
updateDetails();
