const STORAGE_KEY = "tsk-timesheet-github-v1";

const seedState = {
  users: [
    {
      id: "admin",
      role: "admin",
      name: "Игорь",
      login: "admin",
      password: "admin",
      rate: 0,
      active: true,
    },
    {
      id: "worker-yura",
      role: "worker",
      name: "Юра",
      login: "yura",
      password: "1111",
      rate: 6500,
      active: true,
    },
    {
      id: "worker-misha",
      role: "worker",
      name: "Миша",
      login: "misha",
      password: "1111",
      rate: 6500,
      active: true,
    },
  ],
  projects: [
    { id: "project-arbat", name: "Арбат", active: true },
    { id: "project-tverskaya", name: "Тверская", active: true },
    { id: "project-dmitrovka", name: "Дмитровка", active: true },
    { id: "project-mikhalkovskaya", name: "Михалковская", active: true },
  ],
  entries: [
    {
      id: crypto.randomUUID(),
      userId: "worker-yura",
      projectId: "project-arbat",
      date: "2026-07-03",
      hours: 8,
      source: "demo",
    },
    {
      id: crypto.randomUUID(),
      userId: "worker-misha",
      projectId: "project-tverskaya",
      date: "2026-07-03",
      hours: 8,
      source: "demo",
    },
  ],
};

let state = loadState();
let session = JSON.parse(sessionStorage.getItem("tsk-timesheet-session") || "null");
let activeView = "checkin";

const app = document.querySelector("#app");

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return structuredClone(seedState);
  try {
    return JSON.parse(stored);
  } catch {
    return structuredClone(seedState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setSession(user) {
  session = user ? { userId: user.id } : null;
  if (session) sessionStorage.setItem("tsk-timesheet-session", JSON.stringify(session));
  else sessionStorage.removeItem("tsk-timesheet-session");
}

function currentUser() {
  return state.users.find((user) => user.id === session?.userId) || null;
}

function money(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function byId(list, id) {
  return list.find((item) => item.id === id);
}

function projectName(id) {
  return byId(state.projects, id)?.name || "Объект удален";
}

function userName(id) {
  return byId(state.users, id)?.name || "Сотрудник удален";
}

function activeProjects() {
  return state.projects.filter((project) => project.active);
}

function activeWorkers() {
  return state.users.filter((user) => user.role === "worker" && user.active);
}

function render() {
  const user = currentUser();
  if (!user) {
    renderLogin();
    return;
  }

  const template = document.querySelector("#appTemplate").content.cloneNode(true);
  app.innerHTML = "";
  app.append(template);
  document.querySelector("#currentUserName").textContent = user.name;
  document.querySelector("#currentUserRole").textContent = user.role === "admin" ? "Администратор" : "Сотрудник";
  document.querySelector("#logoutBtn").addEventListener("click", () => {
    setSession(null);
    render();
  });

  const nav = user.role === "admin" ? adminNav() : workerNav();
  const navEl = document.querySelector("#mainNav");
  nav.forEach((item) => {
    const button = document.createElement("button");
    button.textContent = item.label;
    button.className = activeView === item.id ? "active" : "";
    button.addEventListener("click", () => {
      activeView = item.id;
      render();
    });
    navEl.append(button);
  });

  if (!nav.some((item) => item.id === activeView)) activeView = nav[0].id;
  renderView(user);
}

function renderLogin() {
  const template = document.querySelector("#loginTemplate").content.cloneNode(true);
  app.innerHTML = "";
  app.append(template);

  document.querySelector("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const login = document.querySelector("#login").value.trim();
    const password = document.querySelector("#password").value;
    const user = state.users.find((item) => item.login === login && item.password === password && item.active);
    if (!user) {
      document.querySelector("#loginError").textContent = "Неверный логин или пароль.";
      return;
    }
    activeView = user.role === "admin" ? "dashboard" : "checkin";
    setSession(user);
    render();
  });
}

function adminNav() {
  return [
    { id: "dashboard", label: "Сводка" },
    { id: "employees", label: "Сотрудники" },
    { id: "projects", label: "Объекты" },
    { id: "objects", label: "Отчет по объектам" },
    { id: "payroll", label: "Зарплатный фонд" },
  ];
}

function workerNav() {
  return [
    { id: "checkin", label: "Отметиться" },
    { id: "manual", label: "Внести дни" },
    { id: "my-days", label: "Мои рабочие дни" },
  ];
}

function renderView(user) {
  const map = {
    dashboard: renderDashboard,
    employees: renderEmployees,
    projects: renderProjects,
    objects: renderObjectReport,
    payroll: renderPayroll,
    checkin: renderCheckin,
    manual: renderManualDays,
    "my-days": renderMyDays,
  };
  map[activeView](user);
}

function renderDashboard() {
  const entriesThisMonth = entriesForMonth(monthKey());
  const totalHours = entriesThisMonth.reduce((sum, entry) => sum + Number(entry.hours), 0);
  const payroll = entriesThisMonth.reduce((sum, entry) => {
    const user = byId(state.users, entry.userId);
    return sum + (Number(entry.hours) / 8) * Number(user?.rate || 0);
  }, 0);

  view().innerHTML = `
    <section class="page">
      ${pageHead("Сводка", "Административный обзор сотрудников, объектов и начислений.")}
      <div class="metrics">
        ${metric("Сотрудники", activeWorkers().length)}
        ${metric("Активные объекты", activeProjects().length)}
        ${metric("Часов за месяц", totalHours)}
        ${metric("Начислено", money(payroll))}
      </div>
      <section class="grid-2">
        <div class="card">
          <div class="card-head"><h3>Сегодня</h3><span class="chip green">${today()}</span></div>
          ${todayList()}
        </div>
        <div class="card">
          <div class="card-head"><h3>Объекты месяца</h3></div>
          ${objectSummary(monthKey())}
        </div>
      </section>
    </section>
  `;
}

function renderEmployees() {
  view().innerHTML = `
    <section class="page">
      ${pageHead("Сотрудники", "Создание доступов и ставок. Сотрудники ставки не видят.")}
      <section class="grid-2">
        <form id="employeeForm" class="card form-grid">
          <h3>Новый сотрудник</h3>
          <label>Имя<input id="employeeName" required placeholder="Юра" /></label>
          <label>Логин<input id="employeeLogin" required placeholder="yura" /></label>
          <label>Пароль<input id="employeePassword" required placeholder="1111" /></label>
          <label>Ставка за день<input id="employeeRate" type="number" min="0" step="500" value="6500" required /></label>
          <button class="primary" type="submit">Добавить сотрудника</button>
        </form>
        <div class="card">
          <div class="card-head"><h3>Список</h3></div>
          ${employeeTable()}
        </div>
      </section>
    </section>
  `;

  document.querySelector("#employeeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const login = value("employeeLogin").trim();
    if (state.users.some((user) => user.login === login)) {
      alert("Такой логин уже есть.");
      return;
    }
    state.users.push({
      id: crypto.randomUUID(),
      role: "worker",
      name: value("employeeName").trim(),
      login,
      password: value("employeePassword"),
      rate: Number(value("employeeRate")),
      active: true,
    });
    saveState();
    render();
  });

  document.querySelectorAll("[data-toggle-user]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = byId(state.users, button.dataset.toggleUser);
      user.active = !user.active;
      saveState();
      render();
    });
  });
}

function renderProjects() {
  view().innerHTML = `
    <section class="page">
      ${pageHead("Объекты", "Активные объекты видны сотрудникам при отметке.")}
      <section class="grid-2">
        <form id="projectForm" class="card form-grid">
          <h3>Новый объект</h3>
          <label>Название<input id="projectName" required placeholder="Михалковская" /></label>
          <button class="primary" type="submit">Добавить объект</button>
        </form>
        <div class="card">
          <div class="card-head"><h3>Список объектов</h3></div>
          ${projectTable()}
        </div>
      </section>
    </section>
  `;

  document.querySelector("#projectForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.projects.push({
      id: crypto.randomUUID(),
      name: value("projectName").trim(),
      active: true,
    });
    saveState();
    render();
  });

  document.querySelectorAll("[data-toggle-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const project = byId(state.projects, button.dataset.toggleProject);
      project.active = !project.active;
      saveState();
      render();
    });
  });
}

function renderObjectReport() {
  const month = selectedMonth();
  view().innerHTML = `
    <section class="page">
      ${pageHead("Отчет по объектам", "Кто, когда и сколько работал на каждом объекте.")}
      ${monthControl(month)}
      <div class="stack">
        ${state.projects.map((project) => objectDetail(project, month)).join("")}
      </div>
    </section>
  `;
  bindMonthControl();
}

function renderPayroll() {
  const month = selectedMonth();
  view().innerHTML = `
    <section class="page">
      ${pageHead("Зарплатный фонд", "Видно только администратору.")}
      ${monthControl(month)}
      <div class="card">
        ${payrollTable(month)}
      </div>
    </section>
  `;
  bindMonthControl();
}

function renderCheckin(user) {
  const todaysEntries = state.entries.filter((entry) => entry.userId === user.id && entry.date === today());
  view().innerHTML = `
    <section class="page">
      ${pageHead("Отметиться на объекте", "Первое нажатие ставит полный рабочий день. Повторное нажатие распределяет часы.")}
      <section class="card checkin-box">
        <h2>Сегодня: ${today()}</h2>
        <button id="checkinBtn" class="big-action">Отметиться на объекте</button>
        <div class="chips">
          ${todaysEntries.length ? todaysEntries.map((entry) => `<span class="chip green">${projectName(entry.projectId)} · ${entry.hours} ч</span>`).join("") : `<span class="chip">Сегодня отметок нет</span>`}
        </div>
      </section>
    </section>
  `;
  document.querySelector("#checkinBtn").addEventListener("click", () => openProjectPicker(user));
}

function renderManualDays(user) {
  const month = selectedMonth();
  view().innerHTML = `
    <section class="page">
      ${pageHead("Внести рабочие дни", "Для пропущенных дат: выбираешь объект, месяц и отмечаешь дни.")}
      <form id="manualForm" class="card form-grid">
        <label>Объект
          <select id="manualProject" required>
            ${activeProjects().map((project) => `<option value="${project.id}">${project.name}</option>`).join("")}
          </select>
        </label>
        ${monthControl(month)}
        <div class="month-days" id="monthDays">${monthButtons(month)}</div>
        <button class="primary" type="submit">Сохранить выбранные дни</button>
      </form>
    </section>
  `;
  bindMonthControl();
  const selected = new Set();
  document.querySelectorAll("[data-day]").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("selected");
      if (selected.has(button.dataset.day)) selected.delete(button.dataset.day);
      else selected.add(button.dataset.day);
    });
  });
  document.querySelector("#manualForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const projectId = value("manualProject");
    selected.forEach((date) => upsertEntry(user.id, projectId, date, 8, "manual"));
    saveState();
    activeView = "my-days";
    render();
  });
}

function renderMyDays(user) {
  const month = selectedMonth();
  const entries = state.entries.filter((entry) => entry.userId === user.id && entry.date.startsWith(month));
  view().innerHTML = `
    <section class="page">
      ${pageHead("Мои рабочие дни", "Сотрудник видит только свои отметки без ставок и начислений.")}
      ${monthControl(month)}
      <div class="card">
        ${entries.length ? workerEntriesTable(entries) : `<div class="empty">За этот месяц отметок нет.</div>`}
      </div>
    </section>
  `;
  bindMonthControl();
}

function view() {
  return document.querySelector("#view");
}

function value(id) {
  return document.querySelector(`#${id}`).value;
}

function pageHead(title, text) {
  return `
    <header class="page-head">
      <div>
        <p class="eyebrow">TSK табель</p>
        <h1>${title}</h1>
        <p>${text}</p>
      </div>
    </header>
  `;
}

function metric(label, valueText) {
  return `<div class="metric"><span>${label}</span><strong>${valueText}</strong></div>`;
}

function todayList() {
  const rows = state.entries.filter((entry) => entry.date === today());
  if (!rows.length) return `<div class="empty">Сегодня отметок нет.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Сотрудник</th><th>Объект</th><th>Часы</th></tr></thead>
        <tbody>${rows.map((entry) => `<tr><td>${userName(entry.userId)}</td><td>${projectName(entry.projectId)}</td><td>${entry.hours}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function objectSummary(month) {
  const projects = state.projects.map((project) => {
    const hours = state.entries
      .filter((entry) => entry.projectId === project.id && entry.date.startsWith(month))
      .reduce((sum, entry) => sum + Number(entry.hours), 0);
    return `<span class="chip ${hours ? "green" : ""}">${project.name}: ${hours} ч</span>`;
  });
  return `<div class="chips">${projects.join("")}</div>`;
}

function employeeTable() {
  const rows = state.users
    .filter((user) => user.role === "worker")
    .map(
      (user) => `
        <tr>
          <td>${user.name}</td>
          <td>${user.login}</td>
          <td>${money(user.rate)}</td>
          <td>${user.active ? "Активен" : "Отключен"}</td>
          <td><button class="ghost" data-toggle-user="${user.id}">${user.active ? "Отключить" : "Включить"}</button></td>
        </tr>
      `,
    )
    .join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Имя</th><th>Логин</th><th>Ставка</th><th>Статус</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function projectTable() {
  const rows = state.projects
    .map(
      (project) => `
        <tr>
          <td>${project.name}</td>
          <td>${project.active ? "Активен" : "Архив"}</td>
          <td><button class="ghost" data-toggle-project="${project.id}">${project.active ? "В архив" : "Вернуть"}</button></td>
        </tr>
      `,
    )
    .join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Объект</th><th>Статус</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function selectedMonth() {
  return localStorage.getItem("tsk-timesheet-month") || monthKey();
}

function monthControl(month) {
  return `<label class="card">Месяц<input id="monthControl" type="month" value="${month}" /></label>`;
}

function bindMonthControl() {
  const control = document.querySelector("#monthControl");
  if (!control) return;
  control.addEventListener("change", () => {
    localStorage.setItem("tsk-timesheet-month", control.value);
    render();
  });
}

function entriesForMonth(month) {
  return state.entries.filter((entry) => entry.date.startsWith(month));
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function monthButtons(month) {
  return Array.from({ length: daysInMonth(month) }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    const date = `${month}-${day}`;
    return `<button type="button" class="day-btn" data-day="${date}">${index + 1}</button>`;
  }).join("");
}

function objectDetail(project, month) {
  const entries = state.entries.filter((entry) => entry.projectId === project.id && entry.date.startsWith(month));
  if (!entries.length) {
    return `<section class="card"><div class="card-head"><h3>${project.name}</h3><span class="chip">нет отметок</span></div></section>`;
  }
  const byWorker = activeWorkers()
    .map((worker) => {
      const workerEntries = entries.filter((entry) => entry.userId === worker.id);
      if (!workerEntries.length) return "";
      const dates = workerEntries.map((entry) => `${entry.date.slice(8)} (${entry.hours}ч)`).join(", ");
      const hours = workerEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);
      return `<tr><td>${worker.name}</td><td>${dates}</td><td>${hours}</td></tr>`;
    })
    .join("");
  return `
    <section class="card">
      <div class="card-head"><h3>${project.name}</h3><span class="chip green">${entries.reduce((sum, entry) => sum + Number(entry.hours), 0)} ч</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Сотрудник</th><th>Даты</th><th>Часы</th></tr></thead>
          <tbody>${byWorker}</tbody>
        </table>
      </div>
    </section>
  `;
}

function payrollTable(month) {
  const rows = activeWorkers()
    .map((worker) => {
      const entries = state.entries.filter((entry) => entry.userId === worker.id && entry.date.startsWith(month));
      const hours = entries.reduce((sum, entry) => sum + Number(entry.hours), 0);
      const days = hours / 8;
      const amount = days * Number(worker.rate || 0);
      return `<tr><td>${worker.name}</td><td>${hours}</td><td>${days.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</td><td>${money(worker.rate)}</td><td>${money(amount)}</td></tr>`;
    })
    .join("");
  const total = activeWorkers().reduce((sum, worker) => {
    const hours = state.entries
      .filter((entry) => entry.userId === worker.id && entry.date.startsWith(month))
      .reduce((entrySum, entry) => entrySum + Number(entry.hours), 0);
    return sum + (hours / 8) * Number(worker.rate || 0);
  }, 0);
  return `
    <div class="card-head"><h3>Начисления за ${month}</h3><span class="chip gold">${money(total)}</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Сотрудник</th><th>Часы</th><th>Дни</th><th>Ставка</th><th>Начислено</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function workerEntriesTable(entries) {
  const rows = entries
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => `<tr><td>${entry.date}</td><td>${projectName(entry.projectId)}</td><td>${entry.hours}</td></tr>`)
    .join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Дата</th><th>Объект</th><th>Часы</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function openProjectPicker(user) {
  if (!activeProjects().length) {
    alert("Администратор еще не добавил активные объекты.");
    return;
  }
  openModal(
    "Выбери объект",
    `<div class="project-list">${activeProjects().map((project) => `<button class="project-choice" data-project-choice="${project.id}">${project.name}</button>`).join("")}</div>`,
  );
  document.querySelectorAll("[data-project-choice]").forEach((button) => {
    button.addEventListener("click", () => handleProjectChoice(user, button.dataset.projectChoice));
  });
}

function handleProjectChoice(user, projectId) {
  const entries = state.entries.filter((entry) => entry.userId === user.id && entry.date === today());
  const existing = entries.find((entry) => entry.projectId === projectId);
  if (!entries.length) {
    state.entries.push({
      id: crypto.randomUUID(),
      userId: user.id,
      projectId,
      date: today(),
      hours: 8,
      source: "checkin",
    });
    saveState();
    closeModal();
    render();
    return;
  }
  if (existing) {
    closeModal();
    openHoursModal(user, entries);
    return;
  }
  if (entries.length >= 3) {
    const ok = confirm("Уже выбрано 3 объекта за сегодня. Точно работали еще на одном объекте? Проверьте дату.");
    if (!ok) return;
  }
  openHoursModal(user, [
    ...entries,
    {
      id: crypto.randomUUID(),
      userId: user.id,
      projectId,
      date: today(),
      hours: 0,
      source: "checkin",
    },
  ]);
}

function openHoursModal(user, entries) {
  const body = `
    <form id="hoursForm" class="form-grid">
      <div class="notice">Распределите часы между объектами за ${today()}.</div>
      ${entries
        .map(
          (entry) => `
            <label>${projectName(entry.projectId)}
              <input type="number" min="0" max="24" step="0.5" value="${entry.hours || ""}" data-hours-project="${entry.projectId}" />
            </label>
          `,
        )
        .join("")}
      <button class="primary" type="submit">Сохранить часы</button>
    </form>
  `;
  openModal("Разбить день по часам", body);
  document.querySelector("#hoursForm").addEventListener("submit", (event) => {
    event.preventDefault();
    document.querySelectorAll("[data-hours-project]").forEach((input) => {
      upsertEntry(user.id, input.dataset.hoursProject, today(), Number(input.value || 0), "checkin");
    });
    state.entries = state.entries.filter((entry) => entry.hours > 0);
    saveState();
    closeModal();
    render();
  });
}

function upsertEntry(userId, projectId, date, hours, source) {
  const existing = state.entries.find((entry) => entry.userId === userId && entry.projectId === projectId && entry.date === date);
  if (existing) {
    existing.hours = hours;
    existing.source = source;
    return;
  }
  state.entries.push({
    id: crypto.randomUUID(),
    userId,
    projectId,
    date,
    hours,
    source,
  });
}

function openModal(title, body) {
  const template = document.querySelector("#modalTemplate").content.cloneNode(true);
  document.body.append(template);
  document.querySelector("#modalTitle").textContent = title;
  document.querySelector("#modalBody").innerHTML = body;
  document.querySelector("#modalClose").addEventListener("click", closeModal);
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
}

render();
