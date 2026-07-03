const STORAGE_KEY = "tsk-timesheet-github-v2";
const OLD_STORAGE_KEY = "tsk-timesheet-github-v1";
const MONTH_KEY = "tsk-timesheet-month";
const MY_DAYS_MODE_KEY = "tsk-my-days-mode";

const projectStatuses = {
  active: "В работе",
  paused: "На паузе",
  archived: "Архив",
};

const seedState = {
  users: [
    {
      id: "admin",
      role: "admin",
      name: "Игорь",
      position: "Руководитель",
      login: "admin",
      password: "admin",
      rate: 0,
      active: true,
    },
    {
      id: "worker-yura",
      role: "worker",
      name: "Юра",
      position: "Мастер",
      login: "yura",
      password: "1111",
      rate: 6500,
      active: true,
    },
    {
      id: "worker-misha",
      role: "worker",
      name: "Миша",
      position: "Мастер",
      login: "misha",
      password: "1111",
      rate: 6500,
      active: true,
    },
  ],
  projects: [
    { id: "project-arbat", name: "Арбат", status: "active" },
    { id: "project-tverskaya", name: "Тверская", status: "active" },
    { id: "project-dmitrovka", name: "Дмитровка", status: "active" },
    { id: "project-mikhalkovskaya", name: "Михалковская", status: "active" },
  ],
  entries: [
    {
      id: crypto.randomUUID(),
      userId: "worker-yura",
      projectId: "project-arbat",
      date: "2026-07-03",
      source: "demo",
    },
    {
      id: crypto.randomUUID(),
      userId: "worker-misha",
      projectId: "project-tverskaya",
      date: "2026-07-03",
      source: "demo",
    },
  ],
  requests: [],
};

let state = loadState();
let session = JSON.parse(sessionStorage.getItem("tsk-timesheet-session") || "null");
let activeView = currentUser()?.role === "admin" ? "presence" : "checkin";
const app = document.querySelector("#app");

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
  if (!stored) return clone(seedState);
  try {
    return normalizeState(JSON.parse(stored));
  } catch {
    return clone(seedState);
  }
}

function normalizeState(data) {
  const normalized = {
    users: Array.isArray(data.users) ? data.users : seedState.users,
    projects: Array.isArray(data.projects) ? data.projects : seedState.projects,
    entries: Array.isArray(data.entries) ? data.entries : [],
    requests: Array.isArray(data.requests) ? data.requests : [],
  };
  normalized.users = normalized.users.map((user) => ({
    ...user,
    position: user.position || (user.role === "admin" ? "Руководитель" : "Сотрудник"),
    active: user.active !== false,
  }));
  normalized.projects = normalized.projects.map((project) => ({
    ...project,
    status: project.status || (project.active === false ? "archived" : "active"),
  }));
  normalized.entries = normalized.entries.map((entry) => ({
    id: entry.id || crypto.randomUUID(),
    userId: entry.userId,
    projectId: entry.projectId,
    date: entry.date,
    source: entry.source || "checkin",
  }));
  return normalized;
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function selectedMonth() {
  return localStorage.getItem(MONTH_KEY) || monthKey();
}

function money(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
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
  return state.projects.filter((project) => project.status === "active");
}

function visibleProjects() {
  return [
    ...state.projects.filter((project) => project.status === "active"),
    ...state.projects.filter((project) => project.status === "paused"),
    ...state.projects.filter((project) => project.status === "archived"),
  ];
}

function workers(includeDisabled = false) {
  return state.users.filter((user) => user.role === "worker" && (includeDisabled || user.active));
}

function entriesForUserDate(userId, date) {
  return state.entries.filter((entry) => entry.userId === userId && entry.date === date);
}

function entriesForMonth(month) {
  return state.entries.filter((entry) => entry.date.startsWith(month));
}

function uniqueDatesForUser(userId, month) {
  return [...new Set(state.entries.filter((entry) => entry.userId === userId && entry.date.startsWith(month)).map((entry) => entry.date))];
}

function allocationFor(entry) {
  const sameDay = entriesForUserDate(entry.userId, entry.date);
  return sameDay.length ? 1 / sameDay.length : 1;
}

function roundedProjectMoney(entry) {
  const user = byId(state.users, entry.userId);
  const raw = Number(user?.rate || 0) * allocationFor(entry);
  return Math.round(raw / 100) * 100;
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
  document.querySelector("#currentUserRole").textContent = user.role === "admin" ? "Администратор" : user.position || "Сотрудник";
  document.querySelector("#logoutBtn").addEventListener("click", () => {
    setSession(null);
    render();
  });

  const nav = user.role === "admin" ? adminNav() : workerNav();
  if (!nav.some((item) => item.id === activeView)) activeView = nav[0].id;
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
    activeView = user.role === "admin" ? "presence" : "checkin";
    setSession(user);
    render();
  });
}

function adminNav() {
  return [
    { id: "presence", label: "Сотрудники на объектах" },
    { id: "summary", label: "Сводка" },
    { id: "employees", label: "Сотрудники" },
    { id: "projects", label: "Объекты" },
    { id: "objects", label: "Отчет по объектам" },
    { id: "payroll", label: "Зарплатный фонд" },
    { id: "requests", label: "Корректировки" },
  ];
}

function workerNav() {
  return [
    { id: "checkin", label: "Отметиться" },
    { id: "manual", label: "Внести дни" },
    { id: "my-days", label: "Мои рабочие дни" },
    { id: "correction", label: "Корректировка" },
  ];
}

function renderView(user) {
  const map = {
    presence: renderPresence,
    summary: renderSummary,
    employees: renderEmployees,
    projects: renderProjects,
    objects: renderObjectReport,
    payroll: renderPayroll,
    requests: renderRequests,
    checkin: renderCheckin,
    manual: renderManualDays,
    "my-days": renderMyDays,
    correction: renderCorrectionRequest,
  };
  map[activeView](user);
}

function renderPresence() {
  view().innerHTML = `
    <section class="page">
      ${pageHead("Сотрудники на объектах", "Кто сегодня уже отметился и на каком объекте находится.")}
      <div class="presence-list">
        ${workers(true).map((worker) => presenceRow(worker)).join("")}
      </div>
    </section>
  `;
}

function presenceRow(worker) {
  const entries = entriesForUserDate(worker.id, today());
  const projects = entries.map((entry) => projectName(entry.projectId)).join(", ");
  return `
    <article class="presence-row ${worker.active ? "" : "muted-row"}">
      <div>
        <strong>${worker.name}</strong>
        <span>${worker.position || "Сотрудник"}</span>
      </div>
      <div class="presence-object">${projects || "Сегодня отметки нет"}</div>
    </article>
  `;
}

function renderSummary() {
  const month = selectedMonth();
  view().innerHTML = `
    <section class="page">
      ${pageHead("Сводка", "Сотрудники и количество рабочих дней за выбранный месяц.")}
      ${monthControl(month)}
      <div class="card">
        ${summaryTable(month)}
      </div>
    </section>
  `;
  bindMonthControl();
}

function renderEmployees() {
  view().innerHTML = `
    <section class="page">
      ${pageHead("Сотрудники", "Доступы, должности и ставки. Сотрудник ставку не видит.")}
      <section class="grid-2">
        <form id="employeeForm" class="card form-grid">
          <h3>Новый сотрудник</h3>
          <label>Имя<input id="employeeName" required placeholder="Имя" /></label>
          <label>Должность<input id="employeePosition" required placeholder="Маляр" /></label>
          <label>Логин<input id="employeeLogin" required placeholder="Логин" /></label>
          <label>Пароль<input id="employeePassword" required placeholder="Пароль" /></label>
          <label>Ставка в день<input id="employeeRate" type="number" min="0" step="500" placeholder="5000" required /></label>
          <button class="primary" type="submit">Добавить сотрудника</button>
        </form>
        <div class="card">
          <div class="card-head"><h3>Список сотрудников</h3></div>
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
      position: value("employeePosition").trim(),
      login,
      password: value("employeePassword"),
      rate: Number(value("employeeRate")),
      active: true,
    });
    saveState();
    render();
  });
  bindEmployeeActions();
}

function renderProjects() {
  view().innerHTML = `
    <section class="page">
      ${pageHead("Объекты", "Сотрудникам при отметке видны только объекты в работе.")}
      <section class="grid-2">
        <form id="projectForm" class="card form-grid">
          <h3>Новый объект</h3>
          <label>Название<input id="projectName" required placeholder="Арбат" /></label>
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
      status: "active",
    });
    saveState();
    render();
  });
  bindProjectActions();
}

function renderObjectReport() {
  const month = selectedMonth();
  const opened = localStorage.getItem("tsk-open-project");
  const project = state.projects.find((item) => item.id === opened);
  view().innerHTML = `
    <section class="page">
      ${pageHead("Отчет по объектам", "Выбери объект и открой месячный табель по сотрудникам.")}
      ${monthControl(month)}
      ${project ? projectMonthReport(project, month) : projectButtons()}
    </section>
  `;
  bindMonthControl();
  document.querySelectorAll("[data-open-project]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.setItem("tsk-open-project", button.dataset.openProject);
      render();
    });
  });
  document.querySelector("[data-back-projects]")?.addEventListener("click", () => {
    localStorage.removeItem("tsk-open-project");
    render();
  });
}

function renderPayroll() {
  const month = selectedMonth();
  view().innerHTML = `
    <section class="page">
      ${pageHead("Зарплатный фонд", "Оплата считается по рабочим дням. Несколько объектов в один день не увеличивают зарплату сотрудника.")}
      ${monthControl(month)}
      <div class="card">
        ${payrollTable(month)}
      </div>
    </section>
  `;
  bindMonthControl();
}

function renderRequests() {
  view().innerHTML = `
    <section class="page">
      ${pageHead("Корректировки", "Заявки сотрудников на исправление табеля.")}
      <div class="stack">
        ${state.requests.length ? state.requests.map(requestCard).join("") : `<div class="empty">Заявок нет.</div>`}
      </div>
    </section>
  `;
  document.querySelectorAll("[data-close-request]").forEach((button) => {
    button.addEventListener("click", () => {
      state.requests = state.requests.filter((request) => request.id !== button.dataset.closeRequest);
      saveState();
      render();
    });
  });
}

function renderCheckin(user) {
  const todaysEntries = entriesForUserDate(user.id, today());
  view().innerHTML = `
    <section class="page">
      ${pageHead("Отметиться на объекте", "Если работа идет на двух и более объектах, отметьтесь по приходе на следующий объект.")}
      <section class="card checkin-box">
        <p class="eyebrow">Сегодня</p>
        <h2>${formatDate(today())}</h2>
        <button id="checkinBtn" class="big-action">Отметиться на объекте</button>
        <div class="chips">
          ${todaysEntries.length ? todaysEntries.map((entry) => `<span class="chip green">${projectName(entry.projectId)}</span>`).join("") : `<span class="chip">Сегодня отметок нет</span>`}
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
      ${pageHead("Внести пропущенные дни", "Выбери объект, месяц и отметь нужные даты.")}
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
    selected.forEach((date) => upsertEntry(user.id, projectId, date, "manual"));
    saveState();
    activeView = "my-days";
    render();
  });
}

function renderMyDays(user) {
  const month = selectedMonth();
  const mode = localStorage.getItem(MY_DAYS_MODE_KEY) || "objects";
  const entries = state.entries.filter((entry) => entry.userId === user.id && entry.date.startsWith(month));
  view().innerHTML = `
    <section class="page">
      ${pageHead("Мои рабочие дни", "Выберите просмотр по объектам или табель по месяцу.")}
      ${monthControl(month)}
      <div class="segmented">
        <button class="${mode === "objects" ? "active" : ""}" data-days-mode="objects">По объектам</button>
        <button class="${mode === "sheet" ? "active" : ""}" data-days-mode="sheet">Табель</button>
      </div>
      <div class="card">
        ${entries.length ? (mode === "objects" ? workerObjectList(entries) : workerMonthSheet(user, month)) : `<div class="empty">За этот месяц отметок нет.</div>`}
      </div>
    </section>
  `;
  bindMonthControl();
  document.querySelectorAll("[data-days-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.setItem(MY_DAYS_MODE_KEY, button.dataset.daysMode);
      render();
    });
  });
}

function renderCorrectionRequest(user) {
  view().innerHTML = `
    <section class="page">
      ${pageHead("Заявка на корректировку", "Если прошедший день нужно исправить, отправь администратору текст заявки.")}
      <form id="requestForm" class="card form-grid">
        <label>Что исправить
          <textarea id="requestText" required rows="7" placeholder="Например: убрать Арбат за 13 июля, добавить Тверскую за 19 и 24 июля"></textarea>
        </label>
        <button class="primary" type="submit">Отправить администратору</button>
      </form>
    </section>
  `;
  document.querySelector("#requestForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.requests.unshift({
      id: crypto.randomUUID(),
      userId: user.id,
      createdAt: new Date().toISOString(),
      text: value("requestText").trim(),
    });
    saveState();
    alert("Заявка отправлена.");
    activeView = "my-days";
    render();
  });
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

function formatDate(date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function monthControl(month) {
  return `<label class="card month-control">Месяц<input id="monthControl" type="month" value="${month}" /></label>`;
}

function bindMonthControl() {
  const control = document.querySelector("#monthControl");
  if (!control) return;
  control.addEventListener("change", () => {
    localStorage.setItem(MONTH_KEY, control.value);
    render();
  });
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

function summaryTable(month) {
  const rows = workers(true)
    .map((worker) => {
      const days = uniqueDatesForUser(worker.id, month).length;
      return `<tr><td>${worker.name}</td><td>${worker.position || ""}</td><td>${days}</td><td>${worker.active ? "Активен" : "Отключен"}</td></tr>`;
    })
    .join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Сотрудник</th><th>Должность</th><th>Дней</th><th>Статус</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function employeeTable() {
  const rows = workers(true)
    .map(
      (user) => `
        <tr>
          <td><button class="link-btn" data-open-worker="${user.id}">${user.name}</button></td>
          <td>${user.position || ""}</td>
          <td>${user.login}</td>
          <td>${money(user.rate)}</td>
          <td>${user.active ? "Активен" : "Отключен"}</td>
          <td class="actions">
            <button class="ghost" data-toggle-user="${user.id}">${user.active ? "Отключить" : "Включить"}</button>
            <button class="danger" data-delete-user="${user.id}">Удалить</button>
          </td>
        </tr>
      `,
    )
    .join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Имя</th><th>Должность</th><th>Логин</th><th>Ставка</th><th>Статус</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function bindEmployeeActions() {
  document.querySelectorAll("[data-toggle-user]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = byId(state.users, button.dataset.toggleUser);
      user.active = !user.active;
      saveState();
      render();
    });
  });
  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = byId(state.users, button.dataset.deleteUser);
      if (!confirm(`Удалить сотрудника ${user.name}? Его отметки тоже будут удалены.`)) return;
      state.users = state.users.filter((item) => item.id !== user.id);
      state.entries = state.entries.filter((entry) => entry.userId !== user.id);
      saveState();
      render();
    });
  });
  document.querySelectorAll("[data-open-worker]").forEach((button) => {
    button.addEventListener("click", () => openWorkerSummary(button.dataset.openWorker));
  });
}

function openWorkerSummary(userId) {
  const user = byId(state.users, userId);
  const month = selectedMonth();
  openModal(
    user.name,
    `<div class="stack">
      <div class="notice">${user.position || "Сотрудник"} · ${uniqueDatesForUser(user.id, month).length} рабочих дней за ${month}</div>
      ${workerMonthSheet(user, month)}
    </div>`,
  );
}

function projectTable() {
  const rows = visibleProjects()
    .map(
      (project) => `
        <tr class="${project.status === "archived" ? "muted-row" : ""}">
          <td>${project.name}</td>
          <td>${projectStatuses[project.status]}</td>
          <td class="actions">
            ${
              project.status === "active"
                ? `<button class="ghost" data-project-status="${project.id}:paused">На паузу</button><button class="ghost" data-project-status="${project.id}:archived">В архив</button>`
                : `<button class="ghost" data-project-status="${project.id}:active">Активировать</button>`
            }
            <button class="danger" data-delete-project="${project.id}">Удалить</button>
          </td>
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

function bindProjectActions() {
  document.querySelectorAll("[data-project-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const [id, status] = button.dataset.projectStatus.split(":");
      byId(state.projects, id).status = status;
      saveState();
      render();
    });
  });
  document.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const project = byId(state.projects, button.dataset.deleteProject);
      if (!confirm(`Удалить объект ${project.name}? Отметки по нему тоже будут удалены.`)) return;
      state.projects = state.projects.filter((item) => item.id !== project.id);
      state.entries = state.entries.filter((entry) => entry.projectId !== project.id);
      saveState();
      render();
    });
  });
}

function projectButtons() {
  return `
    <div class="object-buttons">
      ${visibleProjects().map((project) => `<button data-open-project="${project.id}" class="object-button"><strong>${project.name}</strong><span>${projectStatuses[project.status]}</span></button>`).join("")}
    </div>
  `;
}

function projectMonthReport(project, month) {
  const entries = state.entries.filter((entry) => entry.projectId === project.id && entry.date.startsWith(month));
  return `
    <section class="card">
      <div class="card-head">
        <h3>${project.name}</h3>
        <button class="ghost" data-back-projects>К объектам</button>
      </div>
      ${entries.length ? projectCalendarTable(project, month) : `<div class="empty">За этот месяц отметок нет.</div>`}
    </section>
  `;
}

function projectCalendarTable(project, month) {
  const days = Array.from({ length: daysInMonth(month) }, (_, index) => String(index + 1).padStart(2, "0"));
  const rows = workers(true)
    .map((worker) => {
      const cells = days
        .map((day) => {
          const date = `${month}-${day}`;
          const entry = state.entries.find((item) => item.userId === worker.id && item.projectId === project.id && item.date === date);
          if (!entry) return "<td></td>";
          const several = entriesForUserDate(worker.id, date).length > 1;
          return `<td class="${several ? "mark-small" : "mark-full"}">${several ? "+" : "✓"}</td>`;
        })
        .join("");
      const objectDays = state.entries
        .filter((entry) => entry.userId === worker.id && entry.projectId === project.id && entry.date.startsWith(month))
        .reduce((sum, entry) => sum + allocationFor(entry), 0);
      return `<tr><td>${worker.name}</td><td>${objectDays.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</td>${cells}</tr>`;
    })
    .join("");
  return `
    <div class="table-wrap calendar-wrap">
      <table class="calendar-table">
        <thead><tr><th>Сотрудник</th><th>Дней объекта</th>${days.map((day) => `<th>${Number(day)}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function payrollTable(month) {
  const rows = workers(true)
    .map((worker) => {
      const days = uniqueDatesForUser(worker.id, month).length;
      const amount = days * Number(worker.rate || 0);
      return `<tr><td>${worker.name}</td><td>${worker.position || ""}</td><td>${days}</td><td>${money(worker.rate)}</td><td>${money(amount)}</td></tr>`;
    })
    .join("");
  const total = workers(true).reduce((sum, worker) => sum + uniqueDatesForUser(worker.id, month).length * Number(worker.rate || 0), 0);
  return `
    <div class="card-head"><h3>Начисления за ${month}</h3><span class="chip gold">${money(total)}</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Сотрудник</th><th>Должность</th><th>Дни</th><th>Ставка</th><th>Начислено</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function workerObjectList(entries) {
  const grouped = state.projects
    .map((project) => {
      const projectEntries = entries.filter((entry) => entry.projectId === project.id).sort((a, b) => a.date.localeCompare(b.date));
      if (!projectEntries.length) return "";
      return `
        <div class="object-line">
          <strong>${project.name}</strong>
          <span>${projectEntries.map((entry) => formatDate(entry.date)).join(", ")}</span>
        </div>
      `;
    })
    .join("");
  return grouped || `<div class="empty">Отметок нет.</div>`;
}

function workerMonthSheet(user, month) {
  const days = Array.from({ length: daysInMonth(month) }, (_, index) => String(index + 1).padStart(2, "0"));
  const rows = visibleProjects()
    .map((project) => {
      const cells = days
        .map((day) => {
          const date = `${month}-${day}`;
          const entry = state.entries.find((item) => item.userId === user.id && item.projectId === project.id && item.date === date);
          if (!entry) return "<td></td>";
          return `<td class="${entriesForUserDate(user.id, date).length > 1 ? "mark-small" : "mark-full"}">${entriesForUserDate(user.id, date).length > 1 ? "+" : "✓"}</td>`;
        })
        .join("");
      return `<tr><td>${project.name}</td>${cells}</tr>`;
    })
    .join("");
  return `
    <div class="table-wrap calendar-wrap">
      <table class="calendar-table">
        <thead><tr><th>Объект</th>${days.map((day) => `<th>${Number(day)}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function requestCard(request) {
  return `
    <article class="card request-card">
      <div class="card-head">
        <h3>${userName(request.userId)}</h3>
        <button class="ghost" data-close-request="${request.id}">Закрыть</button>
      </div>
      <p>${request.text}</p>
      <small>${new Date(request.createdAt).toLocaleString("ru-RU")}</small>
    </article>
  `;
}

function openProjectPicker(user) {
  if (!activeProjects().length) {
    alert("Администратор еще не добавил объекты в работе.");
    return;
  }
  const selected = entriesForUserDate(user.id, today()).map((entry) => entry.projectId);
  const body = `
    <div class="stack">
      ${selected.length ? `<div class="notice">Вы уже отмечены на объекте. Если пришли на второй объект, выберите объект, на котором находитесь сейчас. Если нажали ошибочно — отмените.</div>` : ""}
      <div class="project-list">
        ${activeProjects()
          .map((project) => `<button class="project-choice" ${selected.includes(project.id) ? "disabled" : ""} data-project-choice="${project.id}">${project.name}</button>`)
          .join("")}
      </div>
    </div>
  `;
  openModal("Выберите объект", body);
  document.querySelectorAll("[data-project-choice]").forEach((button) => {
    button.addEventListener("click", () => handleProjectChoice(user, button.dataset.projectChoice));
  });
}

function handleProjectChoice(user, projectId) {
  const entries = entriesForUserDate(user.id, today());
  if (entries.length >= 3) {
    const ok = confirm("Сегодня уже отмечено 3 объекта. Точно работали еще на одном объекте? Проверьте дату.");
    if (!ok) return;
  }
  upsertEntry(user.id, projectId, today(), "checkin");
  saveState();
  closeModal();
  alert("Рабочий день отмечен.");
  render();
}

function upsertEntry(userId, projectId, date, source) {
  const existing = state.entries.find((entry) => entry.userId === userId && entry.projectId === projectId && entry.date === date);
  if (existing) {
    existing.source = source;
    return;
  }
  state.entries.push({
    id: crypto.randomUUID(),
    userId,
    projectId,
    date,
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
