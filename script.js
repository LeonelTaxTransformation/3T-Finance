const data = window.DASHBOARD_DATA;
const state = {
  selected: new Set(data.companies.map(c => c.label)),
  chart: null
};

const companyMap = Object.fromEntries(data.companies.map(c => [c.label, c]));

function formatBRL(value) {
  return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function selectedRows() {
  return data.details.filter(item => state.selected.has(item.empresa));
}

function buildFilters() {
  const wrap = document.getElementById('companyFilters');
  wrap.innerHTML = '';

  data.companies.forEach(company => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip active';
    chip.dataset.company = company.label;
    chip.style.setProperty('--chip-color', company.color);
    chip.innerHTML = `
      <span class="filter-box" aria-hidden="true"></span>
      <span>${company.label}</span>
    `;
    chip.addEventListener('click', () => toggleCompany(company.label));
    wrap.appendChild(chip);
  });

  paintFilters();
}

function toggleCompany(label) {
  if (state.selected.has(label) && state.selected.size > 1) {
    state.selected.delete(label);
  } else {
    state.selected.add(label);
  }
  paintFilters();
  updateKPIs();
  updateChart();
  updateDetails();
}

function paintFilters() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    const label = chip.dataset.company;
    const active = state.selected.has(label);
    chip.classList.toggle('active', active);
    chip.classList.toggle('inactive', !active);
    chip.style.color = active ? companyMap[label].color : '#b7c1cf';
    chip.querySelector('.filter-box').setAttribute('data-active', active ? '1' : '0');
  });
}

function updateKPIs() {
  const rows = selectedRows();
  const saldoFinal = rows.reduce((acc, row) => acc + (row.saldo_final || 0), 0);
  const saldoInicial = rows.reduce((acc, row) => acc + (row.saldo_inicial || 0), 0);
  const variacao = saldoFinal - saldoInicial;

  document.getElementById('saldoFinalValue').textContent = formatBRL(saldoFinal);
  document.getElementById('saldoInicialValue').textContent = formatBRL(saldoInicial);
  document.getElementById('variacaoValue').textContent = `${variacao < 0 ? '-' : ''}${formatBRL(Math.abs(variacao))}`;
  document.getElementById('saldoFinalSub').textContent = `${rows.length} extratos · ${state.selected.size} empresas`;
}

function buildChart() {
  const ctx = document.getElementById('lineChart').getContext('2d');
  state.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.chartLabels,
      datasets: data.chartDatasets.map(ds => ({
        ...ds,
        pointRadius: 3,
        pointHoverRadius: 4,
        borderWidth: 2.5,
        hidden: false
      }))
    },
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
            maxTicksLimit: 18,
            maxRotation: 0
          },
          grid: {
            color: 'rgba(66, 92, 128, .12)',
            drawBorder: false
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: '#7f8faa',
            callback: (value) => {
              const n = Number(value) || 0;
              if (n === 0) return 'R$ 0';
              return `R$ ${(n / 1000).toLocaleString('pt-BR')}k`;
            }
          },
          grid: {
            color: 'rgba(66, 92, 128, .12)',
            drawBorder: false
          }
        }
      }
    }
  });

  renderLegend();
  updateChart();
}

function renderLegend() {
  const wrap = document.getElementById('customLegend');
  wrap.innerHTML = '';

  data.companies.forEach(company => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-swatch" style="background:${company.color}"></span><span>${company.label}</span>`;
    wrap.appendChild(item);
  });
}

function updateChart() {
  if (!state.chart) return;
  state.chart.data.datasets.forEach(ds => {
    ds.hidden = !state.selected.has(ds.label);
  });
  state.chart.update();
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const [ma, ya] = a.periodo.split('/').map(Number);
    const [mb, yb] = b.periodo.split('/').map(Number);
    const da = new Date(ya, ma - 1, 1).getTime();
    const db = new Date(yb, mb - 1, 1).getTime();
    return da - db || a.empresa.localeCompare(b.empresa);
  });
}

function updateDetails() {
  const rows = sortRows(selectedRows());
  const list = document.getElementById('detailsList');
  list.innerHTML = '';

  rows.forEach(row => {
    const color = companyMap[row.empresa]?.color || '#ffffff';
    const div = document.createElement('div');
    div.className = 'detail-row';
    div.innerHTML = `
      <span class="detail-dot" style="background:${color}"></span>
      <div class="detail-main">
        <span class="detail-company" style="color:${color}">${row.empresa}</span>
        <span class="detail-period">${row.periodo}</span>
      </div>
      <span class="detail-value">${formatBRL(row.saldo_final)}</span>
      <button class="detail-btn">Detalhes</button>
    `;
    div.querySelector('.detail-btn').addEventListener('click', () => openModal(row.empresa, row.periodo));
    list.appendChild(div);
  });
}

function openModal(company, period) {
  const key = `${company}|${period}`;
  const item = data.composition[key];
  if (!item) return;

  document.getElementById('modalTitle').textContent = `${company} · ${period}`;
  const grid = document.getElementById('modalGrid');
  const entries = [
    ['Saldo Inicial', formatBRL(item.saldo_inicial)],
    ['Saldo Final', formatBRL(item.saldo_final)],
    ['Variação', formatBRL(item.variacao)],
    ['Conta Corrente', item.conta_corrente || '-'],
    ['Documento', item.documento || '-'],
    ['Arquivo', item.arquivo || '-'],
    ['Endereço', item.endereco || '-']
  ];

  grid.innerHTML = entries.map(([k, v]) => `
    <div class="modal-item">
      <div class="modal-k">${k}</div>
      <div class="modal-v">${v}</div>
    </div>
  `).join('');

  document.getElementById('detailModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('detailModal').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  buildFilters();
  updateKPIs();
  buildChart();
  updateDetails();

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalBackdrop').addEventListener('click', closeModal);
});
