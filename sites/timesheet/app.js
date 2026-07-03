const STORAGE_KEY = "tsk-timesheet-github-v3";
const OLD_STORAGE_KEYS = ["tsk-timesheet-github-v2", "tsk-timesheet-github-v1"];
const MONTH_KEY = "tsk-timesheet-month";
const MY_DAYS_MODE_KEY = "tsk-my-days-mode";
const OPEN_PROJECT_KEY = "tsk-open-project";
const ADVANCE_PROJECT_ID = "__advance__";

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
      rateRules: [],
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
      rateRules: [{ id: "rate-yura-base", startDate: "2026-07-01", endDate: "", rate: 6500, note: "Базовая ставка" }],
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
      rateRules: [{ id: "rate-misha-base", startDate: "2026-07-01", endDate: "", rate: 6500, note: "Базовая ставка" }],
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
    { id: crypto.randomUUID(), userId: "worker-yura", projectId: "project-arbat", date: "2026-07-03", source: "demo" },
    { id: crypto.randomUUID(), userId: "worker-misha", projectId: "project-tverskaya", date: "2026-07-03", source: "demo" },
  ],
  requests: [],
  bonuses: [],
  payments: [],
};

let state = loadState();
let session = JSON.parse(sessionStorage.getItem("tsk-timesheet-session") || "null");
let activeView = currentUser()?.role === "worker" ? "checkin" : "presence";
let uiMessage = "";
const app = document.querySelector("#app");

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY) || OLD_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
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
    bonuses: Array.isArray(data.bonuses) ? data.bonuses : [],
    payments: Array.isArray(data.payments) ? data.payments : [],
  };
  normalized.users = normalized.users.map((user) => {
    const role = user.role === "manager" || user.role === "admin" || user.role === "worker" ? user.role : "worker";
    const rate = Number(user.rate || 0);
    const rateRules = Array.isArray(user.rateRules) && user.rateRules.length ? user.rateRules : rate ? [{ id: crypto.randomUUID(), startDate: "2026-01-01", endDate: "", rate, note: "Базовая ставка" }] : [];
    return {
      ...user,
      role,
      position: user.position || (role === "admin" ? "Руководитель" : role === "manager" ? "Администратор табеля" : "Сотрудник"),
      active: user.active !== false,
      permissions: normalizePermissions(user.permissions, role),
      rate,
      rateRules: rateRules.map((rule) => ({
        id: rule.id || crypto.randomUUID(),
        startDate: rule.startDate || "2026-01-01",
        endDate: rule.endDate || "",
        rate: Number(rule.rate || rate || 0),
        note: rule.note || "",
      })),
    };
  });
  normalized.projects = normalized.projects.map((project) => ({
    ...project,
    status: project.status || (project.active === false ? "archived" : "active"),
    nightShift: Boolean(project.nightShift),
  }));
  normalized.entries = normalized.entries
    .filter((entry) => entry.userId && entry.projectId && entry.date)
    .map((entry) => ({
      id: entry.id || crypto.randomUUID(),
      userId: entry.userId,
      projectId: entry.projectId,
      date: entry.date,
      source: entry.source || "checkin",
      checkedAt: entry.checkedAt || "",
      changedAt: entry.changedAt || "",
      secondObject: Boolean(entry.secondObject),
      night: Boolean(entry.night),
    }));
  const entryGroups = new Map();
  normalized.entries.forEach((entry) => {
    const key = `${entry.userId}:${entry.date}`;
    if (!entryGroups.has(key)) entryGroups.set(key, []);
    entryGroups.get(key).push(entry);
  });
  entryGroups.forEach((items) => {
    items.forEach((entry, index) => {
      if (index > 0) entry.secondObject = true;
    });
  });
  normalized.requests = normalized.requests.map((request) => ({
    id: request.id || crypto.randomUUID(),
    userId: request.userId,
    createdAt: request.createdAt || new Date().toISOString(),
    type: request.type || "free",
    projectId: request.projectId || "",
    month: request.month || "",
    action: request.action || "add",
    dates: Array.isArray(request.dates) ? request.dates : [],
    text: request.text || "",
  }));
  normalized.bonuses = normalized.bonuses.map((bonus) => ({
    id: bonus.id || crypto.randomUUID(),
    userId: bonus.userId,
    projectId: bonus.projectId,
    date: bonus.date || today(),
    month: bonus.month || (bonus.date || today()).slice(0, 7),
    amount: Number(bonus.amount || 0),
    note: bonus.note || "",
  }));
  normalized.payments = normalized.payments.map((payment) => ({
    id: payment.id || crypto.randomUUID(),
    userId: payment.userId,
    projectId: payment.projectId || ADVANCE_PROJECT_ID,
    month: payment.month || selectedMonth(),
    amount: Number(payment.amount || 0),
    type: payment.type || (payment.projectId && payment.projectId !== ADVANCE_PROJECT_ID ? "legacy" : "cash"),
    createdAt: payment.createdAt || new Date().toISOString(),
  }));
  return normalized;
}

function defaultPermissions(role) {
  if (role === "admin") {
    return {
      editTimesheet: true,
      addEmployee: true,
      deleteEmployee: true,
      addProject: true,
      deleteProject: true,
      bonusEmployee: true,
      payroll: true,
      deleteApprovedDays: true,
      manageAccess: true,
    };
  }
  if (role === "manager") {
    return {
      editTimesheet: true,
      addEmployee: false,
      deleteEmployee: false,
      addProject: false,
      deleteProject: false,
      bonusEmployee: false,
      payroll: false,
      deleteApprovedDays: false,
      manageAccess: false,
    };
  }
  return {};
}

function normalizePermissions(permissions, role) {
  return { ...defaultPermissions(role), ...(permissions || {}) };
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

function shiftMonth(month, delta) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1 + delta, 1).toISOString().slice(0, 7);
}

function previousMonth(month) {
  return shiftMonth(month, -1);
}

function money(value) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function shortWeekday(date) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", "");
}

function byId(list, id) {
  return list.find((item) => item.id === id);
}

function projectName(id) {
  if (id === ADVANCE_PROJECT_ID) return "Аванс";
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

function admins() {
  return state.users.filter((user) => user.role === "admin" || user.role === "manager");
}

function canManageAccess(user) {
  return user?.role === "admin";
}

function can(user, permission) {
  if (user?.role === "admin") return true;
  return Boolean(user?.permissions?.[permission]);
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

function daysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function dateInMonth(month, day) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function isWeekend(date) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function rateForDate(user, date) {
  const rules = [...(user?.rateRules || [])]
    .filter((rule) => rule.startDate <= date && (!rule.endDate || rule.endDate >= date))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return Number(rules[0]?.rate || user?.rate || 0);
}

function allocationFor(entry) {
  const sameDay = entriesForUserDate(entry.userId, entry.date);
  return sameDay.length ? 1 / sameDay.length : 1;
}

function entryAccrual(entry) {
  const user = byId(state.users, entry.userId);
  const rate = rateForDate(user, entry.date);
  const raw = rate * allocationFor(entry) + (entry.night ? rate : 0);
  return Math.round(raw / 100) * 100;
}

function workerAccrued(userId, month) {
  const dayTotal = uniqueDatesForUser(userId, month).reduce((sum, date) => sum + rateForDate(byId(state.users, userId), date), 0);
  const nightTotal = state.entries
    .filter((entry) => entry.userId === userId && entry.date.startsWith(month) && entry.night)
    .reduce((sum, entry) => sum + rateForDate(byId(state.users, userId), entry.date), 0);
  return dayTotal + nightTotal + bonusesForWorkerMonth(userId, month).reduce((sum, bonus) => sum + bonus.amount, 0);
}

function workerPaid(userId, month) {
  return state.payments.filter((payment) => payment.userId === userId && payment.month === month && (payment.type === "cash" || payment.type === "legacy")).reduce((sum, payment) => sum + payment.amount, 0);
}

function projectAccrued(projectId, month, userId = null) {
  const entries = state.entries.filter((entry) => entry.projectId === projectId && entry.date.startsWith(month) && (!userId || entry.userId === userId));
  const entryTotal = entries.reduce((sum, entry) => sum + entryAccrual(entry), 0);
  const bonusTotal = state.bonuses
    .filter((bonus) => bonus.projectId === projectId && bonus.month === month && (!userId || bonus.userId === userId))
    .reduce((sum, bonus) => sum + bonus.amount, 0);
  return entryTotal + bonusTotal;
}

function projectPaid(projectId, month, userId = null) {
  return state.payments
    .filter((payment) => payment.projectId === projectId && payment.month === month && (!userId || payment.userId === userId) && (payment.type === "allocation" || payment.type === "legacy"))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

function bonusesForWorkerMonth(userId, month) {
  return state.bonuses.filter((bonus) => bonus.userId === userId && bonus.month === month);
}

function workerCashPaidToMonth(userId, month) {
  return state.payments
    .filter((payment) => payment.userId === userId && payment.month <= month && (payment.type === "cash" || payment.type === "legacy"))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

function workerAllocatedToMonth(userId, month) {
  return state.payments
    .filter((payment) => payment.userId === userId && payment.month <= month && (payment.type === "allocation" || payment.type === "legacy"))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

function workerAdvanceBalance(userId, month = selectedMonth()) {
  return Math.max(0, workerCashPaidToMonth(userId, month) - workerAllocatedToMonth(userId, month));
}

function knownMonths() {
  return [
    ...new Set([
      ...state.entries.map((entry) => entry.date.slice(0, 7)),
      ...state.bonuses.map((bonus) => bonus.month),
      ...state.payments.map((payment) => payment.month),
    ]),
  ].filter(Boolean).sort();
}

function workerAccruedBeforeMonth(userId, month) {
  return knownMonths().filter((item) => item < month).reduce((sum, item) => sum + workerAccrued(userId, item), 0);
}

function workerDebtBeforeMonth(userId, month) {
  const paidBefore = state.payments
    .filter((payment) => payment.userId === userId && payment.month < month && (payment.type === "cash" || payment.type === "legacy"))
    .reduce((sum, payment) => sum + payment.amount, 0);
  return workerAccruedBeforeMonth(userId, month) - paidBefore;
}

function workerPayrollBase(userId, month) {
  return workerAccrued(userId, month) + Math.max(0, workerDebtBeforeMonth(userId, month));
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
  document.querySelector("#currentUserRole").textContent = roleLabel(user.role);
  document.querySelector("#logoutBtn").addEventListener("click", () => {
    setSession(null);
    render();
  });

  const nav = user.role === "worker" ? workerNav() : adminNav(user);
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
    activeView = user.role === "worker" ? "checkin" : "presence";
    setSession(user);
    render();
  });
}

function roleLabel(role) {
  if (role === "admin") return "Руководитель";
  if (role === "manager") return "Администратор";
  return "Сотрудник";
}

function adminNav(user) {
  const nav = [
    { id: "presence", label: "Сотрудники на объектах" },
    { id: "summary", label: "Сводка" },
    { id: "objects", label: "Отчет по объектам" },
    ...(can(user, "payroll") ? [{ id: "payroll", label: "Зарплатный фонд" }] : []),
    ...(can(user, "addEmployee") || can(user, "deleteEmployee") ? [{ id: "employees", label: "Сотрудники" }] : []),
    ...(can(user, "addProject") || can(user, "deleteProject") ? [{ id: "projects", label: "Объекты" }] : []),
    { id: "requests", label: "Запросы табеля" },
  ];
  if (canManageAccess(user)) nav.push({ id: "access", label: "Доступы" });
  return nav;
}

function workerNav() {
  return [
    { id: "checkin", label: "Отметиться" },
    { id: "manual", label: "Внести дни" },
    { id: "my-days", label: "Мои рабочие дни" },
    { id: "correction", label: "Запрос на изменение табеля" },
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
    access: renderAccess,
    checkin: renderCheckin,
    manual: renderManualDays,
    "my-days": renderMyDays,
    correction: renderCorrectionRequest,
  };
  map[activeView](user);
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

function monthControl(month, options = {}) {
  const min = options.min ? `min="${options.min}"` : "";
  const max = options.max ? `max="${options.max}"` : "";
  return `<label class="card month-control">Месяц<input id="monthControl" type="month" value="${month}" ${min} ${max} /></label>`;
}

function bindMonthControl() {
  const control = document.querySelector("#monthControl");
  if (!control) return;
  control.addEventListener("change", () => {
    localStorage.setItem(MONTH_KEY, control.value);
    render();
  });
}

function renderPresence() {
  view().innerHTML = `
    <section class="page">
      ${pageHead("Сотрудники на объектах", "Кто сегодня уже отметился и где находится сейчас.")}
      <div class="presence-list">
        ${workers(true).map((worker) => presenceRow(worker)).join("")}
      </div>
    </section>
  `;
}

function presenceRow(worker) {
  const entries = entriesForUserDate(worker.id, today());
  const current = entries.at(-1);
  return `
    <article class="presence-row ${worker.active ? "" : "muted-row"}">
      <div class="presence-person">
        <strong>${worker.name}</strong>
        <span>${worker.position || "Сотрудник"}</span>
      </div>
      <div class="presence-object">${current ? projectName(current.projectId) : "Нет отметки"}</div>
    </article>
  `;
}

function renderSummary() {
  const month = selectedMonth();
  view().innerHTML = `
    <section class="page">
      ${pageHead("Сводка", "Сотрудники, дни и зарплата за выбранный месяц.")}
      ${monthControl(month)}
      <div class="card">
        ${summaryTable(month)}
      </div>
    </section>
  `;
  bindMonthControl();
}

function summaryTable(month) {
  const rows = workers(true)
    .map((worker) => {
      const days = uniqueDatesForUser(worker.id, month).length;
      const accrued = workerAccrued(worker.id, month);
      const prevDebt = workerDebtBeforeMonth(worker.id, month);
      const paid = workerPaid(worker.id, month);
      const balance = accrued + Math.max(0, prevDebt) - paid;
      return `<tr><td>${worker.name}</td><td>${worker.position || ""}</td><td>${days}</td><td>${money(accrued)}</td><td>${money(prevDebt)}</td><td>${money(paid)}</td><td>${money(balance)}</td></tr>`;
    })
    .join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Сотрудник</th><th>Должность</th><th>Дней</th><th>Зарплата за месяц</th><th>Задолженность прошлого месяца</th><th>Оплачено</th><th>Остаток к оплате</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderEmployees() {
  view().innerHTML = `
    <section class="page">
      ${pageHead("Сотрудники", "Должности, ставки, правила оплаты и премии.")}
      <div class="card">
        <div class="card-head">
          <h3>Список сотрудников</h3>
          <button id="showEmployeeForm" class="primary small-btn">Добавить сотрудника</button>
        </div>
        <form id="employeeForm" class="form-grid collapsible-form hidden">
          <label>Имя<input id="employeeName" required placeholder="Имя" /></label>
          <label>Должность<input id="employeePosition" required placeholder="Маляр" /></label>
          <label>Логин<input id="employeeLogin" required placeholder="Логин" /></label>
          <label>Пароль<input id="employeePassword" required placeholder="Пароль" /></label>
          <label>Ставка в день<input id="employeeRate" type="number" min="0" step="500" placeholder="5000" required /></label>
          <button class="primary" type="submit">Сохранить сотрудника</button>
        </form>
        ${employeeTable()}
      </div>
    </section>
  `;
  document.querySelector("#showEmployeeForm").addEventListener("click", () => {
    document.querySelector("#employeeForm").classList.toggle("hidden");
  });
  document.querySelector("#employeeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const login = value("employeeLogin").trim();
    if (state.users.some((user) => user.login === login)) {
      alert("Такой логин уже есть.");
      return;
    }
    const rate = Number(value("employeeRate"));
    state.users.push({
      id: crypto.randomUUID(),
      role: "worker",
      name: value("employeeName").trim(),
      position: value("employeePosition").trim(),
      login,
      password: value("employeePassword"),
      rate,
      rateRules: [{ id: crypto.randomUUID(), startDate: today(), endDate: "", rate, note: "Базовая ставка" }],
      active: true,
    });
    saveState();
    event.target.reset();
    event.target.classList.add("hidden");
    render();
  });
  bindEmployeeActions();
}

function employeeTable() {
  const rows = workers(true)
    .map(
      (user) => `
        <tr>
          <td><button class="link-btn" data-open-worker="${user.id}">${user.name}</button></td>
          <td>${user.position || ""}</td>
          <td>${user.login}</td>
          <td>${money(rateForDate(user, today()))}</td>
          <td>${user.active ? "Активен" : "Отключен"}</td>
          <td class="actions">
            <button class="ghost" data-open-worker="${user.id}">Карточка</button>
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
        <thead><tr><th>Имя</th><th>Должность</th><th>Логин</th><th>Текущая ставка</th><th>Статус</th><th></th></tr></thead>
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
      state.bonuses = state.bonuses.filter((bonus) => bonus.userId !== user.id);
      state.payments = state.payments.filter((payment) => payment.userId !== user.id);
      saveState();
      render();
    });
  });
  document.querySelectorAll("[data-open-worker]").forEach((button) => {
    button.addEventListener("click", () => openWorkerCard(button.dataset.openWorker));
  });
}

function openWorkerCard(userId) {
  const user = byId(state.users, userId);
  const month = selectedMonth();
  openModal(
    user.name,
    `<div class="stack">
      <div class="notice">${user.position || "Сотрудник"} · ${uniqueDatesForUser(user.id, month).length} рабочих дней за ${month}</div>
      <div class="modal-actions">
        <button class="primary" data-add-rate="${user.id}">Изменить заработную плату</button>
        <button class="secondary" data-add-bonus="${user.id}">Добавить премию</button>
      </div>
      <h3>Правила ставок</h3>
      ${rateRulesList(user)}
      <h3>Премии за ${month}</h3>
      ${bonusList(user.id, month)}
      ${workerMonthSheet(user, month)}
    </div>`,
  );
  document.querySelector(".modal")?.classList.add("modal-wide");
  document.querySelector("[data-add-rate]")?.addEventListener("click", () => openRateModal(user.id));
  document.querySelector("[data-add-bonus]")?.addEventListener("click", () => openBonusModal(user.id));
}

function rateRulesList(user) {
  if (!user.rateRules?.length) return `<div class="empty">Правил ставок нет.</div>`;
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr><th>С даты</th><th>По дату</th><th>Ставка</th><th>Комментарий</th></tr></thead>
        <tbody>${user.rateRules.map((rule) => `<tr><td>${rule.startDate}</td><td>${rule.endDate || "без ограничения"}</td><td>${money(rule.rate)}</td><td>${rule.note || ""}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function bonusList(userId, month) {
  const bonuses = bonusesForWorkerMonth(userId, month);
  if (!bonuses.length) return `<div class="empty">Премий за месяц нет.</div>`;
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr><th>Объект</th><th>Дата</th><th>Сумма</th><th>Комментарий</th></tr></thead>
        <tbody>${bonuses.map((bonus) => `<tr><td>${projectName(bonus.projectId)}</td><td>${bonus.date}</td><td>${money(bonus.amount)}</td><td>${bonus.note || ""}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function openRateModal(userId) {
  const user = byId(state.users, userId);
  closeModal();
  openModal(
    "Изменить заработную плату",
    `<form id="rateForm" class="form-grid">
      <label>С даты<input id="rateStart" type="date" required value="${today()}" /></label>
      <label>По дату<input id="rateEnd" type="date" /></label>
      <label>Ставка в день<input id="rateValue" type="number" min="0" step="500" required value="${rateForDate(user, today())}" /></label>
      <label>Комментарий<input id="rateNote" placeholder="Командировка, ночная смена, новая ставка" /></label>
      <button class="primary" type="submit">Сохранить ставку</button>
    </form>`,
  );
  document.querySelector("#rateForm").addEventListener("submit", (event) => {
    event.preventDefault();
    user.rateRules.push({
      id: crypto.randomUUID(),
      startDate: value("rateStart"),
      endDate: value("rateEnd"),
      rate: Number(value("rateValue")),
      note: value("rateNote").trim(),
    });
    user.rate = Number(value("rateValue"));
    saveState();
    closeModal();
    openWorkerCard(userId);
  });
}

function openBonusModal(userId) {
  closeModal();
  openModal(
    "Добавить премию",
    `<form id="bonusForm" class="form-grid">
      <label>Объект<select id="bonusProject" required>${visibleProjects().map((project) => `<option value="${project.id}">${project.name}</option>`).join("")}</select></label>
      <label>Дата<input id="bonusDate" type="date" required value="${today()}" /></label>
      <label>Сумма премии<input id="bonusAmount" type="number" min="0" step="500" required /></label>
      <label>Комментарий<input id="bonusNote" placeholder="За что премия" /></label>
      <button class="primary" type="submit">Добавить премию</button>
    </form>`,
  );
  document.querySelector("#bonusForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const date = value("bonusDate");
    state.bonuses.push({
      id: crypto.randomUUID(),
      userId,
      projectId: value("bonusProject"),
      date,
      month: date.slice(0, 7),
      amount: Number(value("bonusAmount")),
      note: value("bonusNote").trim(),
    });
    saveState();
    closeModal();
    openWorkerCard(userId);
  });
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
    state.projects.push({ id: crypto.randomUUID(), name: value("projectName").trim(), status: "active" });
    saveState();
    render();
  });
  bindProjectActions();
}

function projectTable() {
  const rows = visibleProjects()
    .map(
      (project) => `
        <tr class="${project.status === "archived" ? "muted-row" : ""}">
          <td>${project.name}</td>
          <td>${projectStatuses[project.status]}</td>
          <td class="actions">
            <button class="ghost" data-project-night="${project.id}">${project.nightShift ? "Ночь включена" : "Открыть ночь"}</button>
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
  document.querySelectorAll("[data-project-night]").forEach((button) => {
    button.addEventListener("click", () => {
      const project = byId(state.projects, button.dataset.projectNight);
      project.nightShift = !project.nightShift;
      saveState();
      render();
    });
  });
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
      if (!confirm(`Удалить объект ${project.name}? Отметки, премии и выплаты по нему тоже будут удалены.`)) return;
      state.projects = state.projects.filter((item) => item.id !== project.id);
      state.entries = state.entries.filter((entry) => entry.projectId !== project.id);
      state.bonuses = state.bonuses.filter((bonus) => bonus.projectId !== project.id);
      state.payments = state.payments.filter((payment) => payment.projectId !== project.id);
      saveState();
      render();
    });
  });
}

function renderObjectReport() {
  const month = selectedMonth();
  const opened = localStorage.getItem(OPEN_PROJECT_KEY);
  const project = state.projects.find((item) => item.id === opened);
  view().innerHTML = `
    <section class="page">
      ${pageHead("Отчет по объектам", "Зарплатный фонд объекта и месячный табель по сотрудникам.")}
      ${monthControl(month)}
      ${project ? projectMonthReport(project, month) : projectButtons(month)}
    </section>
  `;
  bindMonthControl();
  document.querySelectorAll("[data-open-project]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.setItem(OPEN_PROJECT_KEY, button.dataset.openProject);
      render();
    });
  });
  document.querySelector("[data-back-projects]")?.addEventListener("click", () => {
    localStorage.removeItem(OPEN_PROJECT_KEY);
    render();
  });
}

function projectButtons(month) {
  return `
    <div class="object-buttons">
      ${visibleProjects()
        .map((project) => {
          const accrued = projectAccrued(project.id, month);
          const paid = projectPaid(project.id, month);
          return `
            <button data-open-project="${project.id}" class="object-button">
              <strong>${project.name}</strong>
              <span>${projectStatuses[project.status]}</span>
              <em>Начислено ${money(accrued)} · оплачено ${money(paid)} · остаток ${money(accrued - paid)}</em>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function projectMonthReport(project, month) {
  const accrued = projectAccrued(project.id, month);
  const paid = projectPaid(project.id, month);
  return `
    <section class="card">
      <div class="card-head">
        <h3>${project.name}</h3>
        <button class="ghost" data-back-projects>К объектам</button>
      </div>
      <div class="metrics three">
        ${metric("Начислено", money(accrued))}
        ${metric("Оплачено", money(paid))}
        ${metric("Остаток", money(accrued - paid))}
      </div>
      ${projectCalendarTable(project, month)}
    </section>
  `;
}

function metric(label, valueText) {
  return `<div class="metric"><span>${label}</span><strong>${valueText}</strong></div>`;
}

function calendarHeaderCells(month) {
  return Array.from({ length: daysInMonth(month) }, (_, index) => {
    const day = index + 1;
    const date = dateInMonth(month, day);
    return `<th class="${isWeekend(date) ? "weekend" : ""}"><span>${day}</span><small>${shortWeekday(date)}</small></th>`;
  }).join("");
}

function projectCalendarTable(project, month) {
  const rows = workers(true)
    .map((worker) => {
      const cells = Array.from({ length: daysInMonth(month) }, (_, index) => {
        const date = dateInMonth(month, index + 1);
        const entry = state.entries.find((item) => item.userId === worker.id && item.projectId === project.id && item.date === date);
        if (!entry) return `<td class="${isWeekend(date) ? "weekend" : ""}"></td>`;
        return `<td class="${isWeekend(date) ? "weekend " : ""}${entry.secondObject ? "mark-extra" : "mark-full"}">+${entry.night ? "Н" : ""}</td>`;
      }).join("");
      const objectDays = state.entries
        .filter((entry) => entry.userId === worker.id && entry.projectId === project.id && entry.date.startsWith(month))
        .reduce((sum, entry) => sum + allocationFor(entry), 0);
      return `<tr><td>${worker.name}</td><td>${objectDays.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</td>${cells}</tr>`;
    })
    .join("");
  return `
    <div class="table-wrap calendar-wrap">
      <table class="calendar-table">
        <thead><tr><th>Сотрудник</th><th>Дней объекта</th>${calendarHeaderCells(month)}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderPayroll() {
  const month = monthKey();
  view().innerHTML = `
    <section class="page">
      ${pageHead("Зарплатный фонд", "Расчет с сотрудниками: начислено с долгом, выплачено, аванс и остаток.")}
      <div class="card">
        ${payrollTable(month)}
      </div>
    </section>
  `;
  document.querySelectorAll("[data-pay-worker]").forEach((button) => {
    button.addEventListener("click", () => openPayModal(button.dataset.payWorker, month));
  });
  document.querySelector("[data-open-bonus]")?.addEventListener("click", () => openPayrollBonusModal(month));
}

function payrollTable(month) {
  const rows = workers(true)
    .map((worker) => {
      const accrued = workerPayrollBase(worker.id, month);
      const paid = workerPaid(worker.id, month);
      const advance = workerAdvanceBalance(worker.id, month);
      return `
        <tr>
          <td>${worker.name}</td>
          <td>${worker.position || ""}</td>
          <td>${money(accrued)}</td>
          <td>${money(paid)}</td>
          <td>${money(advance)}</td>
          <td>${money(accrued - paid)}</td>
          <td><button class="primary small-btn" data-pay-worker="${worker.id}">Выдать зарплату</button></td>
        </tr>
      `;
    })
    .join("");
  const totalAccrued = workers(true).reduce((sum, worker) => sum + workerPayrollBase(worker.id, month), 0);
  const totalPaid = workers(true).reduce((sum, worker) => sum + workerPaid(worker.id, month), 0);
  return `
    <div class="card-head">
      <h3>Расчет на ${month}</h3>
      <div class="actions">
        <span class="chip gold">Остаток ${money(totalAccrued - totalPaid)}</span>
        <button class="secondary small-btn" data-open-bonus>Выдать премию</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Сотрудник</th><th>Должность</th><th>Начислено с долгом</th><th>Выплачено в этом месяце</th><th>Аванс</th><th>Остаток</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function workerObjectBalances(userId, month) {
  return visibleProjects()
    .map((project) => {
      const accrued = projectAccrued(project.id, month, userId);
      const paid = projectPaid(project.id, month, userId);
      return { project, accrued, paid, balance: accrued - paid };
    })
    .filter((item) => item.accrued || item.paid);
}

function openPayModal(userId, month) {
  const user = byId(state.users, userId);
  const balances = workerObjectBalances(userId, month);
  const advance = workerAdvanceBalance(userId, month);
  openModal(
    `Выдать зарплату: ${user.name}`,
    `<form id="payForm" class="form-grid">
      <div class="notice">Сначала распределяется уже выданный аванс, потом новая выплата. Один объект можно списать только один раз за выплату.</div>
      <div class="pay-remainder">Аванс к распределению: <strong>${money(advance)}</strong></div>
      <label>Новая сумма выплаты<input id="payAmount" type="number" min="0" step="500" value="0" required /></label>
      <div id="payRemainder" class="pay-remainder">К распределению: ${money(advance)}</div>
      <div class="pay-object-list">
        ${balances
          .map((item) => `<button type="button" class="pay-object" data-pay-project="${item.project.id}" ${item.balance <= 0 ? "disabled" : ""}><strong>${item.project.name}</strong><span>остаток ${money(item.balance)}</span></button>`)
          .join("") || `<div class="empty">По сотруднику нет начислений за месяц.</div>`}
      </div>
      <div id="payAllocations" class="chips"></div>
      <button class="primary" type="submit">Сохранить выплату</button>
    </form>`,
  );
  const allocations = [];
  const amountInput = document.querySelector("#payAmount");
  const repaint = () => {
    const total = advance + Number(amountInput.value || 0);
    const used = allocations.reduce((sum, item) => sum + item.amount, 0);
    document.querySelector("#payRemainder").textContent = `К распределению: ${money(total - used)}`;
    document.querySelector("#payAllocations").innerHTML = allocations.map((item) => `<span class="chip green">${projectName(item.projectId)} · ${money(item.amount)}</span>`).join("");
  };
  amountInput.addEventListener("input", repaint);
  document.querySelectorAll("[data-pay-project]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const total = advance + Number(amountInput.value || 0);
      const used = allocations.reduce((sum, item) => sum + item.amount, 0);
      const remaining = total - used;
      if (remaining <= 0) return;
      const balance = balances.find((item) => item.project.id === button.dataset.payProject)?.balance || 0;
      const amount = Math.min(remaining, Math.max(balance, 0));
      if (amount <= 0) return;
      allocations.push({ projectId: button.dataset.payProject, amount });
      button.disabled = true;
      button.classList.add("is-used");
      repaint();
    });
  });
  document.querySelector("#payForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const newCash = Number(amountInput.value || 0);
    if (newCash > 0) {
      state.payments.push({ id: crypto.randomUUID(), userId, projectId: ADVANCE_PROJECT_ID, month, amount: newCash, type: "cash", createdAt: new Date().toISOString() });
    }
    allocations.forEach((item) => {
      state.payments.push({ id: crypto.randomUUID(), userId, projectId: item.projectId, month, amount: item.amount, type: "allocation", createdAt: new Date().toISOString() });
    });
    saveState();
    closeModal();
    render();
  });
}

function openPayrollBonusModal(month) {
  openModal(
    "Выдать премию",
    `<form id="payrollBonusForm" class="form-grid">
      <label>Сотрудник<select id="bonusWorker" required>${workers(true).map((worker) => `<option value="${worker.id}">${worker.name}</option>`).join("")}</select></label>
      <label>Сумма премии<input id="payrollBonusAmount" type="number" min="0" step="500" required /></label>
      <label>Дата<input id="payrollBonusDate" type="date" required value="${today()}" /></label>
      <label>Комментарий<input id="payrollBonusNote" placeholder="За что премия" /></label>
      <div class="notice">Выберите один или несколько объектов списания. Если объектов несколько, премия распределится равными долями.</div>
      <div class="project-checks">${visibleProjects().map((project) => `<label class="check-row"><input type="checkbox" value="${project.id}" data-bonus-project /> ${project.name}</label>`).join("")}</div>
      <button class="primary" type="submit">Сохранить премию</button>
    </form>`,
  );
  document.querySelector("#payrollBonusForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const projectIds = [...document.querySelectorAll("[data-bonus-project]:checked")].map((input) => input.value);
    const date = value("payrollBonusDate");
    const amount = Number(value("payrollBonusAmount"));
    const userId = value("bonusWorker");
    if (!projectIds.length) {
      uiMessage = "Выберите объект списания премии.";
      closeModal();
      render();
      return;
    }
    const share = Math.round((amount / projectIds.length) / 100) * 100;
    projectIds.forEach((projectId, index) => {
      state.bonuses.push({
        id: crypto.randomUUID(),
        userId,
        projectId,
        date,
        month: date.slice(0, 7),
        amount: index === projectIds.length - 1 ? amount - share * (projectIds.length - 1) : share,
        note: value("payrollBonusNote").trim(),
      });
    });
    saveState();
    closeModal();
    render();
  });
}

function renderRequests() {
  view().innerHTML = `
    <section class="page">
      ${pageHead("Запросы на изменение табеля", "Заявки сотрудников на исправление табеля.")}
      <div class="stack">${state.requests.length ? state.requests.map(requestCard).join("") : `<div class="empty">Заявок нет.</div>`}</div>
    </section>
  `;
  document.querySelectorAll("[data-close-request]").forEach((button) => {
    button.addEventListener("click", () => {
      state.requests = state.requests.filter((request) => request.id !== button.dataset.closeRequest);
      saveState();
      render();
    });
  });
  document.querySelectorAll("[data-approve-request]").forEach((button) => {
    button.addEventListener("click", () => approveRequest(button.dataset.approveRequest));
  });
}

function requestCard(request) {
  const details = request.type === "timesheet"
    ? `<p><strong>${request.action === "remove" ? "Убрать" : "Добавить"}:</strong> ${projectName(request.projectId)} · ${request.month} · ${request.dates.join(", ")}</p>`
    : "";
  return `
    <article class="card request-card">
      <div class="card-head">
        <h3>${userName(request.userId)}</h3>
        <div class="actions">
          ${request.type === "timesheet" ? `<button class="primary small-btn" data-approve-request="${request.id}">Подтвердить</button>` : ""}
          <button class="ghost" data-close-request="${request.id}">Закрыть</button>
        </div>
      </div>
      ${details}
      <p>${request.text}</p>
      <small>${new Date(request.createdAt).toLocaleString("ru-RU")}</small>
    </article>
  `;
}

function approveRequest(requestId) {
  const request = state.requests.find((item) => item.id === requestId);
  if (!request || request.type !== "timesheet") return;
  request.dates.forEach((date) => {
    if (request.action === "remove") {
      state.entries = state.entries.filter((entry) => !(entry.userId === request.userId && entry.projectId === request.projectId && entry.date === date));
    } else {
      upsertEntry(request.userId, request.projectId, date, "admin-approved");
    }
  });
  state.requests = state.requests.filter((item) => item.id !== requestId);
  saveState();
  render();
}

function renderAccess(user) {
  view().innerHTML = `
    <section class="page">
      ${pageHead("Доступы", "Смена логина/пароля и ограниченные администраторы табеля.")}
      <section class="card">
        <div class="card-head">
          <h3>Моя учетная запись</h3>
          <button id="showAccountForm" class="primary small-btn">Изменить доступ</button>
        </div>
        <form id="accountForm" class="form-grid collapsible-form hidden">
          <label>Логин<input id="accountLogin" required value="${user.login}" /></label>
          <label>Новый пароль<input id="accountPassword" type="password" placeholder="Оставить пустым, если не менять" /></label>
          <button class="primary" type="submit">Сохранить</button>
        </form>
      </section>
      <section class="card">
        <div class="card-head">
          <h3>Администраторы</h3>
          <button id="showManagerForm" class="primary small-btn">Добавить администратора</button>
        </div>
        <form id="managerForm" class="form-grid collapsible-form hidden">
          <label>Имя<input id="managerName" required placeholder="Имя" /></label>
          <label>Логин<input id="managerLogin" required placeholder="Логин" /></label>
          <label>Пароль<input id="managerPassword" required placeholder="Пароль" /></label>
          <div class="permission-grid">${permissionCheckboxes(defaultPermissions("manager"))}</div>
          <button class="primary" type="submit">Сохранить администратора</button>
        </form>
        ${adminsTable()}
      </section>
    </section>
  `;
  document.querySelector("#showAccountForm").addEventListener("click", () => document.querySelector("#accountForm").classList.toggle("hidden"));
  document.querySelector("#showManagerForm").addEventListener("click", () => document.querySelector("#managerForm").classList.toggle("hidden"));
  document.querySelector("#accountForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const login = value("accountLogin").trim();
    if (state.users.some((item) => item.id !== user.id && item.login === login)) {
      alert("Такой логин уже есть.");
      return;
    }
    user.login = login;
    if (value("accountPassword")) user.password = value("accountPassword");
    saveState();
    event.target.classList.add("hidden");
    render();
  });
  document.querySelector("#managerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const login = value("managerLogin").trim();
    if (state.users.some((item) => item.login === login)) {
      alert("Такой логин уже есть.");
      return;
    }
    state.users.push({
      id: crypto.randomUUID(),
      role: "manager",
      name: value("managerName").trim(),
      position: "Администратор табеля",
      login,
      password: value("managerPassword"),
      rate: 0,
      rateRules: [],
      permissions: collectPermissions(),
      active: true,
    });
    saveState();
    render();
  });
  document.querySelectorAll("[data-toggle-admin]").forEach((button) => {
    button.addEventListener("click", () => {
      const admin = byId(state.users, button.dataset.toggleAdmin);
      if (admin.id === user.id) return;
      admin.active = !admin.active;
      saveState();
      render();
    });
  });
  document.querySelectorAll("[data-open-permissions]").forEach((button) => {
    button.addEventListener("click", () => openPermissionsModal(button.dataset.openPermissions));
  });
}

function adminsTable() {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Имя</th><th>Роль</th><th>Логин</th><th>Статус</th><th>Права</th><th></th></tr></thead>
        <tbody>${admins()
          .map((admin) => `<tr><td>${admin.name}</td><td>${roleLabel(admin.role)}</td><td>${admin.login}</td><td>${admin.active ? "Активен" : "Отключен"}</td><td>${permissionSummary(admin)}</td><td class="actions">${admin.role === "manager" ? `<button class="ghost" data-open-permissions="${admin.id}">Роли</button><button class="ghost" data-toggle-admin="${admin.id}">${admin.active ? "Отключить" : "Включить"}</button>` : ""}</td></tr>`)
          .join("")}</tbody>
      </table>
    </div>
  `;
}

const permissionLabels = {
  editTimesheet: "Вносить дополнительные изменения в табель",
  addEmployee: "Добавлять сотрудников",
  deleteEmployee: "Удалять сотрудников",
  addProject: "Добавлять объекты",
  deleteProject: "Удалять объекты",
  bonusEmployee: "Премировать сотрудников",
  payroll: "Выдавать зарплату",
  deleteApprovedDays: "Удалять подтвержденные дни табеля",
  manageAccess: "Управлять доступами",
};

function permissionCheckboxes(permissions) {
  return Object.entries(permissionLabels)
    .map(([key, label]) => `<label class="check-row"><input type="checkbox" data-permission="${key}" ${permissions[key] ? "checked" : ""} ${key === "editTimesheet" ? "disabled checked" : ""} /> ${label}</label>`)
    .join("");
}

function collectPermissions() {
  const permissions = {};
  document.querySelectorAll("[data-permission]").forEach((input) => {
    permissions[input.dataset.permission] = input.checked;
  });
  permissions.editTimesheet = true;
  return permissions;
}

function permissionSummary(user) {
  if (user.role === "admin") return "Полный доступ";
  const allowed = Object.entries(permissionLabels).filter(([key]) => user.permissions?.[key]).map(([, label]) => label);
  return allowed.length ? allowed.join("; ") : "Только просмотр";
}

function openPermissionsModal(userId) {
  const manager = byId(state.users, userId);
  openModal(
    `Роли: ${manager.name}`,
    `<form id="permissionsForm" class="form-grid">
      <div class="permission-grid">${permissionCheckboxes(manager.permissions || defaultPermissions("manager"))}</div>
      <button class="primary" type="submit">Сохранить роли</button>
    </form>`,
  );
  document.querySelector("#permissionsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    manager.permissions = collectPermissions();
    saveState();
    closeModal();
    render();
  });
}

function renderCheckin(user) {
  const todaysEntries = entriesForUserDate(user.id, today());
  const current = todaysEntries.at(-1);
  const canNight = current && byId(state.projects, current.projectId)?.nightShift && new Date().getHours() >= 18 && !current.night;
  view().innerHTML = `
    <section class="page">
      ${pageHead("Отметиться на объекте", "Если работа идет на втором объекте, отметьтесь по приходе на него.")}
      <section class="card checkin-box">
        ${uiMessage ? `<div class="notice">${uiMessage}</div>` : ""}
        <p class="eyebrow">Сегодня</p>
        <h2>${formatDate(today())}</h2>
        ${todaysEntries.length ? `<button id="secondObjectBtn" class="big-action">Второй объект</button>` : `<button id="checkinBtn" class="big-action">Отметиться на объекте</button>`}
        ${
          current
            ? `<div class="current-project"><span>Вы сейчас на объекте</span><strong>${projectName(current.projectId)}${current.night ? " Н" : ""}</strong><div class="actions"><button id="changeProjectBtn" class="ghost">Изменить объект</button>${canNight ? `<button id="nightShiftBtn" class="secondary">Ночная смена</button>` : ""}</div></div>`
            : `<span class="chip">Сегодня отметок нет</span>`
        }
        <div class="chips">${todaysEntries.map((entry) => `<span class="chip ${entry.secondObject ? "red" : "green"}">${projectName(entry.projectId)}${entry.night ? " Н" : ""}${entry.checkedAt ? ` · ${entry.checkedAt.slice(11, 16)}` : ""}</span>`).join("")}</div>
      </section>
    </section>
  `;
  uiMessage = "";
  document.querySelector("#checkinBtn")?.addEventListener("click", () => openProjectPicker(user, "first"));
  document.querySelector("#secondObjectBtn")?.addEventListener("click", () => {
    if (todaysEntries.length >= 2) {
      uiMessage = "Сегодня уже закрыты два объекта. Третий объект отправьте запросом администратору.";
      render();
      return;
    }
    openProjectPicker(user, "second");
  });
  document.querySelector("#changeProjectBtn")?.addEventListener("click", () => openProjectPicker(user, "replace"));
  document.querySelector("#nightShiftBtn")?.addEventListener("click", () => {
    current.night = true;
    current.changedAt = new Date().toISOString();
    saveState();
    uiMessage = `Ночная смена по объекту ${projectName(current.projectId)} отмечена.`;
    render();
  });
}

function openProjectPicker(user, mode = "first") {
  if (!activeProjects().length) {
    uiMessage = "Администратор еще не добавил объекты в работе.";
    render();
    return;
  }
  const selected = entriesForUserDate(user.id, today());
  if ((mode === "first" || mode === "second") && selected.length >= 2) {
    uiMessage = "Сегодня уже закрыты два объекта. Третий объект отправьте запросом администратору.";
    render();
    return;
  }
  const body = `
    <div class="stack">
      ${mode === "second" ? `<div class="notice">Вы хотите завершить работу на первом объекте и отметить второй объект? Если нажали ошибочно, закройте окно.</div>` : ""}
      ${selected.length ? `<div class="notice">Вы уже отмечены: ${selected.map((entry) => projectName(entry.projectId)).join(", ")}. ${mode === "replace" ? "Выберите объект, который должен заменить текущий." : "Выберите второй объект, если пришли на него."}</div>` : ""}
      <div class="project-list">
        ${activeProjects()
          .map((project) => `<button class="project-choice" ${(mode === "first" || mode === "second") && selected.some((entry) => entry.projectId === project.id) ? "disabled" : ""} data-project-choice="${project.id}">${project.name}</button>`)
          .join("")}
      </div>
    </div>
  `;
  openModal(mode === "replace" ? "Изменить объект" : mode === "second" ? "Второй объект" : "Выберите объект", body);
  document.querySelectorAll("[data-project-choice]").forEach((button) => {
    button.addEventListener("click", () => handleProjectChoice(user, button.dataset.projectChoice, mode));
  });
}

function handleProjectChoice(user, projectId, mode) {
  const entries = entriesForUserDate(user.id, today());
  if (mode === "replace" && entries.length) {
    const current = entries.at(-1);
    current.projectId = projectId;
    current.changedAt = new Date().toISOString();
  } else {
    upsertEntry(user.id, projectId, today(), mode === "second" ? "second-object" : "checkin");
    const entry = entriesForUserDate(user.id, today()).find((item) => item.projectId === projectId);
    entry.checkedAt = new Date().toISOString();
    entry.secondObject = mode === "second";
  }
  saveState();
  closeModal();
  uiMessage = `Вы сейчас на объекте ${projectName(projectId)}.`;
  render();
}

function renderManualDays(user) {
  const month = selectedMonth();
  const currentMonth = monthKey();
  const prevMonth = previousMonth(currentMonth);
  view().innerHTML = `
    <section class="page">
      ${pageHead("Внести пропущенные дни", "Можно внести прошедшие дни текущего и предыдущего месяца. Уже отмеченные дни подсвечены зеленым.")}
      <form id="manualForm" class="card form-grid">
        <label>Объект
          <select id="manualProject" required>${activeProjects().map((project) => `<option value="${project.id}">${project.name}</option>`).join("")}</select>
        </label>
        ${monthControl(month, { min: prevMonth, max: currentMonth })}
        <div class="month-days" id="monthDays">${monthButtons(month, user.id)}</div>
        <button class="primary" type="submit">Сохранить выбранные дни</button>
      </form>
    </section>
  `;
  bindMonthControl();
  const selected = new Set();
  document.querySelectorAll("[data-day]:not(:disabled)").forEach((button) => {
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

function monthButtons(month, userId = null) {
  const currentMonth = monthKey();
  const prevMonth = previousMonth(currentMonth);
  return Array.from({ length: daysInMonth(month) }, (_, index) => {
    const date = dateInMonth(month, index + 1);
    const filled = userId && entriesForUserDate(userId, date).length;
    const disabled = month < prevMonth || month > currentMonth || date > today() || filled;
    const classes = ["day-btn", isWeekend(date) ? "weekend" : "", filled ? "filled" : "", disabled ? "disabled" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="${classes}" data-day="${date}" ${disabled ? "disabled" : ""}><span>${index + 1}</span><small>${shortWeekday(date)}</small></button>`;
  }).join("");
}

function upsertEntry(userId, projectId, date, source) {
  const existingDateEntries = entriesForUserDate(userId, date);
  const existing = existingDateEntries.find((entry) => entry.projectId === projectId);
  if (existing) {
    existing.source = source;
    return;
  }
  state.entries.push({ id: crypto.randomUUID(), userId, projectId, date, source, checkedAt: new Date().toISOString(), changedAt: "", secondObject: existingDateEntries.length > 0, night: false });
}

function renderMyDays(user) {
  const month = selectedMonth();
  const mode = localStorage.getItem(MY_DAYS_MODE_KEY) || "objects";
  const entries = state.entries.filter((entry) => entry.userId === user.id && entry.date.startsWith(month));
  view().innerHTML = `
    <section class="page">
      ${pageHead("Мои рабочие дни", "Просмотр по объектам или табель за месяц.")}
      ${monthControl(month)}
      <div class="segmented">
        <button class="${mode === "objects" ? "active" : ""}" data-days-mode="objects">По объектам</button>
        <button class="${mode === "sheet" ? "active" : ""}" data-days-mode="sheet">Табель</button>
      </div>
      <div class="card">${entries.length ? (mode === "objects" ? workerObjectList(entries) : workerMonthSheet(user, month)) : `<div class="empty">За этот месяц отметок нет.</div>`}</div>
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

function workerObjectList(entries) {
  const grouped = visibleProjects()
    .map((project) => {
      const projectEntries = entries.filter((entry) => entry.projectId === project.id);
      if (!projectEntries.length) return "";
      const projectDays = projectEntries.reduce((sum, entry) => sum + allocationFor(entry), 0);
      return `<div class="object-line compact-object-line"><strong>${project.name}</strong><span>${projectDays.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} дн. за месяц</span></div>`;
    })
    .join("");
  return grouped || `<div class="empty">Отметок нет.</div>`;
}

function workerMonthSheet(user, month) {
  const rows = visibleProjects()
    .map((project) => {
      const cells = Array.from({ length: daysInMonth(month) }, (_, index) => {
        const date = dateInMonth(month, index + 1);
        const entry = state.entries.find((item) => item.userId === user.id && item.projectId === project.id && item.date === date);
        if (!entry) return `<td class="${isWeekend(date) ? "weekend" : ""}"></td>`;
        return `<td class="${isWeekend(date) ? "weekend " : ""}${entry.secondObject ? "mark-extra" : "mark-full"}">+${entry.night ? "Н" : ""}</td>`;
      }).join("");
      return `<tr><td>${project.name}</td>${cells}</tr>`;
    })
    .join("");
  return `
    <div class="table-wrap calendar-wrap">
      <table class="calendar-table">
        <thead><tr><th>Объект</th>${calendarHeaderCells(month)}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderCorrectionRequest(user) {
  const month = selectedMonth();
  view().innerHTML = `
    <section class="page">
      ${pageHead("Запрос на изменение табеля", "Выберите объект, месяц и даты. Администратор сможет подтвердить заявку автоматически.")}
      ${uiMessage ? `<div class="notice">${uiMessage}</div>` : ""}
      <div class="segmented">
        <button class="active" data-request-mode="timesheet">Изменить табель</button>
        <button data-request-mode="free">Свободный запрос</button>
      </div>
      <form id="requestForm" class="card form-grid">
        <div id="timesheetRequestFields" class="form-grid">
          <label>Объект<select id="requestProject" required>${visibleProjects().map((project) => `<option value="${project.id}">${project.name}</option>`).join("")}</select></label>
          ${monthControl(month, { min: previousMonth(monthKey()), max: monthKey() })}
          <label>Действие<select id="requestAction"><option value="add">Добавить рабочие дни</option><option value="remove">Убрать отмеченные дни</option></select></label>
          <div class="month-days" id="requestDays">${requestMonthButtons(month, user.id)}</div>
        </div>
        <label>Комментарий<textarea id="requestText" required rows="5" placeholder="Прошу внести эти рабочие дни / убрать ошибочные отметки"></textarea></label>
        <button class="primary" type="submit">Отправить администратору</button>
      </form>
    </section>
  `;
  uiMessage = "";
  bindMonthControl();
  let requestMode = "timesheet";
  const selected = new Set();
  document.querySelectorAll("#requestDays [data-day]:not(:disabled)").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("selected");
      if (selected.has(button.dataset.day)) selected.delete(button.dataset.day);
      else selected.add(button.dataset.day);
    });
  });
  document.querySelectorAll("[data-request-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      requestMode = button.dataset.requestMode;
      document.querySelectorAll("[data-request-mode]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelector("#timesheetRequestFields").classList.toggle("hidden", requestMode === "free");
    });
  });
  document.querySelector("#requestForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (requestMode === "timesheet" && !selected.size) {
      uiMessage = "Выберите даты для заявки.";
      render();
      return;
    }
    state.requests.unshift({
      id: crypto.randomUUID(),
      userId: user.id,
      createdAt: new Date().toISOString(),
      type: requestMode,
      projectId: requestMode === "timesheet" ? value("requestProject") : "",
      month: requestMode === "timesheet" ? selectedMonth() : "",
      action: requestMode === "timesheet" ? value("requestAction") : "add",
      dates: requestMode === "timesheet" ? [...selected].sort() : [],
      text: value("requestText").trim(),
    });
    saveState();
    uiMessage = "Заявка отправлена администратору.";
    activeView = "my-days";
    render();
  });
}

function requestMonthButtons(month, userId) {
  return Array.from({ length: daysInMonth(month) }, (_, index) => {
    const date = dateInMonth(month, index + 1);
    const filled = entriesForUserDate(userId, date).length;
    const disabled = date > today();
    const classes = ["day-btn", isWeekend(date) ? "weekend" : "", filled ? "filled" : "", disabled ? "disabled" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="${classes}" data-day="${date}" ${disabled ? "disabled" : ""}><span>${index + 1}</span><small>${shortWeekday(date)}</small></button>`;
  }).join("");
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
