(() => {
  const KEY = "finova_data_v1";
  const defaultCategories = [
    {id:crypto.randomUUID(), name:"Alimentación", color:"#64e6c3"},
    {id:crypto.randomUUID(), name:"Transporte", color:"#55a8ff"},
    {id:crypto.randomUUID(), name:"Vivienda", color:"#b18cff"},
    {id:crypto.randomUUID(), name:"Salud", color:"#ff8f9f"},
    {id:crypto.randomUUID(), name:"Entretenimiento", color:"#ffc857"},
    {id:crypto.randomUUID(), name:"Salario", color:"#6ee7ff"}
  ];
  let data = load();
  let movementType = "income";
  let editingMovement = null;
  let editingCategory = null;
  let editingGoal = null;

  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(Number(n)||0);
  const dateTime = iso => new Intl.DateTimeFormat("es-CO",{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));
  const dateOnly = iso => new Intl.DateTimeFormat("es-CO",{dateStyle:"medium"}).format(new Date(iso));
  const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY));
      if(saved && saved.categories && saved.movements && saved.goals) return saved;
    }catch(e){}
    return {categories:defaultCategories,movements:[],goals:[]};
  }
  function save(){localStorage.setItem(KEY,JSON.stringify(data));}
  function toast(msg){
    $("toast").textContent=msg;$("toast").classList.add("show");
    clearTimeout(window.__toast);window.__toast=setTimeout(()=>$("toast").classList.remove("show"),2300);
  }
  function category(id){return data.categories.find(c=>c.id===id)}
  function progress(goal){
    const total=data.movements.filter(m=>m.categoryId===goal.categoryId && m.type==="income").reduce((s,m)=>s+m.amount,0);
    return Math.min(100,(total/goal.target)*100);
  }
  function renderAll(){renderCategories();renderSelects();renderDashboard();renderHistory();renderGoals();save();}
  function renderSelects(){
    const opts=data.categories.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    const current=$("category").value, currentGoal=$("goalCategory").value, currentFilter=$("filterCategory").value;
    $("category").innerHTML=opts || '<option value="">Crea una categoría primero</option>';
    $("goalCategory").innerHTML=opts || '<option value="">Crea una categoría primero</option>';
    $("filterCategory").innerHTML='<option value="">Todas las categorías</option>'+opts;
    if([...$("category").options].some(o=>o.value===current)) $("category").value=current;
    if([...$("goalCategory").options].some(o=>o.value===currentGoal)) $("goalCategory").value=currentGoal;
    $("filterCategory").value=currentFilter;
  }
  function renderDashboard(){
    const income=data.movements.filter(m=>m.type==="income").reduce((s,m)=>s+m.amount,0);
    const expense=data.movements.filter(m=>m.type==="expense").reduce((s,m)=>s+m.amount,0);
    $("statIncome").textContent=money(income);$("statExpense").textContent=money(expense);
    $("statBalance").textContent=money(income-expense);$("statCount").textContent=data.movements.length;
    const recent=[...data.movements].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6);
    $("recentMovements").innerHTML=recent.length?recent.map(movementHTML).join(""):'<div class="empty">Aún no hay movimientos.<br>Registra tu primer ingreso o gasto.</div>';
    const goals=data.goals.slice(0,3);
    $("dashboardGoals").innerHTML=goals.length?goals.map(goalHTML).join(""):'<div class="empty">Crea una meta para empezar a medir tu progreso.</div>';
  }
  function movementHTML(m){
    const c=category(m.categoryId), sign=m.type==="income"?"+":"−";
    return `<div class="movement">
      <div class="m-icon ${m.type==="income"?"i":"e"}">${m.type==="income"?"↗":"↘"}</div>
      <div class="m-main"><strong>${escapeHtml(m.description||c?.name||"Movimiento")}</strong><span>${escapeHtml(c?.name||"Categoría eliminada")} · ${dateTime(m.createdAt)}</span></div>
      <div class="m-amount ${m.type}">${sign}${money(m.amount)}</div>
      <div class="m-actions"><button class="mini" title="Editar" data-edit="${m.id}">✎</button><button class="mini" title="Eliminar" data-delete="${m.id}">×</button></div>
    </div>`;
  }
  function renderHistory(){
    const q=$("search").value.trim().toLowerCase(), type=$("filterType").value, cat=$("filterCategory").value;
    const from=$("filterFrom").value?new Date($("filterFrom").value+"T00:00:00"):null;
    const to=$("filterTo").value?new Date($("filterTo").value+"T23:59:59"):null;
    const rows=[...data.movements].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).filter(m=>{
      const c=category(m.categoryId);
      const text=(m.description+" "+(c?.name||"")).toLowerCase();
      const d=new Date(m.createdAt);
      return (!q||text.includes(q))&&(!type||m.type===type)&&(!cat||m.categoryId===cat)&&(!from||d>=from)&&(!to||d<=to);
    });
    $("historyCount").textContent=`${rows.length} resultado${rows.length===1?"":"s"}`;
    $("historyBody").innerHTML=rows.length?rows.map(m=>{
      const c=category(m.categoryId);
      return `<tr><td>${dateTime(m.createdAt)}</td><td><span class="badge ${m.type==="income"?"i":"e"}">${m.type==="income"?"Ingreso":"Gasto"}</span></td>
      <td>${escapeHtml(c?.name||"—")}</td><td>${escapeHtml(m.description||"—")}</td><td class="${m.type}"><strong>${m.type==="income"?"+":"−"}${money(m.amount)}</strong></td>
      <td><button class="mini" data-edit="${m.id}">✎</button><button class="mini" data-delete="${m.id}">×</button></td></tr>`;
    }).join(""):'<tr><td colspan="6"><div class="empty">No hay movimientos que coincidan con los filtros.</div></td></tr>';
  }
  function renderCategories(){
    $("categoryCount").textContent=data.categories.length;
    $("categoryList").innerHTML=data.categories.length?data.categories.map(c=>`<div class="category-item">
      <span class="dot" style="--c:${c.color}"></span><div class="grow"><strong>${escapeHtml(c.name)}</strong></div>
      <div class="category-actions"><button class="mini" data-cat-edit="${c.id}">✎</button><button class="mini" data-cat-delete="${c.id}">×</button></div>
    </div>`).join(""):'<div class="empty">No tienes categorías.</div>';
  }
  function goalHTML(g, card=false){
    const c=category(g.categoryId), p=progress(g);
    return `<div class="${card?"card goal-card":"goal"}">
      ${card?`<button class="mini goal-delete" data-goal-delete="${g.id}">×</button>`:""}
      <div class="goal-top"><strong>${escapeHtml(g.name)}</strong><span>${p.toFixed(0)}%</span></div>
      <div class="goal-meta">${escapeHtml(c?.name||"Sin categoría")} ${g.deadline?"· hasta "+dateOnly(g.deadline):""}</div>
      <div class="progress"><span style="width:${p}%"></span></div>
      <div class="goal-meta"><strong style="color:var(--text)">${money(g.current||0)}</strong> de ${money(g.target)}</div>
      ${card?`<div class="actions" style="margin-top:8px"><button class="btn" data-goal-edit="${g.id}">Editar</button></div>`:""}
    </div>`;
  }
  function renderGoals(){
    data.goals.forEach(g=>g.current=data.movements.filter(m=>m.categoryId===g.categoryId&&m.type==="income").reduce((s,m)=>s+m.amount,0));
    $("goalList").innerHTML=data.goals.length?data.goals.map(g=>goalHTML(g,true)).join(""):'<div class="card empty" style="grid-column:1/-1">Todavía no tienes objetivos. Crea el primero arriba.</div>';
    $("dashboardGoals").innerHTML=data.goals.slice(0,3).map(g=>goalHTML(g)).join("")||'<div class="empty">Crea una meta para empezar a medir tu progreso.</div>';
  }

  const titles={dashboard:["Resumen financiero","Tu dinero, de un vistazo."],add:["Nuevo movimiento","Registra un ingreso o gasto."],history:["Historial","Encuentra cualquier movimiento rápidamente."],categories:["Categorías","Organiza tus ingresos y gastos."],goals:["Objetivos financieros","Convierte tus planes en progreso."]};
  function navigate(page){
    document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));
    document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
    $("pageTitle").textContent=titles[page][0];$("pageSubtitle").textContent=titles[page][1];
    $("sidebar").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"});
  }
  document.addEventListener("click",e=>{
    const nav=e.target.closest("[data-page]"); if(nav){navigate(nav.dataset.page);return}
    const edit=e.target.closest("[data-edit]");if(edit){editMovement(edit.dataset.edit);return}
    const del=e.target.closest("[data-delete]");if(del){deleteMovement(del.dataset.delete);return}
    const ce=e.target.closest("[data-cat-edit]");if(ce){openCategoryEdit(ce.dataset.catEdit);return}
    const cd=e.target.closest("[data-cat-delete]");if(cd){deleteCategory(cd.dataset.catDelete);return}
    const ge=e.target.closest("[data-goal-edit]");if(ge){editGoal(ge.dataset.goalEdit);return}
    const gd=e.target.closest("[data-goal-delete]");if(gd){deleteGoal(gd.dataset.goalDelete);return}
  });
  $("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");

  document.querySelectorAll(".segment button").forEach(b=>b.onclick=()=>{
    movementType=b.dataset.type;
    document.querySelectorAll(".segment button").forEach(x=>x.classList.remove("active","income","expense"));
    b.classList.add("active",movementType);
  });
  $("movementForm").onsubmit=e=>{
    e.preventDefault();
    if(!data.categories.length){toast("Primero crea una categoría.");navigate("categories");return}
    const amount=Number($("amount").value);if(amount<=0)return;
    const obj={id:editingMovement||crypto.randomUUID(),type:movementType,amount,categoryId:$("category").value,description:$("description").value.trim(),createdAt:editingMovement?data.movements.find(m=>m.id===editingMovement).createdAt:new Date().toISOString()};
    if(editingMovement){data.movements=data.movements.map(m=>m.id===editingMovement?obj:m);toast("Movimiento actualizado.");}
    else{data.movements.push(obj);toast("Movimiento guardado.");}
    editingMovement=null;resetMovementForm();renderAll();navigate("dashboard");
  };
  function resetMovementForm(){$("movementForm").reset();movementType="income";document.querySelectorAll(".segment button").forEach((b,i)=>{b.classList.toggle("active",i===0);b.classList.toggle("income",i===0);b.classList.toggle("expense",i===1)});$("movementTitle").textContent="Registrar movimiento";$("cancelEdit").style.display="none"}
  $("cancelEdit").onclick=()=>{editingMovement=null;resetMovementForm();navigate("add")};
  function editMovement(id){
    const m=data.movements.find(x=>x.id===id);if(!m)return;
    editingMovement=id;movementType=m.type;$("amount").value=m.amount;$("category").value=m.categoryId;$("description").value=m.description||"";
    document.querySelectorAll(".segment button").forEach(b=>{b.classList.toggle("active",b.dataset.type===m.type);b.classList.toggle("income",b.dataset.type==="income"&&m.type==="income");b.classList.toggle("expense",b.dataset.type==="expense"&&m.type==="expense")});
    $("movementTitle").textContent="Editar movimiento";$("cancelEdit").style.display="inline-block";navigate("add");
  }
  function deleteMovement(id){if(!confirm("¿Eliminar este movimiento?"))return;data.movements=data.movements.filter(m=>m.id!==id);renderAll();toast("Movimiento eliminado.");}
  $("search").oninput=renderHistory;$("filterType").onchange=renderHistory;$("filterCategory").onchange=renderHistory;$("filterFrom").onchange=renderHistory;$("filterTo").onchange=renderHistory;

  $("categoryForm").onsubmit=e=>{
    e.preventDefault();const name=$("catName").value.trim();
    if(data.categories.some(c=>c.name.toLowerCase()===name.toLowerCase())){toast("Esa categoría ya existe.");return}
    data.categories.push({id:crypto.randomUUID(),name,color:$("catColor").value});e.target.reset();$("catColor").value="#64e6c3";renderAll();toast("Categoría creada.");
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

  $("resetBtn").onclick=()=>{
    if(confirm("Esto eliminará todas las categorías, movimientos y objetivos guardados en este navegador. ¿Continuar?")){
      localStorage.removeItem(KEY);data=load();renderAll();toast("Datos restablecidos.");
    }
  };
  renderAll();resetMovementForm();$("cancelEdit").style.display="none";$("cancelGoal").style.display="none";
})();