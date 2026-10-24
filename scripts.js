(() => {
  const KEY = "finova_data_v1";
  const THEME_KEY = "finova_theme";
  const defaultCategories = [
    {id:crypto.randomUUID(), name:"Alimentación", color:"#2f9e7a"},
    {id:crypto.randomUUID(), name:"Transporte", color:"#3b82f6"},
    {id:crypto.randomUUID(), name:"Vivienda", color:"#8b6cf0"},
    {id:crypto.randomUUID(), name:"Salud", color:"#e5637a"},
    {id:crypto.randomUUID(), name:"Entretenimiento", color:"#e0a526"},
    {id:crypto.randomUUID(), name:"Salario", color:"#2aa7c9"}
  ];
  const defaultSettings = {cardName:"Tarjeta de crédito", payDay:5, limit:0, weeklyMax:0, weeklyIdeal:0};

  let data = load();
  let movementType = "income";
  let editingMovement = null;
  let editingCategory = null;
  let editingGoal = null;

  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(Number(n)||0);
  const dateTime = d => new Intl.DateTimeFormat("es-CO",{dateStyle:"medium",timeStyle:"short"}).format(new Date(d));
  const dateOnly = d => new Intl.DateTimeFormat("es-CO",{dateStyle:"medium"}).format(new Date(d));
  const longDate = d => new Intl.DateTimeFormat("es-CO",{day:"numeric",month:"long"}).format(new Date(d));
  const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const ic = name => `<svg class="ic"><use href="#i-${name}"/></svg>`;
  const sum = list => list.reduce((s,m)=>s+m.amount,0);
  const monthOf = d => { d=new Date(d); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); };

  /* ---------- Datos ---------- */
  function load(){
    try{
      const saved = JSON.parse(localStorage.getItem(KEY));
      if(saved && saved.categories && saved.movements && saved.goals){
        saved.settings = {...defaultSettings, ...(saved.settings||{})};
        saved.weekGoals = saved.weekGoals || {};
        return saved;
      }
    }catch(e){}
    return {categories:defaultCategories.map(c=>({...c})), movements:[], goals:[], settings:{...defaultSettings}, weekGoals:{}};
  }
  function save(){ localStorage.setItem(KEY, JSON.stringify(data)); }
  function toast(msg){
    $("toast").textContent = msg; $("toast").classList.add("show");
    clearTimeout(window.__toast); window.__toast = setTimeout(()=>$("toast").classList.remove("show"), 2600);
  }
  const category = id => data.categories.find(c=>c.id===id);

  /* ---------- Lógica de tarjeta ----------
     Una compra con tarjeta (type "card") no cuenta en el mes en que se hace:
     se cobra el día de pago (2 a 5) del mes siguiente. */
  const payDay = () => Math.min(5, Math.max(2, Number(data.settings.payDay)||5));
  const dueDate = m => { const d=new Date(m.createdAt); return new Date(d.getFullYear(), d.getMonth()+1, payDay()); };
  const isPending = m => m.type==="card" && dueDate(m) > new Date();
  // Un movimiento afecta el saldo cuando llega su fecha efectiva
  const affectsBalance = m => m.type==="card" ? dueDate(m) <= new Date() : true;
  // Mes al que pertenece el movimiento para los totales mensuales
  const monthOfMovement = m => monthOf(m.type==="card" ? dueDate(m) : m.createdAt);

  function cardStats(){
    const pending = data.movements.filter(isPending);
    const total = sum(pending);
    let next = null, nextAmount = 0;
    if(pending.length){
      next = new Date(Math.min(...pending.map(m=>+dueDate(m))));
      nextAmount = sum(pending.filter(m=>+dueDate(m)===+next));
    }
    return {total, next, nextAmount, count:pending.length};
  }

  /* ---------- Render ---------- */
  function renderAll(){
    renderCategories(); renderSelects(); renderDashboard(); renderHistory(); renderGoals(); renderCard(); renderCalendar(); updateCardHint(); save();
  }
  function renderSelects(){
    const opts = data.categories.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    const empty = '<option value="">Crea una categoría primero</option>';
    const current=$("category").value, currentGoal=$("goalCategory").value, currentFilter=$("filterCategory").value;
    $("category").innerHTML = opts || empty;
    $("goalCategory").innerHTML = opts || empty;
    $("filterCategory").innerHTML = '<option value="">Todas las categorías</option>'+opts;
    if([...$("category").options].some(o=>o.value===current)) $("category").value=current;
    if([...$("goalCategory").options].some(o=>o.value===currentGoal)) $("goalCategory").value=currentGoal;
    $("filterCategory").value = currentFilter;
  }

  function renderDashboard(){
    const key = $("monthPick").value || monthOf(new Date());
    const balance = sum(data.movements.filter(m=>m.type==="income")) - sum(data.movements.filter(m=>m.type!=="income" && affectsBalance(m)));
    const inMonth = data.movements.filter(m=>monthOfMovement(m)===key);
    const income = sum(inMonth.filter(m=>m.type==="income"));
    const monthCard = sum(inMonth.filter(m=>m.type==="card"));
    const expense = sum(inMonth.filter(m=>m.type==="expense")) + monthCard;
    const cs = cardStats();

    $("statBalance").textContent = money(balance);
    $("statCount").textContent = `${data.movements.length} movimiento${data.movements.length===1?"":"s"}`;
    $("statIncome").textContent = money(income);
    $("statExpense").textContent = money(expense);
    $("statExpenseNote").textContent = monthCard>0 ? `Incluye ${money(monthCard)} de tarjeta` : "";
    $("statCard").textContent = money(cs.total);
    $("statCardNote").textContent = cs.next ? `Próximo pago el ${longDate(cs.next)}` : "Sin pagos pendientes";

    const recent = [...data.movements].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6);
    $("recentMovements").innerHTML = recent.length ? recent.map(movementHTML).join("") : '<div class="empty">Aún no hay movimientos. Registra tu primer ingreso o gasto.</div>';

    // Gastos por categoría del mes seleccionado
    const totals = {};
    inMonth.filter(m=>m.type!=="income").forEach(m=>{ totals[m.categoryId]=(totals[m.categoryId]||0)+m.amount; });
    const entries = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const spent = entries.reduce((s,e)=>s+e[1],0) || 1;
    $("spendByCategory").innerHTML = entries.length ? entries.map(([id,v])=>{
      const c = category(id);
      return `<div class="cat-row"><div class="cat-top"><span class="dot" style="--c:${c?.color||"#999"}"></span><span>${escapeHtml(c?.name||"Categoría eliminada")}</span><strong>${money(v)}</strong></div>
      <div class="bar"><span style="width:${(v/spent*100).toFixed(1)}%;background:${c?.color||"#999"}"></span></div></div>`;
    }).join("") : '<div class="empty">Sin gastos en este mes.</div>';
  }

  function movementHTML(m){
    const c = category(m.categoryId), card = m.type==="card";
    const sign = m.type==="income" ? "+" : "−";
    const icon = m.type==="income" ? "in" : card ? "card" : "out";
    const second = card
      ? `Se cobra el ${dateOnly(dueDate(m))}`
      : dateTime(m.createdAt);
    const badge = card ? `<span class="badge ${isPending(m)?"card":""}">${isPending(m)?"Pendiente":"Pagado"}</span>` : "";
    return `<div class="row">
      <div class="r-ic ${m.type}">${ic(icon)}</div>
      <div class="r-main"><strong>${escapeHtml(m.description||c?.name||"Movimiento")}</strong>
        <div class="r-meta"><span>${escapeHtml(c?.name||"Categoría eliminada")}</span><span>${second}</span>${badge}</div></div>
      <div class="amt ${m.type}">${sign}${money(m.amount)}</div>
      <div class="row-actions"><button class="mini" title="Editar" aria-label="Editar" data-edit="${m.id}">${ic("edit")}</button><button class="mini" title="Eliminar" aria-label="Eliminar" data-delete="${m.id}">${ic("x")}</button></div>
    </div>`;
  }

  const typeLabel = {income:"Ingreso", expense:"Gasto", card:"Tarjeta"};
  const typeBadge = {income:"income", expense:"", card:"card"};
  function renderHistory(){
    const q=$("search").value.trim().toLowerCase(), type=$("filterType").value, cat=$("filterCategory").value;
    const from=$("filterFrom").value?new Date($("filterFrom").value+"T00:00:00"):null;
    const to=$("filterTo").value?new Date($("filterTo").value+"T23:59:59"):null;
    const rows=[...data.movements].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).filter(m=>{
      const c=category(m.categoryId);
      const text=((m.description||"")+" "+(c?.name||"")).toLowerCase();
      const d=new Date(m.createdAt);
      return (!q||text.includes(q))&&(!type||m.type===type)&&(!cat||m.categoryId===cat)&&(!from||d>=from)&&(!to||d<=to);
    });
    $("historyCount").textContent=`${rows.length} resultado${rows.length===1?"":"s"}`;
    $("historyBody").innerHTML=rows.length?rows.map(m=>{
      const c=category(m.categoryId), card=m.type==="card";
      return `<tr><td>${dateTime(m.createdAt)}</td>
      <td><span class="badge ${typeBadge[m.type]}">${typeLabel[m.type]}</span></td>
      <td>${escapeHtml(c?.name||"—")}</td><td>${escapeHtml(m.description||"—")}</td>
      <td class="right amt ${m.type}">${m.type==="income"?"+":"−"}${money(m.amount)}${card?`<span class="sub">Se cobra el ${dateOnly(dueDate(m))}</span>`:""}</td>
      <td><div class="row-actions"><button class="mini" aria-label="Editar" data-edit="${m.id}">${ic("edit")}</button><button class="mini" aria-label="Eliminar" data-delete="${m.id}">${ic("x")}</button></div></td></tr>`;
    }).join(""):'<tr><td colspan="6"><div class="empty">No hay movimientos que coincidan con los filtros.</div></td></tr>';
  }

  function renderCategories(){
    $("categoryCount").textContent=data.categories.length;
    $("categoryList").innerHTML=data.categories.length?data.categories.map(c=>`<div class="category-item">
      <span class="dot" style="--c:${c.color}"></span><div class="grow">${escapeHtml(c.name)}</div>
      <div class="category-actions"><button class="mini" aria-label="Editar" data-cat-edit="${c.id}">${ic("edit")}</button><button class="mini" aria-label="Eliminar" data-cat-delete="${c.id}">${ic("x")}</button></div>
    </div>`).join(""):'<div class="empty">No tienes categorías.</div>';
  }

  function goalProgress(goal){
    const total = sum(data.movements.filter(m=>m.categoryId===goal.categoryId && m.type==="income"));
    return {total, pct:Math.min(100,(total/goal.target)*100)};
  }
  function goalHTML(g, card=false){
    const c=category(g.categoryId), p=goalProgress(g);
    return `<div class="${card?"goal-card goal":"goal"}">
      ${card?`<button class="mini goal-delete" aria-label="Eliminar objetivo" data-goal-delete="${g.id}">${ic("x")}</button>`:""}
      <div class="goal-top"><strong>${escapeHtml(g.name)}</strong><span>${p.pct.toFixed(0)}%</span></div>
      <div class="goal-meta">${escapeHtml(c?.name||"Sin categoría")}${g.deadline?", hasta "+dateOnly(g.deadline):""}</div>
      <div class="progress"><span style="width:${p.pct}%"></span></div>
      <div class="goal-meta"><strong>${money(p.total)}</strong> de ${money(g.target)}</div>
      ${card?`<div class="actions" style="margin-top:10px"><button class="btn sm" data-goal-edit="${g.id}">Editar</button></div>`:""}
    </div>`;
  }
  function renderGoals(){
    $("goalList").innerHTML=data.goals.length?data.goals.map(g=>goalHTML(g,true)).join(""):'<div class="panel empty" style="grid-column:1/-1">Todavía no tienes objetivos. Crea el primero arriba.</div>';
    $("dashboardGoals").innerHTML=data.goals.slice(0,3).map(g=>goalHTML(g)).join("")||'<div class="empty">Crea un objetivo para medir tu progreso.</div>';
  }

  function renderCard(){
    const s = data.settings, cs = cardStats();
    $("ccName").textContent = s.cardName || defaultSettings.cardName;
    $("ccPending").textContent = money(cs.total);
    $("ccNext").textContent = cs.next ? `Próximo pago: ${longDate(cs.next)}, ${money(cs.nextAmount)}` : "Sin pagos pendientes";
    const limit = Number(s.limit)||0;
    $("ccUsage").hidden = !(limit>0);
    if(limit>0){
      $("ccBar").style.width = Math.min(100,cs.total/limit*100)+"%";
      $("ccUsageText").textContent = `${money(cs.total)} de ${money(limit)} de cupo`;
    }
    $("cardName").value = s.cardName===defaultSettings.cardName ? "" : s.cardName;
    $("payDay").value = String(payDay());
    $("cardLimit").value = limit || "";

    // Pagos agrupados por fecha de cobro
    const groups = new Map();
    data.movements.filter(m=>m.type==="card").forEach(m=>{
      const k=+dueDate(m); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(m);
    });
    const keys=[...groups.keys()];
    const upcoming=keys.filter(k=>k>Date.now()).sort((a,b)=>a-b);
    const past=keys.filter(k=>k<=Date.now()).sort((a,b)=>b-a);
    const html = k => {
      const list=groups.get(k).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)), paid=k<=Date.now();
      return `<div class="stmt ${paid?"paid":""}">
        <div class="stmt-head"><div><strong>Pago del ${dateOnly(k)}</strong><span class="small">${list.length} compra${list.length===1?"":"s"}</span></div>
        <div class="stmt-right"><span class="badge ${paid?"":"card"}">${paid?"Pagado":"Pendiente"}</span><strong>${money(sum(list))}</strong></div></div>
        ${list.map(movementHTML).join("")}</div>`;
    };
    $("statements").innerHTML = keys.length ? [...upcoming,...past].map(html).join("") : '<div class="empty">Aún no registras compras con tarjeta.</div>';
  }

  /* ---------- Calendario y meta semanal ---------- */
  const pad = n => String(n).padStart(2,"0");
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parseKey = k => { const [y,m,d] = k.split("-").map(Number); return new Date(y,m-1,d); };
  const addDays = (d,n) => new Date(d.getFullYear(), d.getMonth(), d.getDate()+n);
  const startOfWeek = d => addDays(d, -((d.getDay()+6)%7)); // semana de lunes a domingo
  const compact = n => "$"+new Intl.NumberFormat("es-CO",{notation:"compact",maximumFractionDigits:1}).format(n);
  const shortDate = d => new Intl.DateTimeFormat("es-CO",{day:"numeric",month:"short"}).format(d);
  let calMonth = new Date(); calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  let selectedDay = dayKey(new Date());
  // Un gasto cuenta el día en que ocurre; una compra con tarjeta, el día en que se cobra
  const spendDate = m => m.type==="card" ? dueDate(m) : new Date(m.createdAt);

  function spendByDay(){
    const map = {}, nowD = new Date();
    data.movements.filter(m=>m.type!=="income").forEach(m=>{
      const k = dayKey(spendDate(m));
      const e = map[k] = map[k] || {total:0, list:[], future:false};
      e.total += m.amount; e.list.push(m);
      if(spendDate(m) > nowD) e.future = true;
    });
    return map;
  }
  function weekTotals(start, map){
    let total = 0, scheduled = 0; const nowD = new Date();
    for(let i=0;i<7;i++){
      const e = map[dayKey(addDays(start,i))];
      if(e){ total += e.total; e.list.forEach(m=>{ if(spendDate(m) > nowD) scheduled += m.amount; }); }
    }
    return {total, scheduled};
  }
  // Meta de una semana: la propia (puesta a mano) si existe; si no, la meta general
  function goalFor(start){
    const own = data.weekGoals?.[dayKey(start)];
    if(own) return {max:Number(own.max)||0, ideal:Number(own.ideal)||0, custom:true};
    return {max:Number(data.settings.weeklyMax)||0, ideal:Number(data.settings.weeklyIdeal)||0, custom:false};
  }
  function weekBar(total, g){
    if(!g.max) return "";
    const state = total>g.max ? "over" : (g.ideal>0 && total>g.ideal) ? "warn" : "ok";
    const mark = g.ideal>0 && g.ideal<g.max ? `<i class="mark" style="left:${g.ideal/g.max*100}%"></i>` : "";
    return `<div class="wbar ${state}"><span style="width:${Math.min(100,total/g.max*100)}%"></span>${mark}</div>`;
  }

  function renderCalendar(){
    const map = spendByDay(), today = new Date(), todayKey = dayKey(today);
    const ws = startOfWeek(parseKey(selectedDay)), we = addDays(ws,6), wsKey = dayKey(ws);
    const g = goalFor(ws), max = g.max, ideal = g.ideal;
    const wt = weekTotals(ws, map), left = max - wt.total;
    const curStart = startOfWeek(today), isCurrent = +ws === +curStart, isPast = ws < curStart;

    // Semana seleccionada
    $("weekTitle").textContent = `Semana del ${shortDate(ws)} al ${shortDate(we)}`;
    $("weekBadge").hidden = !isCurrent;
    $("weekSpent").textContent = money(wt.total);
    $("weekBar").innerHTML = weekBar(wt.total, g);
    let status;
    if(!max) status = "Esta semana no tiene meta. Defínela en el panel de la derecha.";
    else if(wt.total > max) status = `Superaste tu máximo por ${money(wt.total-max)}.`;
    else if(isPast) status = ideal>0 && wt.total>ideal ? `Cerraste por encima del ideal, dentro del máximo. Sobraron ${money(left)}.` : `Cerraste dentro de tu meta. Sobraron ${money(left)}.`;
    else if(isCurrent){
      const daysLeft = 7 - ((today.getDay()+6)%7);
      status = ideal>0 && wt.total>ideal ? `Pasaste tu ideal, pero sigues dentro del máximo. Te quedan ${money(left)}.` : `Vas dentro de tu meta. Te quedan ${money(left)}, unos ${money(left/daysLeft)} por día.`;
    } else status = `Semana por venir. Tu máximo es ${money(max)}.`;
    $("weekStatus").textContent = status;
    $("weekIdeal").textContent = ideal ? money(ideal) : "—";
    $("weekMax").textContent = max ? money(max) : "—";
    $("weekLeft").textContent = max ? money(Math.max(0,left)) : "—";
    $("weekNote").textContent = wt.scheduled>0 ? `Incluye ${money(wt.scheduled)} de tarjeta que se cobra esta semana.` : "";

    // Formulario de meta de la semana seleccionada
    $("goalWeekLabel").textContent = `Meta del ${shortDate(ws)} al ${shortDate(we)}`;
    $("goalSource").textContent = g.custom ? "Meta propia de esta semana." : max ? "Usa tu meta general. Guarda una para personalizarla." : "Esta semana no tiene meta.";
    $("clearWeekGoal").hidden = !g.custom;
    $("weeklyMax").value = max || ""; $("weeklyIdeal").value = ideal || "";

    // Calendario del mes
    $("calLabel").textContent = new Intl.DateTimeFormat("es-CO",{month:"long",year:"numeric"}).format(calMonth);
    const last = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 0);
    let html = "", cur = startOfWeek(calMonth);
    while(cur <= last){
      const t = weekTotals(cur, map), gw = goalFor(cur), k = dayKey(cur); let cells = "";
      for(let i=0;i<7;i++){
        const d = addDays(cur,i), dk = dayKey(d), e = map[dk], cls = ["cal-day"];
        if(d.getMonth()!==calMonth.getMonth()) cls.push("out");
        if(dk===todayKey) cls.push("today");
        if(dk===selectedDay) cls.push("sel");
        cells += `<button type="button" class="${cls.join(" ")}" data-day="${dk}"><span class="d">${d.getDate()}</span>${e?`<span class="v${e.future?" future":""}">${compact(e.total)}</span>`:""}</button>`;
      }
      html += `<div class="cal-week${k===wsKey?" sel":""}"><div class="cal-days">${cells}</div>
        <button type="button" class="cal-sum" data-week="${k}"><span>${shortDate(cur)} – ${shortDate(addDays(cur,6))}</span><strong>${money(t.total)}${gw.max?` <em>de ${money(gw.max)}</em>`:""}</strong></button>${weekBar(t.total, gw)}</div>`;
      cur = addDays(cur,7);
    }
    $("calWeeks").innerHTML = html;

    // Detalle del día seleccionado
    const e = map[selectedDay];
    $("dayTitle").textContent = new Intl.DateTimeFormat("es-CO",{weekday:"long",day:"numeric",month:"long"}).format(parseKey(selectedDay));
    $("dayTotal").textContent = e ? `Gastos del día: ${money(e.total)}` : "Sin gastos";
    $("dayList").innerHTML = e ? [...e.list].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(movementHTML).join("") : '<div class="empty">No hay gastos registrados este día.</div>';
  }

  /* ---------- Navegación ---------- */
  const titles={
    dashboard:["Resumen","Tu dinero, de un vistazo."],
    add:["Movimiento","Registra un ingreso, gasto o compra con tarjeta."],
    history:["Historial","Encuentra cualquier movimiento rápidamente."],
    calendar:["Calendario","Tu gasto semanal frente a tu meta."],
    card:["Tarjeta","Tus compras a crédito y sus fechas de pago."],
    categories:["Categorías","Organiza tus ingresos y gastos."],
    goals:["Objetivos","Convierte tus planes en progreso."]
  };
  function navigate(page){
    document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));
    document.querySelectorAll(".nav button,.bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
    $("pageTitle").textContent=titles[page][0];$("pageSubtitle").textContent=titles[page][1];
    $("sidebar").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"});
  }
  document.addEventListener("click",e=>{
    const nav=e.target.closest("[data-page]"); if(nav){navigate(nav.dataset.page);return}
    const dd=e.target.closest("[data-day]");if(dd){selectedDay=dd.dataset.day;renderCalendar();return}
    const wk=e.target.closest("[data-week]");if(wk){const st=parseKey(wk.dataset.week),cu=parseKey(selectedDay);if(cu<st||cu>addDays(st,6))selectedDay=wk.dataset.week;renderCalendar();return}
    const wn=e.target.closest("[data-week-prev],[data-week-next]");if(wn){const nd=addDays(parseKey(selectedDay),wn.hasAttribute("data-week-next")?7:-7);selectedDay=dayKey(nd);calMonth=new Date(nd.getFullYear(),nd.getMonth(),1);renderCalendar();return}
    if(e.target.closest("[data-cal-prev]")){calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()-1,1);renderCalendar();return}
    if(e.target.closest("[data-cal-next]")){calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+1,1);renderCalendar();return}
    if(e.target.closest("[data-cal-today]")){const t=new Date();calMonth=new Date(t.getFullYear(),t.getMonth(),1);selectedDay=dayKey(t);renderCalendar();return}
    if(e.target.closest("[data-new-card]")){editingMovement=null;resetMovementForm();setType("card");navigate("add");return}
    const edit=e.target.closest("[data-edit]");if(edit){editMovement(edit.dataset.edit);return}
    const del=e.target.closest("[data-delete]");if(del){deleteMovement(del.dataset.delete);return}
    const ce=e.target.closest("[data-cat-edit]");if(ce){openCategoryEdit(ce.dataset.catEdit);return}
    const cd=e.target.closest("[data-cat-delete]");if(cd){deleteCategory(cd.dataset.catDelete);return}
    const ge=e.target.closest("[data-goal-edit]");if(ge){editGoal(ge.dataset.goalEdit);return}
    const gd=e.target.closest("[data-goal-delete]");if(gd){deleteGoal(gd.dataset.goalDelete);return}
  });
  $("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");

  /* ---------- Tema ---------- */
  function applyTheme(t){
    document.documentElement.dataset.theme=t;
    $("themeBtn").innerHTML = ic(t==="dark"?"sun":"moon");
    $("themeColor").content = t==="dark" ? "#0b0c0f" : "#f5f6f8";
  }
  $("themeBtn").onclick=()=>{
    const t=document.documentElement.dataset.theme==="dark"?"light":"dark";
    try{localStorage.setItem(THEME_KEY,t)}catch(e){}
    applyTheme(t);
  };

  /* ---------- Movimientos ---------- */
  function setType(t){
    movementType=t;
    document.querySelectorAll(".segment button").forEach(b=>{
      b.classList.remove("active","income","expense","card");
      if(b.dataset.type===t) b.classList.add("active",t);
    });
    updateCardHint();
  }
  function updateCardHint(){
    const hint=$("cardHint");
    if(movementType!=="card"){hint.hidden=true;return}
    const base = editingMovement ? new Date(data.movements.find(m=>m.id===editingMovement)?.createdAt||Date.now()) : new Date();
    const due = new Date(base.getFullYear(), base.getMonth()+1, payDay());
    hint.textContent = `Se cobrará el ${dateOnly(due)}. No afecta tu saldo ni tus gastos hasta esa fecha.`;
    hint.hidden=false;
  }
  document.querySelectorAll(".segment button").forEach(b=>b.onclick=()=>setType(b.dataset.type));

  $("movementForm").onsubmit=e=>{
    e.preventDefault();
    if(!data.categories.length){toast("Primero crea una categoría.");navigate("categories");return}
    const amount=Number($("amount").value);if(amount<=0)return;
    const createdAt = editingMovement ? data.movements.find(m=>m.id===editingMovement).createdAt : new Date().toISOString();
    const obj={id:editingMovement||crypto.randomUUID(),type:movementType,amount,categoryId:$("category").value,description:$("description").value.trim(),createdAt};
    const isCard = movementType==="card";
    if(editingMovement){data.movements=data.movements.map(m=>m.id===editingMovement?obj:m);toast("Movimiento actualizado.");}
    else{data.movements.push(obj);toast(isCard?`Compra guardada. Se cobrará el ${dateOnly(dueDate(obj))}.`:"Movimiento guardado.");}
    editingMovement=null;resetMovementForm();renderAll();navigate(isCard?"card":"dashboard");
  };
  function resetMovementForm(){
    $("movementForm").reset();setType("income");
    $("movementTitle").textContent="Registrar movimiento";$("cancelEdit").style.display="none";
  }
  $("cancelEdit").onclick=()=>{editingMovement=null;resetMovementForm();navigate("add")};
  function editMovement(id){
    const m=data.movements.find(x=>x.id===id);if(!m)return;
    editingMovement=id;$("amount").value=m.amount;$("category").value=m.categoryId;$("description").value=m.description||"";
    setType(m.type);
    $("movementTitle").textContent="Editar movimiento";$("cancelEdit").style.display="inline-block";navigate("add");
  }
  function deleteMovement(id){if(!confirm("¿Eliminar este movimiento?"))return;data.movements=data.movements.filter(m=>m.id!==id);renderAll();toast("Movimiento eliminado.");}
  $("search").oninput=renderHistory;$("filterType").onchange=renderHistory;$("filterCategory").onchange=renderHistory;$("filterFrom").onchange=renderHistory;$("filterTo").onchange=renderHistory;
  $("monthPick").onchange=renderDashboard;

  /* ---------- Tarjeta (configuración) ---------- */
  $("cardForm").onsubmit=e=>{
    e.preventDefault();
    data.settings={
      ...data.settings,
      cardName:$("cardName").value.trim()||defaultSettings.cardName,
      payDay:Math.min(5,Math.max(2,Number($("payDay").value)||5)),
      limit:Math.max(0,Number($("cardLimit").value)||0)
    };
    renderAll();toast("Tarjeta actualizada.");
  };

  /* ---------- Meta semanal (configuración) ---------- */
  function readWeekGoal(){
    const max=Math.max(0,Number($("weeklyMax").value)||0), ideal=Math.max(0,Number($("weeklyIdeal").value)||0);
    if(ideal>0 && max===0){toast("Define primero el máximo.");return null}
    if(max>0 && ideal>max){toast("El ideal no puede ser mayor que el máximo.");return null}
    return {max,ideal};
  }
  const selectedWeekKey = () => dayKey(startOfWeek(parseKey(selectedDay)));
  $("weekGoalForm").onsubmit=e=>{
    e.preventDefault();
    const g=readWeekGoal();if(!g)return;
    data.weekGoals=data.weekGoals||{};
    if(g.max===0&&g.ideal===0) delete data.weekGoals[selectedWeekKey()]; else data.weekGoals[selectedWeekKey()]=g;
    renderAll();toast("Meta de la semana guardada.");
  };
  $("applyAllBtn").onclick=()=>{
    const g=readWeekGoal();if(!g)return;
    data.settings={...data.settings,weeklyMax:g.max,weeklyIdeal:g.ideal};
    renderAll();toast("Meta general guardada para las semanas sin meta propia.");
  };
  $("clearWeekGoal").onclick=()=>{
    delete data.weekGoals[selectedWeekKey()];
    renderAll();toast("Esta semana vuelve a usar la meta general.");
  };

  /* ---------- Categorías ---------- */
  $("categoryForm").onsubmit=e=>{
    e.preventDefault();const name=$("catName").value.trim();
    if(data.categories.some(c=>c.name.toLowerCase()===name.toLowerCase())){toast("Esa categoría ya existe.");return}
    data.categories.push({id:crypto.randomUUID(),name,color:$("catColor").value});e.target.reset();renderAll();toast("Categoría creada.");
  };
  function openCategoryEdit(id){
    const c=category(id);if(!c)return;editingCategory=id;$("editCatName").value=c.name;$("editCatColor").value=c.color;$("modal").classList.add("show");
  }
  $("closeModal").onclick=()=>$("modal").classList.remove("show");
  $("modal").onclick=e=>{if(e.target===$("modal"))$("modal").classList.remove("show")};
  $("editCategoryForm").onsubmit=e=>{
    e.preventDefault();const c=category(editingCategory);const name=$("editCatName").value.trim();
    if(data.categories.some(x=>x.id!==editingCategory&&x.name.toLowerCase()===name.toLowerCase())){toast("Ese nombre ya existe.");return}
    c.name=name;c.color=$("editCatColor").value;$("modal").classList.remove("show");renderAll();toast("Categoría actualizada.");
  };
  function deleteCategory(id){
    if(data.movements.some(m=>m.categoryId===id)||data.goals.some(g=>g.categoryId===id)){toast("No puedes eliminar una categoría que está en uso.");return}
    if(!confirm("¿Eliminar esta categoría?"))return;data.categories=data.categories.filter(c=>c.id!==id);renderAll();toast("Categoría eliminada.");
  }

  /* ---------- Objetivos ---------- */
  $("goalForm").onsubmit=e=>{
    e.preventDefault();const obj={id:editingGoal||crypto.randomUUID(),name:$("goalName").value.trim(),target:Number($("goalTarget").value),categoryId:$("goalCategory").value,deadline:$("goalDate").value||""};
    if(obj.target<=0)return;
    if(editingGoal){data.goals=data.goals.map(g=>g.id===editingGoal?obj:g);toast("Objetivo actualizado.");}
    else{data.goals.push(obj);toast("Objetivo creado.");}
    editingGoal=null;resetGoalForm();renderAll();
  };
  function resetGoalForm(){$("goalForm").reset();$("goalFormTitle").textContent="Crear objetivo";$("cancelGoal").style.display="none";}
  $("cancelGoal").onclick=()=>{editingGoal=null;resetGoalForm()};
  function editGoal(id){const g=data.goals.find(x=>x.id===id);if(!g)return;editingGoal=id;$("goalName").value=g.name;$("goalTarget").value=g.target;$("goalCategory").value=g.categoryId;$("goalDate").value=g.deadline||"";$("goalFormTitle").textContent="Editar objetivo";$("cancelGoal").style.display="inline-block";navigate("goals");}
  function deleteGoal(id){if(!confirm("¿Eliminar este objetivo?"))return;data.goals=data.goals.filter(g=>g.id!==id);renderAll();toast("Objetivo eliminado.");}

  /* ---------- Reset ---------- */
  $("resetBtn").onclick=()=>{
    if(confirm("Esto eliminará todas las categorías, movimientos, objetivos y la configuración de tarjeta guardados en este navegador. ¿Continuar?")){
      localStorage.removeItem(KEY);data=load();renderAll();toast("Datos restablecidos.");
    }
  };

  /* ---------- Inicio ---------- */
  $("monthPick").value = monthOf(new Date());
  applyTheme(document.documentElement.dataset.theme||"light");
  renderAll();resetMovementForm();$("cancelEdit").style.display="none";$("cancelGoal").style.display="none";
})();