const root = document.documentElement;
const css = v => getComputedStyle(root).getPropertyValue(v).trim();
function rgba(hex,a){
  hex=hex.replace('#','');
  if(hex.length===3)hex=hex.split('').map(x=>x+x).join('');
  const n=parseInt(hex,16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

let charts={};
function destroyCharts(){Object.values(charts).forEach(c=>c&&c.destroy());charts={};}

function buildCharts(){
  destroyCharts();
  const blue=css('--blue'), purple=css('--purple'), pink=css('--pink');
  const grid=css('--grid-line'), txt=css('--text-dim');
  Chart.defaults.font.family="Roboto, sans-serif";
  Chart.defaults.font.size=11;
  Chart.defaults.color=txt;

  const areaFill=(color,top=.35)=>(ctx)=>{
    const{ctx:c,chartArea}=ctx.chart; if(!chartArea)return rgba(color,top);
    const g=c.createLinearGradient(0,chartArea.top,0,chartArea.bottom);
    g.addColorStop(0,rgba(color,top)); g.addColorStop(1,rgba(color,0));
    return g;
  };

  // Earnings Graph
  charts.earnings=new Chart(document.getElementById('earningsChart'),{
    type:'line',
    data:{labels:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      datasets:[
        {label:'This Month',data:[950,800,1150,1300,1050,1150,1500,1900,1700,1250,1050,1200],
         borderColor:blue,backgroundColor:areaFill(blue,.32),fill:true,tension:.45,pointRadius:0,borderWidth:2},
        {label:'Old User',data:[1100,1300,1450,1350,1050,800,750,900,1000,950,850,800],
         borderColor:purple,backgroundColor:areaFill(purple,.22),fill:true,tension:.45,pointRadius:0,borderWidth:2}
      ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{y:{min:0,max:2000,ticks:{stepSize:500},grid:{color:grid},border:{display:false}},
        x:{grid:{display:false},border:{display:false}}}}
  });

  // Last Week bars
  charts.lastWeek=new Chart(document.getElementById('lastWeekChart'),{
    type:'bar',
    data:{labels:['MON','TUE','WED','THU','FRI','SAT','SUN'],
      datasets:[{data:[1500,2000,1450,1750,1300,1950,1650],
        backgroundColor:(ctx)=>{const{ctx:c,chartArea}=ctx.chart; if(!chartArea)return blue;
          const g=c.createLinearGradient(0,chartArea.top,0,chartArea.bottom);
          g.addColorStop(0,purple); g.addColorStop(1,blue); return g;},
        borderRadius:6,borderSkipped:false,barPercentage:.42,categoryPercentage:.7}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{y:{min:0,max:2000,ticks:{stepSize:500},grid:{color:grid},border:{display:false}},
        x:{grid:{display:false},border:{display:false}}}}
  });

  // Top Products doughnut
  charts.products=new Chart(document.getElementById('topProductsChart'),{
    type:'doughnut',
    data:{labels:['iPhone','Mac','iPad'],
      datasets:[{data:[8500,2300,5464],backgroundColor:[blue,purple,pink],
        borderWidth:0,borderRadius:8,spacing:2,cutout:'72%'}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{enabled:true}}}
  });

  // Total Leads mini area
  charts.leads=new Chart(document.getElementById('leadsChart'),{
    type:'line',
    data:{labels:['','','','','','','','',''],
      datasets:[{data:[3,5,4,6,4.6,6.4,5.4,7.6,6.7],
        borderColor:blue,backgroundColor:areaFill(blue,.28),fill:true,tension:.45,pointRadius:0,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{enabled:false}},
      scales:{x:{display:false},y:{display:false}}}
  });
}

// Gauges (Total Vendor)
function buildGauges(){
  document.querySelectorAll('.g-svg').forEach(el=>{
    const pct=+el.dataset.pct;
    let col=el.dataset.color; if(col.startsWith('var('))col=css(col.slice(4,-1).trim());
    const track=css('--input-bg');
    const r=34, c=2*Math.PI*r, off=c*(1-pct/100);
    el.innerHTML=`<svg width="84" height="84" viewBox="0 0 84 84">
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="${track}" stroke-width="7"/>
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 42 42)"/>
    </svg><div class="g-pct">${pct}%</div>`;
  });
}

// Sparklines (Popular Product List)
function buildSparks(){
  document.querySelectorAll('.spark').forEach(el=>{
    const vals=el.dataset.spark.split(',').map(Number);
    const w=80,h=30,pad=4,max=Math.max(...vals),min=Math.min(...vals);
    const pts=vals.map((v,i)=>{
      const x=(i/(vals.length-1))*(w-2*pad)+pad;
      const y=h-pad-((v-min)/((max-min)||1))*(h-2*pad);
      return x.toFixed(1)+' '+y.toFixed(1);
    });
    const d='M'+pts.join(' L');
    el.setAttribute('viewBox',`0 0 ${w} ${h}`);
    el.innerHTML=`<path d="${d}" fill="none" stroke="${css('--blue')}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
}

function renderAll(){
  try{ if(typeof Chart!=='undefined') buildCharts(); }catch(e){console.warn('charts',e);}
  try{ buildGauges(); }catch(e){console.warn('gauges',e);}
  try{ buildSparks(); }catch(e){console.warn('sparks',e);}
}

function toggleTheme(){
  const cur=root.getAttribute('data-theme');
  root.setAttribute('data-theme', cur==='dark'?'light':'dark');
  requestAnimationFrame(renderAll);
}

function setupSidebar(){
  const sidebar=document.getElementById('sidebar');
  const menu=document.getElementById('sidebarMenu');
  const indicator=document.getElementById('sidebarIndicator');
  const trigger=document.getElementById('sidebarUserTrigger');
  const userMenu=document.getElementById('sidebarUserMenu');
  const chevron=document.getElementById('sidebarChevron');
  if(!sidebar||!menu||!indicator||!trigger||!userMenu||!chevron)return;

  const links=[...menu.querySelectorAll('a')];

  function moveIndicator(link){
    const navRect=menu.getBoundingClientRect();
    const linkRect=link.getBoundingClientRect();
    indicator.style.transform=`translateY(${linkRect.top-navRect.top+menu.scrollTop}px)`;
    indicator.style.height=`${linkRect.height}px`;
    indicator.style.opacity='1';
  }

  function closeUserMenu(){
    userMenu.classList.remove('open');
    chevron.classList.remove('open');
    trigger.setAttribute('aria-expanded','false');
  }

  links.forEach(link=>{
    link.addEventListener('mouseenter',()=>moveIndicator(link));
    link.addEventListener('focus',()=>moveIndicator(link));
    link.addEventListener('click',event=>{
      links.forEach(item=>{
        item.classList.remove('active');
        item.removeAttribute('aria-current');
      });
      link.classList.add('active');
      link.setAttribute('aria-current','page');
    });
  });

  menu.addEventListener('focusout',event=>{
    if(!menu.contains(event.relatedTarget))indicator.style.opacity='0';
  });

  trigger.addEventListener('click',event=>{
    event.stopPropagation();
    const opening=!userMenu.classList.contains('open');
    userMenu.classList.toggle('open',opening);
    chevron.classList.toggle('open',opening);
    trigger.setAttribute('aria-expanded',String(opening));
  });

  userMenu.querySelectorAll('a').forEach(link=>link.addEventListener('click',event=>event.preventDefault()));
  document.addEventListener('click',event=>{
    if(!sidebar.contains(event.target))closeUserMenu();
  });
  sidebar.addEventListener('mouseleave',()=>{
    indicator.style.opacity='0';
    closeUserMenu();
    // Ao sair com o mouse, libera o foco preso dentro da sidebar para que o
    // :focus-within solte e ela recolha na hora (antes só recolhia ao clicar fora).
    // Não interfere na navegação por teclado: Tab não dispara mouseleave.
    if(sidebar.contains(document.activeElement))document.activeElement.blur();
  });
  sidebar.addEventListener('focusout',event=>{
    if(!sidebar.contains(event.relatedTarget)){
      indicator.style.opacity='0';
      closeUserMenu();
    }
  });
}

/* init do modelo NÃO é auto-executado: este app é uma SPA.
   setupSidebar()/renderAll() são chamados pelo app.js quando a tela existe.
   (Funções acima permanecem verbatim do modelo.) */
window.setupSidebar = setupSidebar;
window.renderAll = renderAll;
window.buildCharts = buildCharts;
window.buildGauges = buildGauges;
window.buildSparks = buildSparks;
window.toggleTheme = toggleTheme;
