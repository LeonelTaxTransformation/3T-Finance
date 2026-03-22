const data = window.DASHBOARD_DATA;
const selectedCompanies = new Set(data.companies.map(c => c.id));
let chart;

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function renderFilters(){
  const wrap = document.getElementById('companyFilters');
  wrap.innerHTML='';
  data.companies.forEach(company => {
    const active = selectedCompanies.has(company.id);
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (active ? ' active' : '');
    btn.style.color = active ? company.color : '#cbd5e1';
    btn.innerHTML = `<span class="filter-box">${active ? '✓' : ''}</span><span>${company.label}</span>`;
    btn.addEventListener('click', ()=>{
      if(selectedCompanies.has(company.id)){
        selectedCompanies.delete(company.id);
      } else {
        selectedCompanies.add(company.id);
      }
      renderAll();
    });
    wrap.appendChild(btn);
  });
}

function filteredRows(){
  return data.rows.filter(r => selectedCompanies.has(r.company));
}

function renderKpis(){
  const rows = filteredRows();
  const saldoFinal = rows.reduce((a,b)=>a+b.saldoFinal,0);
  const saldoInicial = rows.reduce((a,b)=>a+b.saldoInicial,0);
  const variacao = saldoFinal - saldoInicial;
  document.getElementById('saldoFinal').textContent = brl(saldoFinal);
  document.getElementById('saldoInicial').textContent = brl(saldoInicial);
  document.getElementById('variacao').textContent = brl(variacao);
  document.getElementById('saldoFinalMeta').textContent = `${rows.length} extratos · ${new Set(rows.map(r=>r.company)).size} empresas`;
}

function renderChart(){
  const labels = data.chartLabels;
  const datasets = data.chartDatasets.filter(ds => selectedCompanies.has(ds.label)).map(ds => ({...ds}));
  const ctx = document.getElementById('chart');
  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      maintainAspectRatio:false,
      interaction:{mode:'nearest',intersect:false},
      plugins:{
        legend:{labels:{color:'#c8d5ea',usePointStyle:true,boxWidth:8,padding:18,font:{size:13}}},
        tooltip:{callbacks:{label:(context)=> `${context.dataset.label}: ${brl(context.parsed.y || 0)}`}}
      },
      scales:{
        x:{ticks:{color:'#9cb0cc',maxRotation:45,minRotation:45},grid:{color:'rgba(39,58,87,.5)'}},
        y:{ticks:{color:'#9cb0cc',callback:(v)=>'R$ ' + Number(v/1000).toLocaleString('pt-BR') + 'k'},grid:{color:'rgba(39,58,87,.5)'}}
      }
    }
  });
}

function renderDetails(){
  const wrap = document.getElementById('detailsList');
  const rows = filteredRows().sort((a,b)=>{
    const [ma,ya]=a.period.split('/').map(Number); const [mb,yb]=b.period.split('/').map(Number);
    return new Date(ya,ma-1)-new Date(yb,mb-1);
  });
  wrap.innerHTML='';
  rows.forEach(row => {
    const el = document.createElement('div');
    el.className='detail-row';
    el.innerHTML = `
      <div class="detail-left">
        <span class="dot" style="background:${row.color}"></span>
        <span class="company-name" style="color:${row.color}">${row.company}</span>
      </div>
      <div class="period-text">${row.period}</div>
      <div class="amount">${brl(row.saldoFinal)}</div>
      <button class="details-btn" type="button">Detalhes</button>
    `;
    el.querySelector('.details-btn').addEventListener('click', ()=> openModal(row));
    wrap.appendChild(el);
  });
}

function openModal(row){
  const modal = document.getElementById('detailsModal');
  document.getElementById('modalTitle').textContent = `Detalhes — ${row.company}`;
  document.getElementById('modalSubtitle').textContent = `${row.period} • ${row.arquivo}`;
  const body = document.getElementById('modalBody');
  const items = data.compositionMap[row.docKey] || [];
  if(!items.length){
    body.innerHTML = `<div class="no-data">Sem detalhes localizados para este extrato.</div>`;
  } else {
    let html = `<div class="comp-grid comp-head"><div>Descrição</div><div>Seção / Contexto</div><div>Tipo</div><div>Valor</div></div>`;
    items.forEach(item => {
      html += `
        <div class="comp-grid">
          <div><div class="comp-val">${item.descricao || '-'}</div><div class="comp-muted">${item.campo || ''}</div></div>
          <div class="comp-muted">${item.secao || item.contexto || '-'}</div>
          <div class="comp-muted">${item.tipo || '-'}</div>
          <div class="comp-val">${item.valor !== null && item.valor !== undefined ? brl(item.valor) : (item.valorText || '-')}</div>
        </div>`;
    });
    body.innerHTML = html;
  }
  modal.classList.remove('hidden');
}

function closeModal(){ document.getElementById('detailsModal').classList.add('hidden'); }
document.getElementById('closeModal').addEventListener('click', closeModal);
document.querySelector('#detailsModal .modal-backdrop').addEventListener('click', closeModal);
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeModal(); });

function renderAll(){ renderFilters(); renderKpis(); renderChart(); renderDetails(); }
renderAll();
