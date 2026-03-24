
const data = window.DASHBOARD_DATA;
const state = {
  selected: new Set(["__ALL__"]),
  chart: null,
  modalEntity: null,
  modalYear: null,
  axisMode: 'intermediario',
};

const companyMap = Object.fromEntries(data.companies.map(c => [c.id, c]));

function formatBRL(value) {
  return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
  document.querySelectorAll('.filter-chip').forEach(chip => {
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

function aggregateRows(rows) {
  const saldoFinal = rows.reduce((acc, row) => acc + (row.saldo_final || 0), 0);
  const saldoInicial = rows.reduce((acc, row) => acc + (row.saldo_inicial || 0), 0);
  return { saldoFinal, saldoInicial, variacao: saldoFinal - saldoInicial };
}

function updateKPIs() {
  const rows = selectedRows();
  const agg = aggregateRows(rows);
  document.getElementById('saldoFinalValue').textContent = formatBRL(agg.saldoFinal);
  document.getElementById('saldoInicialValue').textContent = formatBRL(agg.saldoInicial);

  const variacaoEl = document.getElementById('variacaoValue');
  const arrowEl = document.querySelector('.summary-arrow');
  const positive = agg.variacao >= 0;

  variacaoEl.textContent = `${agg.variacao < 0 ? '-' : ''}${formatBRL(Math.abs(agg.variacao))}`;
  variacaoEl.classList.toggle('summary-positive', positive);
  variacaoEl.classList.toggle('summary-negative', !positive);

  if (arrowEl) {
    arrowEl.textContent = positive ? '↗' : '↘';
    arrowEl.style.color = positive ? '#22c55e' : '#ff3d3d';
  }

  const entityCount = state.selected.has("__ALL__") ? data.companies.length - 1 : state.selected.size;
  document.getElementById('saldoFinalSub').textContent = `${rows.length} extratos · ${entityCount} empresas`;
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

function buildDatasets() {
  const rows = selectedRows();
  const labels = monthRangeLabels(rows);

  if (state.selected.has("__ALL__")) {
    const vals = labels.map(label =>
      rows
        .filter(r => normalizeToMonthStart(r.data_final) === label)
        .reduce((a,b) => a + (b.saldo_final || 0), 0)
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

  const entities = activeEntities();
  const rowsByEntity = Object.fromEntries(entities.map(e => [e, data.rows.filter(r => r.empresa === e)]));

  const datasets = entities.map(entity => {
    const vals = labels.map(label =>
      rowsByEntity[entity]
        .filter(r => normalizeToMonthStart(r.data_final) === label)
        .reduce((a,b) => a + (b.saldo_final || 0), 0)
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

  // Ano + meses-chave: ano no primeiro ponto do ano, e MAR/JUN/SET/DEZ nos demais
  const monthName = {
    '03': 'MAR',
    '06': 'JUN',
    '09': 'SET',
    '12': 'DEZ'
  }[month];

  if (year !== prevYear) return year;
  return monthName || '';
}

function applyAxisMode() {
  if (!state.chart) return;
  const labels = state.chart.data.labels || [];
  state.chart.options.scales.x.ticks.callback = function(value, index) {
    const raw = labels[index];
    return formatAxisLabel(raw, index, labels, state.axisMode);
  };
  state.chart.options.scales.x.ticks.autoSkip = false;
  state.chart.options.scales.x.ticks.maxTicksLimit = state.axisMode === 'ano' ? labels.length : labels.length;
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
            label: (ctx) => `${ctx.dataset.label}: ${formatBRL(ctx.parsed.y || 0)}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#7f8faa',
            autoSkip: true,
            maxTicksLimit: 24,
            maxRotation: 0,
            callback: function(value, index) {
              const raw = this.chart.data.labels[index];
              return formatAxisLabel(raw, index, this.chart.data.labels, state.axisMode);
            }
          },
          grid: { color: 'rgba(66, 92, 128, .12)' }
        },
        y: {
          ticks: {
            color: '#7f8faa',
            callback: (value) => formatBRL(value)
          },
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

function entityRows(entity) {
  if (entity === "Todas as empresas") return data.rows.slice();
  return data.rows.filter(r => r.empresa === entity);
}

function availableYears(entity) {
  return [...new Set(entityRows(entity).map(r => r.ano).filter(Boolean))].sort();
}

function renderYearDetails(entity, year) {
  const rows = entityRows(entity).filter(r => r.ano === year);
  const saldoInicial = rows.reduce((a,b) => a + (b.saldo_inicial || 0), 0);
  const saldoFinal = rows.reduce((a,b) => a + (b.saldo_final || 0), 0);
  const variacao = saldoFinal - saldoInicial;

  const orderedRows = rows
    .filter(r => r.data_final)
    .slice()
    .sort((a, b) => String(a.data_final).localeCompare(String(b.data_final)));

  const bestMonth = orderedRows.length
    ? orderedRows.reduce((best, row) => (best === null || (row.saldo_final || 0) > (best.saldo_final || 0) ? row : best), null)
    : null;

  const worstMonth = orderedRows.length
    ? orderedRows.reduce((worst, row) => (worst === null || (row.saldo_final || 0) < (worst.saldo_final || 0) ? row : worst), null)
    : null;

  let growthCount = 0;
  let dropCount = 0;
  for (let i = 1; i < orderedRows.length; i++) {
    const prev = orderedRows[i - 1].saldo_final || 0;
    const curr = orderedRows[i].saldo_final || 0;
    if (curr > prev) growthCount++;
    if (curr < prev) dropCount++;
  }

  const variationClass = variacao >= 0 ? 'positive' : 'negative';
  document.getElementById('yearDetailGrid').innerHTML = `
    <div class="year-detail-card">
      <div class="year-detail-label">Saldo Inicial</div>
      <div class="year-detail-value">${formatBRL(saldoInicial)}</div>
    </div>
    <div class="year-detail-card">
      <div class="year-detail-label">Saldo Final</div>
      <div class="year-detail-value">${formatBRL(saldoFinal)}</div>
    </div>
    <div class="year-detail-card">
      <div class="year-detail-label">Variação</div>
      <div class="year-detail-value ${variationClass}">${variacao < 0 ? '-' : ''}${formatBRL(Math.abs(variacao))}</div>
    </div>
  `;

  document.getElementById('addressBox').innerHTML = `
    <div class="analysis-box">
      <div class="analysis-title">Análise resumida de ${year}</div>
      <div class="analysis-list">
        <div class="analysis-item"><strong>Melhor mês:</strong> ${bestMonth ? `${bestMonth.periodo} (${formatBRL(bestMonth.saldo_final || 0)})` : 'Sem dados'}</div>
        <div class="analysis-item"><strong>Pior mês:</strong> ${worstMonth ? `${worstMonth.periodo} (${formatBRL(worstMonth.saldo_final || 0)})` : 'Sem dados'}</div>
        <div class="analysis-item"><strong>Meses com crescimento:</strong> ${growthCount}</div>
        <div class="analysis-item"><strong>Meses com queda:</strong> ${dropCount}</div>
        <div class="analysis-item"><strong>Total de registros no ano:</strong> ${orderedRows.length}</div>
      </div>
    </div>
  `;
}

function openDetailModal(entity) {
  state.modalEntity = entity;
  const years = availableYears(entity);
  state.modalYear = years[0] || null;

  document.getElementById('modalTitle').textContent = `${entity} — Detalhes`;
  const yearWrap = document.getElementById('yearChipRow');
  yearWrap.innerHTML = '';

  years.forEach(year => {
    const chip = document.createElement('button');
    chip.className = `year-chip ${year === state.modalYear ? 'active' : ''}`;
    chip.textContent = year;
    chip.addEventListener('click', () => {
      state.modalYear = year;
      document.querySelectorAll('.year-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderYearDetails(entity, year);
    });
    yearWrap.appendChild(chip);
  });

  if (state.modalYear) renderYearDetails(entity, state.modalYear);

  document.getElementById('detailModal').classList.remove('hidden');
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
updateKPIs();
buildChart();
updateDetails();
