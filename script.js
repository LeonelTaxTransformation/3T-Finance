const data = window.DASHBOARD_DATA;
const state = { selected: new Set(data.companies.map(c => c.label)), chart: null };
const formatBRL = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const companyMap = Object.fromEntries(data.companies.map(c => [c.label, c]));

function buildFilters(){
  const wrap=document.getElementById('companyFilters');
  wrap.innerHTML='';
  data.companies.forEach(company=>{
    const pill=document.createElement('button');
    pill.className='filter-pill active';
    pill.style.color=company.color;
    pill.innerHTML=`<span class="check">✓</span><span class="label">${company.label}</span>`;
    pill.onclick=()=>{
      if(state.selected.has(company.label) && state.selected.size>1){
        state.selected.delete(company.label);
      } else {
        state.selected.add(company.label);
      }
      updateFiltersUI();
      updateKPIs();
      updateChart();
      updateDetails();
    };
    pill.dataset.company=company.label;
    wrap.appendChild(pill);
  });
  updateFiltersUI();
}

function updateFiltersUI(){
  document.querySelectorAll('.filter-pill').forEach(pill=>{
    const company=pill.dataset.company;
    const active=state.selected.has(company);
    const color = companyMap[company]?.color || '#c7cfdb';
    pill.classList.toggle('active',active);
    pill.style.color = active ? color : '#c7cfdb';
    const check = pill.querySelector('.check');
    check.textContent = active ? '✓' : '';
  });
}

function selectedRows(){
  return data.details.filter(item=>state.selected.has(item.empresa));
}

function updateKPIs(){
  const rows=selectedRows();
  const saldoFinal=rows.reduce((s,r)=>s+r.saldo_final,0);
  const saldoInicial=rows.reduce((s,r)=>s+r.saldo_inicial,0);
  const variacao=saldoFinal-saldoInicial;
  document.getElementById('saldoFinalValue').textContent=formatBRL(saldoFinal);
  document.getElementById('saldoInicialValue').textContent=formatBRL(saldoInicial);
  document.getElementById('variacaoValue').textContent=(variacao<0?'-':'')+formatBRL(Math.abs(variacao));
  document.getElementById('saldoFinalSub').textContent=`${rows.length} extratos · ${state.selected.size} empresas`;
}

function buildChart(){
  const ctx=document.getElementById('lineChart').getContext('2d');
  state.chart=new Chart(ctx,{type:'line',data:{labels:data.chartLabels,datasets:data.chartDatasets.map(ds=>({...ds, hidden:false}))},options:{maintainAspectRatio:false,interaction:{mode:'nearest',intersect:false},plugins:{legend:{display:false},tooltip:{backgroundColor:'#0e1728',borderColor:'rgba(108,132,174,.28)',borderWidth:1,titleColor:'#fff',bodyColor:'#dce6f7',callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${formatBRL(ctx.parsed.y||0)}`}}},scales:{x:{ticks:{color:'#8fa2c0',maxRotation:45,minRotation:45,autoSkip:true,maxTicksLimit:24},grid:{color:'rgba(84,104,138,.12)',drawBorder:false}},y:{ticks:{color:'#8fa2c0',callback:(value)=>{const n=Number(value)||0;if(n===0)return 'R$ 0';return 'R$ '+(n/1000).toLocaleString('pt-BR')+'k';}},grid:{color:'rgba(84,104,138,.12)',drawBorder:false}}}}});
  renderLegend();
  updateChart();
}

function renderLegend(){
  const legend=document.getElementById('customLegend');
  legend.innerHTML='';
  data.companies.forEach(company=>{
    const el=document.createElement('div');
    el.className='legend-item';
    el.innerHTML=`<span class="legend-swatch" style="background:${company.color}"></span><span>${company.label}</span>`;
    legend.appendChild(el);
  });
}

function updateChart(){
  state.chart.data.datasets.forEach(ds=>{ ds.hidden=!state.selected.has(ds.label); });
  state.chart.update();
}

function updateDetails(){
  const list=document.getElementById('detailsList');
  const rows=selectedRows().sort((a,b)=>{
    const [ma,ya]=a.periodo.split('/').map(Number);
    const [mb,yb]=b.periodo.split('/').map(Number);
    const da=new Date(ya,ma-1,1);
    const db=new Date(yb,mb-1,1);
    return da-db||a.empresa.localeCompare(b.empresa);
  });
  list.innerHTML='';
  rows.forEach(row=>{
    const color=companyMap[row.empresa]?.color||'#fff';
    const div=document.createElement('div');
    div.className='detail-row';
    div.innerHTML=`<span class="dot" style="background:${color}"></span><div class="detail-meta"><span class="detail-company" style="color:${color}">${row.empresa}</span><span class="detail-period">${row.periodo}</span></div><span class="detail-value">${formatBRL(row.saldo_final)}</span><button class="detail-button">Detalhes</button>`;
    div.querySelector('.detail-button').onclick=()=>openModal(row.empresa,row.periodo);
    list.appendChild(div);
  });
}

function openModal(company,period){
  const key=`${company}|${period}`;
  const item=data.composition[key];
  if(!item)return;
  document.getElementById('modalTitle').textContent=`${company} · ${period}`;
  const grid=document.getElementById('modalGrid');
  const entries=[
    ['Saldo Inicial',formatBRL(item.saldo_inicial)],
    ['Saldo Final',formatBRL(item.saldo_final)],
    ['Variação',formatBRL(item.variacao)],
    ['Conta Corrente',item.conta_corrente||'-'],
    ['Documento',item.documento||'-'],
    ['Arquivo',item.arquivo||'-'],
    ['Endereço',item.endereco||'-']
  ];
  grid.innerHTML=entries.map(([k,v])=>`<div class="modal-item"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  document.getElementById('detailModal').classList.remove('hidden');
}
function closeModal(){ document.getElementById('detailModal').classList.add('hidden'); }

document.addEventListener('DOMContentLoaded',()=>{
  buildFilters();
  updateKPIs();
  buildChart();
  updateDetails();
  document.getElementById('modalClose').onclick=closeModal;
  document.querySelector('.modal-backdrop').onclick=closeModal;
});
