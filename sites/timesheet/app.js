const STORAGE_KEY = "tsk-timesheet-github-v4";
const OLD_STORAGE_KEYS = [];
const MONTH_KEY = "tsk-timesheet-month";
const MY_DAYS_MODE_KEY = "tsk-my-days-mode";
const OPEN_PROJECT_KEY = "tsk-open-project";
const ADVANCE_PROJECT_ID = "__advance__";
const MY_DAYS_CORRECTION_KEY = "tsk-my-days-correction";
const DATA_EXPORT_VERSION = 1;

const projectStatuses = {
  active: "В работе",
  paused: "На паузе",
  completed: "Завершен",
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
      status: "active",
    },
    {
      id: "worker-yura",
      role: "worker",
      name: "Юра",
      position: "Мастер",
      login: "yura",
      password: "12345",
      rate: 6500,
      rateRules: [{ id: "rate-yura-base", startDate: "2026-07-01", endDate: "", rate: 6500, note: "Базовая ставка" }],
      active: true,
      status: "active",
    },
    {
      id: "worker-misha",
      role: "worker",
      name: "Миша",
      position: "Мастер",
      login: "misha",
      password: "12345",
      rate: 6500,
      rateRules: [{ id: "rate-misha-base", startDate: "2026-07-01", endDate: "", rate: 6500, note: "Базовая ставка" }],
      active: true,
      status: "active",
    },
    {
      id: "worker-fazildin",
      role: "worker",
      name: "Фазельдин",
      position: "Мастер",
      login: "fazildin",
      password: "12345",
      rate: 7000,
      rateRules: [{ id: "rate-fazildin-base", startDate: "2026-07-01", endDate: "", rate: 7000, note: "Базовая ставка" }],
      active: true,
      status: "active",
    },
  ],
  projects: [],
  entries: [],
  requests: [],
  bonuses: [],
  payments: [],
  logs: [],
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
    logs: Array.isArray(data.logs) ? data.logs : [],
  };
  normalized.users = normalized.users.map((user) => {
    const role = user.role === "manager" || user.role === "admin" || user.role === "worker" ? user.role : "worker";
    const rate = Number(user.rate || 0);
    const rateRules = Array.isArray(user.rateRules) && user.rateRules.length ? user.rateRules : rate ? [{ id: crypto.randomUUID(), startDate: "2026-01-01", endDate: "", rate, note: "Базовая ставка" }] : [];
    const status = user.status || (user.active === false ? "fired" : "active");
    return {
      ...user,
      role,
      position: user.position || (role === "admin" ? "Руководитель" : role === "manager" ? "Администратор табеля" : "Сотрудник"),
      status,
      active: status !== "fired",
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
    accessMode: project.accessMode || "all",
    allowedUserIds: Array.isArray(project.allowedUserIds) ? project.allowedUserIds : [],
    startDate: project.startDate || today(),
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
      endedAt: entry.endedAt || "",
      changedAt: entry.changedAt || "",
      secondObject: Boolean(entry.secondObject),
      night: Boolean(entry.night),
    }));
  const uniqueEntries = new Map();
  normalized.entries.forEach((entry) => {
    const key = `${entry.userId}:${entry.projectId}:${entry.date}`;
    if (!uniqueEntries.has(key)) uniqueEntries.set(key, entry);
    else {
      const stored = uniqueEntries.get(key);
      if (!stored.endedAt && entry.endedAt) stored.endedAt = entry.endedAt;
      if (!stored.checkedAt && entry.checkedAt) stored.checkedAt = entry.checkedAt;
    }
  });
  normalized.entries = [...uniqueEntries.values()];
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
    batchId: payment.batchId || payment.id || crypto.randomUUID(),
    userId: payment.userId,
    projectId: payment.projectId || ADVANCE_PROJECT_ID,
    month: payment.month || selectedMonth(),
    amount: Number(payment.amount || 0),
    type: payment.type || (payment.projectId && payment.projectId !== ADVANCE_PROJECT_ID ? "legacy" : "cash"),
    date: payment.date || payment.createdAt?.slice(0, 10) || today(),
    createdAt: payment.createdAt || new Date().toISOString(),
  }));
  normalized.logs = normalized.logs.map((log) => ({
    id: log.id || crypto.randomUUID(),
    userId: log.userId || "",
    projectId: log.projectId || "",
    entryId: log.entryId || "",
    type: log.type || "event",
    text: log.text || "",
    createdAt: log.createdAt || new Date().toISOString(),
  }));
  return normalized;
}

function addLog({ userId = "", projectId = "", entryId = "", type = "event", text = "" }) {
  state.logs.unshift({ id: crypto.randomUUID(), userId, projectId, entryId, type, text, createdAt: new Date().toISOString() });
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

function stateExportPayload() {
  return {
    version: DATA_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    storageKey: STORAGE_KEY,
    state,
  };
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

function isoAt(date, time) {
  return new Date(`${date}T${time}:00`).toISOString();
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

function canUserAccessProject(userId, project) {
  return project.accessMode !== "selected" || project.allowedUserIds.includes(userId);
}

function activeProjectsForUser(userId) {
  return activeProjects().filter((project) => canUserAccessProject(userId, project));
}

function visibleProjects() {
  return [
    ...state.projects.filter((project) => project.status === "active"),
    ...state.projects.filter((project) => project.status === "paused"),
    ...state.projects.filter((project) => project.status === "completed"),
    ...state.projects.filter((project) => project.status === "archived"),
  ];
}

function workers(includeDisabled = false) {
  return state.users.filter((user) => user.role === "worker" && (includeDisabled || user.status !== "fired"));
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

function workdayEndIso(date) {
  return `${date}T18:00:00`;
}

function autoRestApplies(entry) {
  if (!entry || entry.endedAt || entry.night) return false;
  const checkedHour = entry.checkedAt ? new Date(entry.checkedAt).getHours() : 9;
  if (checkedHour >= 18) return false;
  if (entry.date < today()) return true;
  return entry.date === today() && new Date().getHours() >= 18;
}

function effectiveEndedAt(entry) {
  if (entry?.endedAt) return entry.endedAt;
  if (autoRestApplies(entry)) return workdayEndIso(entry.date);
  return "";
}

function isEntryOpen(entry) {
  return Boolean(entry && !effectiveEndedAt(entry));
}

function openEntryForUser(userId, date = today()) {
  return [...entriesForUserDate(userId, date)].reverse().find(isEntryOpen) || null;
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function endLabel(entry) {
  if (entry?.endedAt) return `ушел ${formatTime(entry.endedAt)}`;
  if (autoRestApplies(entry)) return `смена завершена ${formatTime(workdayEndIso(entry.date))}`;
  return "работает";
}

function workerStatusLabel(worker) {
  if (worker.status === "vacation") return "В отпуске";
  if (worker.status === "fired") return "Уволен";
  return openEntryForUser(worker.id) ? "На объекте" : "Отдыхает";
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

function projectAccruedTotal(projectId, userId = null) {
  const entryTotal = state.entries
    .filter((entry) => entry.projectId === projectId && (!userId || entry.userId === userId))
    .reduce((sum, entry) => sum + entryAccrual(entry), 0);
  const bonusTotal = state.bonuses
    .filter((bonus) => bonus.projectId === projectId && (!userId || bonus.userId === userId))
    .reduce((sum, bonus) => sum + bonus.amount, 0);
  return entryTotal + bonusTotal;
}

function projectPaidTotal(projectId, userId = null) {
  return state.payments
    .filter((payment) => payment.projectId === projectId && (!userId || payment.userId === userId) && (payment.type === "allocation" || payment.type === "legacy"))
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

function workerCashPaidAll(userId) {
  return state.payments
    .filter((payment) => payment.userId === userId && (payment.type === "cash" || payment.type === "legacy"))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

function workerAllocatedAll(userId) {
  return state.payments
    .filter((payment) => payment.userId === userId && (payment.type === "allocation" || payment.type === "legacy"))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

function workerAdvanceBalanceAll(userId) {
  return Math.max(0, workerCashPaidAll(userId) - workerAllocatedAll(userId));
}

function workerOpenDebtAll(userId) {
  const months = knownMonths();
  return visibleProjects().flatMap((project) =>
    months
      .map((month) => {
        const accrued = projectAccrued(project.id, month, userId);
        const paid = projectPaid(project.id, month, userId);
        return { project, month, accrued, paid, balance: accrued - paid };
      })
      .filter((item) => item.accrued || item.paid),
  );
}

function workerOpenDebtTotal(userId) {
  return workerOpenDebtAll(userId).reduce((sum, item) => sum + Math.max(0, item.balance), 0);
}

function projectPaidForEdit(projectId, month, userId, ignoredBatchId = "") {
  return state.payments
    .filter((payment) => payment.batchId !== ignoredBatchId && payment.projectId === projectId && payment.month === month && payment.userId === userId && (payment.type === "allocation" || payment.type === "legacy"))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

function workerOpenDebtForEdit(userId, ignoredBatchId = "") {
  const months = knownMonths();
  return visibleProjects().flatMap((project) =>
    months
      .map((month) => {
        const accrued = projectAccrued(project.id, month, userId);
        const paid = projectPaidForEdit(project.id, month, userId, ignoredBatchId);
        return { project, month, accrued, paid, balance: accrued - paid };
      })
      .filter((item) => item.accrued || item.paid),
  );
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
      if (item.id === "objects") localStorage.removeItem(OPEN_PROJECT_KEY);
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
    ...(can(user, "payroll") ? [{ id: "payments", label: "Все выплаты" }] : []),
    ...(can(user, "addEmployee") || can(user, "deleteEmployee") ? [{ id: "employees", label: "Сотрудники" }] : []),
    ...(can(user, "addProject") || can(user, "deleteProject") ? [{ id: "projects", label: "Объекты" }] : []),
    { id: "requests", label: "Запросы табеля" },
    ...(user.role === "admin" ? [{ id: "data", label: "База" }] : []),
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
    payments: renderPaymentsView,
    requests: renderRequests,
    access: renderAccess,
    data: renderDataTools,
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
  const current = openEntryForUser(worker.id);
  const last = entries.at(-1);
  const status = workerStatusLabel(worker);
  return `
    <article class="presence-row ${worker.active ? "" : "muted-row"}">
      <div class="presence-person">
        <strong>${worker.name}</strong>
        <span>${worker.position || "Сотрудник"}</span>
      </div>
      <div class="presence-object">
        <strong>${current ? projectName(current.projectId) : status}</strong>
        <span>${current ? `пришел ${formatTime(current.checkedAt)}` : last ? `последний объект: ${projectName(last.projectId)} · ${endLabel(last)}` : "нет отметки сегодня"}</span>
      </div>
    </article>
  `;
}

function renderSummary() {
  const month = selectedMonth();
  view().innerHTML = `
    <section class="page">
      ${pageHead("Сводка", "Сотрудники, дни и зарплата за выбранный месяц.")}
      <div class="summary-tools">
        ${monthControl(month)}
        <button class="primary" data-worker-stats>Статистика по сотрудникам</button>
      </div>
      <div class="card">
        ${summaryTable(month)}
      </div>
    </section>
  `;
  bindMonthControl();
  document.querySelector("[data-worker-stats]").addEventListener("click", () => openWorkerStatsModal(month));
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

function openWorkerStatsModal(month) {
  openModal(
    "Статистика по сотрудникам",
    `<div class="stack">
      <label>Сотрудник<select id="statsWorker">${workers(true).map((worker) => `<option value="${worker.id}">${worker.name}</option>`).join("")}</select></label>
      <div id="statsBody"></div>
    </div>`,
  );
  document.querySelector(".modal")?.classList.add("modal-wide");
  const renderStats = () => {
    const userId = value("statsWorker");
    document.querySelector("#statsBody").innerHTML = workerStatsTable(userId, month);
  };
  document.querySelector("#statsWorker").addEventListener("change", renderStats);
  renderStats();
}

function workerStatsTable(userId, month) {
  const entries = state.entries
    .filter((entry) => entry.userId === userId && entry.date.startsWith(month))
    .sort((a, b) => `${a.date}${a.checkedAt}`.localeCompare(`${b.date}${b.checkedAt}`));
  if (!entries.length) return `<div class="empty">За месяц отметок нет.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Дата</th><th>Объект</th><th>Пришел</th><th>Ушел</th><th>Тип</th></tr></thead>
        <tbody>${entries.map((entry) => `<tr><td>${entry.date}</td><td>${projectName(entry.projectId)}</td><td>${formatTime(entry.checkedAt)}</td><td>${endLabel(entry)}</td><td>${entry.night ? "Ночная" : entry.secondObject ? "Второй объект" : "День"}</td></tr>`).join("")}</tbody>
      </table>
    </div>
    ${workerLogTable(userId, month)}
  `;
}

function workerLogTable(userId, month) {
  const logs = state.logs.filter((log) => log.userId === userId && log.createdAt.slice(0, 7) === month);
  if (!logs.length) return `<div class="empty">Логов действий за месяц нет.</div>`;
  return `
    <h3>Лог действий</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Дата</th><th>Время</th><th>Объект</th><th>Действие</th></tr></thead>
        <tbody>${logs.map((log) => `<tr><td>${log.createdAt.slice(0, 10)}</td><td>${formatTime(log.createdAt)}</td><td>${projectName(log.projectId)}</td><td>${log.text}</td></tr>`).join("")}</tbody>
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
  const order = { active: 0, vacation: 1, fired: 2 };
  const rows = [...workers(true)]
    .sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0) || a.name.localeCompare(b.name, "ru"))
    .map(
      (user) => `
        <tr>
          <td><button class="link-btn" data-open-worker="${user.id}">${user.name}</button></td>
          <td>${user.position || ""}</td>
          <td>${user.login}</td>
          <td>${money(rateForDate(user, today()))}</td>
          <td>${employeeStatusLabel(user)}</td>
          <td class="actions">
            <button class="ghost" data-open-worker="${user.id}">Карточка</button>
            <button class="ghost" data-vacation-user="${user.id}">${user.status === "vacation" ? "Вернуть" : "В отпуск"}</button>
            <button class="ghost" data-fire-user="${user.id}">${user.status === "fired" ? "Нанять" : "Уволить"}</button>
            ${canDeleteWorker(user.id) ? `<button class="danger" data-delete-user="${user.id}">Удалить ошибочную карточку</button>` : ""}
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
  document.querySelectorAll("[data-vacation-user]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = byId(state.users, button.dataset.vacationUser);
      user.status = user.status === "vacation" ? "active" : "vacation";
      user.active = user.status !== "fired";
      saveState();
      render();
    });
  });
  document.querySelectorAll("[data-fire-user]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = byId(state.users, button.dataset.fireUser);
      user.status = user.status === "fired" ? "active" : "fired";
      user.active = user.status !== "fired";
      saveState();
      render();
    });
  });
  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = byId(state.users, button.dataset.deleteUser);
      if (!canDeleteWorker(user.id)) return;
      if (!confirm(`Удалить ошибочную карточку ${user.name}?`)) return;
      state.users = state.users.filter((item) => item.id !== user.id);
      saveState();
      render();
    });
  });
  document.querySelectorAll("[data-open-worker]").forEach((button) => {
    button.addEventListener("click", () => openWorkerCard(button.dataset.openWorker));
  });
}

function employeeStatusLabel(user) {
  if (user.status === "vacation") return "В отпуске";
  if (user.status === "fired") return "Уволен";
  return "Работает";
}

function canDeleteWorker(userId) {
  return !state.entries.some((entry) => entry.userId === userId) && !state.bonuses.some((bonus) => bonus.userId === userId) && !state.payments.some((payment) => payment.userId === userId);
}

function openWorkerCard(userId) {
  const user = byId(state.users, userId);
  const month = selectedMonth();
  openModal(
    user.name,
    `<div class="stack">
      <div class="notice">${user.position || "Сотрудник"} · ${uniqueDatesForUser(user.id, month).length} рабочих дней за ${month}</div>
      <div class="modal-actions">
        <button class="ghost" data-edit-worker="${user.id}">Редактировать карточку</button>
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
  document.querySelector("[data-edit-worker]")?.addEventListener("click", () => openWorkerEditModal(user.id));
  document.querySelector("[data-add-rate]")?.addEventListener("click", () => openRateModal(user.id));
  document.querySelector("[data-add-bonus]")?.addEventListener("click", () => openBonusModal(user.id));
}

function openWorkerEditModal(userId) {
  const user = byId(state.users, userId);
  closeModal();
  openModal(
    `Редактировать карточку: ${user.name}`,
    `<form id="workerEditForm" class="form-grid">
      <label>Имя<input id="editWorkerName" required value="${user.name}" /></label>
      <label>Должность<input id="editWorkerPosition" required value="${user.position || ""}" /></label>
      <label>Логин<input id="editWorkerLogin" required value="${user.login}" /></label>
      <label>Новый пароль<input id="editWorkerPassword" type="password" placeholder="Оставить текущий" /></label>
      <label>Базовая ставка<input id="editWorkerRate" type="number" min="0" step="500" required value="${user.rate || rateForDate(user, today())}" /></label>
      <button class="primary" type="submit">Сохранить карточку</button>
    </form>`,
  );
  document.querySelector("#workerEditForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const login = value("editWorkerLogin").trim();
    if (state.users.some((item) => item.id !== user.id && item.login === login)) {
      alert("Такой логин уже есть.");
      return;
    }
    user.name = value("editWorkerName").trim();
    user.position = value("editWorkerPosition").trim();
    user.login = login;
    if (value("editWorkerPassword")) user.password = value("editWorkerPassword");
    user.rate = Number(value("editWorkerRate"));
    if (!user.rateRules?.length) {
      user.rateRules = [{ id: crypto.randomUUID(), startDate: today(), endDate: "", rate: user.rate, note: "Базовая ставка" }];
    }
    saveState();
    closeModal();
    render();
  });
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
          <label>Старт проекта<input id="projectStart" type="date" required value="${today()}" /></label>
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
    state.projects.push({ id: crypto.randomUUID(), name: value("projectName").trim(), startDate: value("projectStart"), status: "active", nightShift: false, accessMode: "all", allowedUserIds: [] });
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
          <td>${project.name}<br><small>старт ${project.startDate || today()}</small></td>
          <td>${projectStatuses[project.status]} · ${projectAccessLabel(project)}</td>
          <td class="actions">
            <button class="ghost" data-edit-project="${project.id}">Редактировать</button>
            <button class="ghost" data-project-night="${project.id}">${project.nightShift ? "Ночь включена" : "Открыть ночь"}</button>
            <button class="ghost" data-project-access="${project.id}">Доступ сотрудникам</button>
            ${
              project.status === "active"
                ? `<button class="ghost" data-project-status="${project.id}:paused">На паузу</button><button class="ghost" data-project-status="${project.id}:completed">Завершить объект</button>`
                : project.status === "completed"
                  ? `<button class="ghost" data-project-status="${project.id}:active">Открыть снова</button><button class="ghost" data-project-status="${project.id}:archived">В архив</button>`
                  : `<button class="ghost" data-project-status="${project.id}:active">Активировать</button>`
            }
            ${canDeleteProject(project.id) ? `<button class="danger" data-delete-project="${project.id}">Удалить</button>` : ""}
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
  document.querySelectorAll("[data-edit-project]").forEach((button) => {
    button.addEventListener("click", () => openProjectEditModal(button.dataset.editProject));
  });
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
  document.querySelectorAll("[data-project-access]").forEach((button) => {
    button.addEventListener("click", () => openProjectAccessModal(button.dataset.projectAccess));
  });
  document.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const project = byId(state.projects, button.dataset.deleteProject);
      if (!canDeleteProject(project.id)) return;
      if (!confirm(`Удалить ошибочно созданный объект ${project.name}?`)) return;
      state.projects = state.projects.filter((item) => item.id !== project.id);
      saveState();
      render();
    });
  });
}

function openProjectEditModal(projectId) {
  const project = byId(state.projects, projectId);
  openModal(
    `Редактировать объект: ${project.name}`,
    `<form id="projectEditForm" class="form-grid">
      <label>Название<input id="editProjectName" required value="${project.name}" /></label>
      <label>Старт проекта<input id="editProjectStart" type="date" required value="${project.startDate || today()}" /></label>
      <button class="primary" type="submit">Сохранить объект</button>
    </form>`,
  );
  document.querySelector("#projectEditForm").addEventListener("submit", (event) => {
    event.preventDefault();
    project.name = value("editProjectName").trim();
    project.startDate = value("editProjectStart");
    saveState();
    closeModal();
    render();
  });
}

function projectAccessLabel(project) {
  if (project.accessMode !== "selected") return "доступ всем";
  return project.allowedUserIds.length ? `доступ: ${project.allowedUserIds.map(userName).join(", ")}` : "доступ закрыт";
}

function canDeleteProject(projectId) {
  return !state.entries.some((entry) => entry.projectId === projectId) && !state.bonuses.some((bonus) => bonus.projectId === projectId) && !state.payments.some((payment) => payment.projectId === projectId);
}

function openProjectAccessModal(projectId) {
  const project = byId(state.projects, projectId);
  openModal(
    `Доступ: ${project.name}`,
    `<form id="projectAccessForm" class="form-grid">
      <div class="modal-actions">
        <button type="button" class="primary" data-access-all>Разрешить всем</button>
        <button type="button" class="ghost" data-access-none>Запретить всем</button>
      </div>
      <div class="permission-grid">
        ${workers(true)
          .filter((worker) => worker.status !== "fired")
          .map((worker) => `<label class="check-row"><input type="checkbox" data-project-user="${worker.id}" ${project.accessMode !== "selected" || project.allowedUserIds.includes(worker.id) ? "checked" : ""} /> ${worker.name}</label>`)
          .join("")}
      </div>
      <button class="primary" type="submit">Сохранить доступ</button>
    </form>`,
  );
  document.querySelector("[data-access-all]").addEventListener("click", () => {
    document.querySelectorAll("[data-project-user]").forEach((input) => (input.checked = true));
  });
  document.querySelector("[data-access-none]").addEventListener("click", () => {
    document.querySelectorAll("[data-project-user]").forEach((input) => (input.checked = false));
  });
  document.querySelector("#projectAccessForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const allowed = [...document.querySelectorAll("[data-project-user]:checked")].map((input) => input.dataset.projectUser);
    const total = [...document.querySelectorAll("[data-project-user]")].length;
    project.accessMode = allowed.length === total ? "all" : "selected";
    project.allowedUserIds = allowed;
    saveState();
    closeModal();
    render();
  });
}

function renderObjectReport() {
  const month = selectedMonth();
  const opened = localStorage.getItem(OPEN_PROJECT_KEY);
  const project = state.projects.find((item) => item.id === opened);
  view().innerHTML = `
    <section class="page">
      ${pageHead("Отчет по объектам", "Общая сводка по объектам и провал в детализацию по выбранному объекту.")}
      ${project ? projectFullReport(project, month) : projectButtons()}
    </section>
  `;
  if (project) bindMonthControl();
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

function projectButtons() {
  return `
    <div class="object-buttons">
      ${visibleProjects()
        .map((project) => {
          const accrued = projectAccruedTotal(project.id);
          const paid = projectPaidTotal(project.id);
          const balance = Math.max(0, accrued - paid);
          return `
            <button data-open-project="${project.id}" class="object-button">
              <strong>${project.name}</strong>
              <span>${projectStatuses[project.status]}</span>
              <em>Зарплатный фонд ${money(accrued)} · выплачено ${money(paid)} · остаток ${money(balance)}</em>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function projectFullReport(project, month) {
  const accrued = projectAccruedTotal(project.id);
  const paid = projectPaidTotal(project.id);
  const balance = Math.max(0, accrued - paid);
  return `
    <section class="card">
      <div class="card-head">
        <h3>${project.name}</h3>
        <button class="ghost" data-back-projects>К объектам</button>
      </div>
      <div class="metrics three">
        ${metric("Зарплатный фонд", money(accrued))}
        ${metric("Выплачено", money(paid))}
        ${metric("Остаток", money(balance))}
      </div>
      <div class="object-meta">
        <span>Старт проекта: ${formatDate(project.startDate || today())}</span>
        <span>Статус: ${projectStatuses[project.status]}</span>
      </div>
      ${projectWorkerTotals(project)}
      ${monthControl(month)}
      ${projectCalendarTable(project, month)}
    </section>
  `;
}

function projectWorkerTotals(project) {
  const rows = workers(true)
    .map((worker) => {
      const accrued = projectAccruedTotal(project.id, worker.id);
      const paid = projectPaidTotal(project.id, worker.id);
      if (!accrued && !paid) return "";
      return `<tr><td>${worker.name}</td><td>${money(accrued)}</td><td>${money(paid)}</td><td>${money(Math.max(0, accrued - paid))}</td></tr>`;
    })
    .join("");
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr><th>Сотрудник</th><th>Заработал на объекте</th><th>Выплачено</th><th>Остаток</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4">По объекту пока нет начислений.</td></tr>`}</tbody>
      </table>
    </div>
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
      ${pageHead("Зарплатный фонд", "Расчет с сотрудниками по всем незакрытым периодам и объектам.")}
      <div class="card">
        ${payrollTable(month)}
      </div>
    </section>
  `;
  document.querySelectorAll("[data-pay-worker]").forEach((button) => {
    button.addEventListener("click", () => openPayModal(button.dataset.payWorker));
  });
  document.querySelector("[data-open-bonus]")?.addEventListener("click", () => openPayrollBonusModal(month));
  document.querySelector("[data-open-payments]")?.addEventListener("click", () => {
    activeView = "payments";
    render();
  });
}

function payrollTable(month) {
  const rows = workers(true)
    .map((worker) => {
      const accrued = workerOpenDebtAll(worker.id).reduce((sum, item) => sum + Math.max(0, item.accrued), 0);
      const allocated = workerAllocatedAll(worker.id);
      const paid = workerCashPaidAll(worker.id);
      const advance = workerAdvanceBalanceAll(worker.id);
      const debt = workerOpenDebtTotal(worker.id);
      return `
        <tr>
          <td>${worker.name}</td>
          <td>${worker.position || ""}</td>
          <td>${money(accrued)}</td>
          <td>${money(paid)}</td>
          <td>${money(allocated)}</td>
          <td>${money(advance)}</td>
          <td>${money(debt)}</td>
          <td><button class="primary small-btn" data-pay-worker="${worker.id}">Выдать зарплату</button></td>
        </tr>
      `;
    })
    .join("");
  const totalDebt = workers(true).reduce((sum, worker) => sum + workerOpenDebtTotal(worker.id), 0);
  return `
    <div class="card-head">
      <h3>Расчет по всем открытым периодам</h3>
      <div class="actions">
        <span class="chip gold">Открытый долг ${money(totalDebt)}</span>
        <button class="ghost small-btn" data-open-payments>Все выплаты</button>
        <button class="secondary small-btn" data-open-bonus>Выдать премию</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Сотрудник</th><th>Должность</th><th>Начислено всего</th><th>Выдано денег</th><th>Распределено</th><th>Аванс</th><th>Открытый долг</th><th></th></tr></thead>
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

function openPayModal(userId) {
  const user = byId(state.users, userId);
  const balances = workerOpenDebtAll(userId);
  const advance = workerAdvanceBalanceAll(userId);
  openModal(
    `Выдать зарплату: ${user.name}`,
    `<form id="payForm" class="form-grid">
      <div class="notice">Сначала распределяется уже выданный аванс, потом новая выплата. В списке все незакрытые месяцы и объекты сотрудника.</div>
      <div class="pay-remainder">Аванс к распределению: <strong>${money(advance)}</strong></div>
      <label>Дата выплаты<input id="payDate" type="date" required value="${today()}" /></label>
      <label>Новая сумма выплаты<input id="payAmount" type="number" min="0" step="500" value="0" required /></label>
      <div id="payRemainder" class="pay-remainder">К распределению: ${money(advance)}</div>
      <div class="pay-object-list">
        ${balances
          .map((item, index) => `<button type="button" class="pay-object" data-pay-balance="${index}" ${item.balance <= 0 ? "disabled" : ""}><strong>${item.project.name}</strong><span>${item.month} · начислено ${money(item.accrued)} · оплачено ${money(item.paid)} · остаток ${money(item.balance)}</span></button>`)
          .join("") || `<div class="empty">По сотруднику нет открытых начислений.</div>`}
      </div>
      <div id="payAllocations" class="chips"></div>
      <button class="primary" type="submit">Сохранить выплату</button>
    </form>`,
  );
  document.querySelector(".modal")?.classList.add("modal-wide");
  const allocations = [];
  const amountInput = document.querySelector("#payAmount");
  const repaint = () => {
    const total = advance + Number(amountInput.value || 0);
    const used = allocations.reduce((sum, item) => sum + item.amount, 0);
    document.querySelector("#payRemainder").textContent = `К распределению: ${money(total - used)}`;
    document.querySelector("#payAllocations").innerHTML = allocations.map((item) => `<span class="chip green">${item.month} · ${projectName(item.projectId)} · ${money(item.amount)}</span>`).join("");
  };
  amountInput.addEventListener("input", repaint);
  document.querySelectorAll("[data-pay-balance]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const total = advance + Number(amountInput.value || 0);
      const used = allocations.reduce((sum, item) => sum + item.amount, 0);
      const remaining = total - used;
      if (remaining <= 0) return;
      const item = balances[Number(button.dataset.payBalance)];
      const balance = item?.balance || 0;
      const amount = Math.min(remaining, Math.max(balance, 0));
      if (amount <= 0) return;
      allocations.push({ projectId: item.project.id, month: item.month, amount });
      button.disabled = true;
      button.classList.add("is-used");
      repaint();
    });
  });
  document.querySelector("#payForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const newCash = Number(amountInput.value || 0);
    const payDate = value("payDate");
    const cashMonth = payDate.slice(0, 7);
    const batchId = crypto.randomUUID();
    if (newCash > 0) {
      state.payments.push({ id: crypto.randomUUID(), batchId, userId, projectId: ADVANCE_PROJECT_ID, month: cashMonth, amount: newCash, type: "cash", date: payDate, createdAt: new Date().toISOString() });
    }
    allocations.forEach((item) => {
      state.payments.push({ id: crypto.randomUUID(), batchId, userId, projectId: item.projectId, month: item.month, amount: item.amount, type: "allocation", date: payDate, createdAt: new Date().toISOString() });
    });
    saveState();
    closeModal();
    render();
  });
}

function paymentBatches() {
  const payments = [...state.payments].sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
  const batches = new Map();
  payments.forEach((payment) => {
    const key = payment.batchId || payment.id;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(payment);
  });
  return [...batches.entries()].map(([batchId, items]) => ({ batchId, items }));
}

function renderPaymentsView() {
  const rows = paymentBatches()
    .map(({ batchId, items }) => paymentBatchRow(batchId, items))
    .join("");
  view().innerHTML = `
    <section class="page">
      ${pageHead("Все выплаты", "Полный журнал выплат с редактированием даты, суммы и распределения по объектам.")}
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Дата</th><th>Сотрудник</th><th>Выдано</th><th>Распределено</th><th>Куда ушло</th><th></th></tr></thead>
            <tbody>${rows || `<tr><td colspan="6">Выплат пока нет.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </section>
  `;
  document.querySelectorAll("[data-edit-payment]").forEach((button) => {
    button.addEventListener("click", () => openEditPaymentModal(button.dataset.editPayment));
  });
}

function paymentBatchRow(batchId, items) {
  const cash = items.filter((item) => item.type === "cash" || item.type === "legacy").reduce((sum, item) => sum + item.amount, 0);
  const allocated = items.filter((item) => item.type === "allocation" || item.type === "legacy").reduce((sum, item) => sum + item.amount, 0);
  const first = items[0];
  const detail = items
    .filter((item) => item.projectId !== ADVANCE_PROJECT_ID)
    .map((item) => `${item.month} · ${projectName(item.projectId)}: ${money(item.amount)}`)
    .join("; ");
  return `<tr><td>${first.date}</td><td>${userName(first.userId)}</td><td>${money(cash)}</td><td>${money(allocated)}</td><td>${detail || "оставлено авансом"}</td><td><button class="primary small-btn" data-edit-payment="${batchId}">Редактировать</button></td></tr>`;
}

function openPaymentsModal(month) {
  const rows = paymentBatches()
    .filter(({ items }) => items.some((payment) => payment.month === month || payment.date.startsWith(month)))
    .map(({ batchId, items }) => paymentBatchRow(batchId, items))
    .join("");
  openModal(
    `Выплаты за ${month}`,
    `<div class="table-wrap">
      <table>
        <thead><tr><th>Дата</th><th>Сотрудник</th><th>Выдано</th><th>Распределено</th><th>Куда ушло</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6">Выплат за месяц нет.</td></tr>`}</tbody>
      </table>
    </div>`,
  );
  document.querySelectorAll("[data-edit-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal();
      openEditPaymentModal(button.dataset.editPayment);
    });
  });
}

function openEditPaymentModal(batchId) {
  const items = state.payments.filter((payment) => (payment.batchId || payment.id) === batchId);
  if (!items.length) return;
  const first = items[0];
  const cash = items.filter((item) => item.type === "cash" || item.type === "legacy").reduce((sum, item) => sum + item.amount, 0);
  const currentAllocations = items.filter((item) => item.projectId !== ADVANCE_PROJECT_ID && (item.type === "allocation" || item.type === "legacy"));
  const balances = workerOpenDebtForEdit(first.userId, batchId);
  const balanceOptions = balances.map((item, index) => {
    const current = currentAllocations.filter((allocation) => allocation.projectId === item.project.id && allocation.month === item.month).reduce((sum, allocation) => sum + allocation.amount, 0);
    return `<label class="allocation-row"><span>${item.month} · ${item.project.name}<small>остаток без этой выплаты ${money(Math.max(0, item.balance))}</small></span><input type="number" min="0" step="500" data-edit-allocation="${index}" value="${current || ""}" /></label>`;
  }).join("");
  openModal(
    `Редактировать выплату: ${userName(first.userId)}`,
    `<form id="editPaymentForm" class="form-grid">
      <div class="notice">Измените дату, сумму выдачи и суммы списания по объектам. Если сумма выдачи больше распределения, остаток останется авансом.</div>
      <label>Дата выплаты<input id="editPaymentDate" type="date" required value="${first.date}" /></label>
      <label>Сумма выдачи<input id="editPaymentCash" type="number" min="0" step="500" required value="${cash}" /></label>
      <div class="pay-object-list">${balanceOptions || `<div class="empty">Открытых начислений для распределения нет.</div>`}</div>
      <div id="editPaymentSummary" class="pay-remainder"></div>
      <div class="modal-actions">
        <button class="primary" type="submit">Сохранить выплату</button>
        <button class="danger" type="button" data-delete-payment>Удалить выплату</button>
      </div>
    </form>`,
  );
  document.querySelector(".modal")?.classList.add("modal-wide");
  const repaint = () => {
    const paid = Number(value("editPaymentCash") || 0);
    const allocated = [...document.querySelectorAll("[data-edit-allocation]")].reduce((sum, input) => sum + Number(input.value || 0), 0);
    document.querySelector("#editPaymentSummary").textContent = `Выдано ${money(paid)} · распределено ${money(allocated)} · аванс после сохранения ${money(Math.max(0, paid - allocated))}`;
  };
  document.querySelector("#editPaymentCash").addEventListener("input", repaint);
  document.querySelectorAll("[data-edit-allocation]").forEach((input) => input.addEventListener("input", repaint));
  repaint();
  document.querySelector("[data-delete-payment]").addEventListener("click", () => {
    if (!confirm("Удалить эту выплату полностью?")) return;
    state.payments = state.payments.filter((payment) => (payment.batchId || payment.id) !== batchId);
    saveState();
    closeModal();
    renderPaymentsView();
  });
  document.querySelector("#editPaymentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const payDate = value("editPaymentDate");
    const cashAmount = Number(value("editPaymentCash") || 0);
    const allocations = [...document.querySelectorAll("[data-edit-allocation]")]
      .map((input) => ({ item: balances[Number(input.dataset.editAllocation)], amount: Number(input.value || 0) }))
      .filter((allocation) => allocation.item && allocation.amount > 0);
    state.payments = state.payments.filter((payment) => (payment.batchId || payment.id) !== batchId);
    if (cashAmount > 0) {
      state.payments.push({ id: crypto.randomUUID(), batchId, userId: first.userId, projectId: ADVANCE_PROJECT_ID, month: payDate.slice(0, 7), amount: cashAmount, type: "cash", date: payDate, createdAt: first.createdAt || new Date().toISOString() });
    }
    allocations.forEach(({ item, amount }) => {
      state.payments.push({ id: crypto.randomUUID(), batchId, userId: first.userId, projectId: item.project.id, month: item.month, amount, type: "allocation", date: payDate, createdAt: first.createdAt || new Date().toISOString() });
    });
    saveState();
    closeModal();
    renderPaymentsView();
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

function renderDataTools() {
  const counts = [
    `сотрудников: ${state.users.length}`,
    `объектов: ${state.projects.length}`,
    `отметок: ${state.entries.length}`,
    `выплат: ${state.payments.length}`,
  ].join(" · ");
  view().innerHTML = `
    <section class="page">
      ${pageHead("База", "Перенос и резервная копия данных. Это нужно, чтобы не потерять то, что уже заведено на телефоне.")}
      <section class="card stack">
        <div class="notice">Сейчас данные этой версии хранятся в браузере. Для переноса нажмите “Экспорт базы” на том устройстве, где уже заведены сотрудники, объекты и пароли.</div>
        <div class="metrics three">
          ${metric("Текущая база", counts)}
          ${metric("Ключ хранения", STORAGE_KEY)}
          ${metric("Экспорт", "JSON-файл")}
        </div>
        <div class="actions">
          <button class="primary" data-export-db>Экспорт базы</button>
          <button class="ghost" data-copy-db>Скопировать JSON</button>
        </div>
      </section>
      <section class="card stack">
        <h3>Импорт базы</h3>
        <p class="muted">Импорт полностью заменит локальные данные на этом устройстве выбранным JSON-файлом.</p>
        <input id="importDbFile" type="file" accept="application/json,.json" />
        <button class="danger" data-import-db>Импортировать и заменить локальную базу</button>
      </section>
      <section class="card stack">
        <h3>Постоянная общая база</h3>
        <div class="notice">GitHub Pages не принимает записи от сотрудников. Для общей рабочей базы нужен отдельный backend/API. Этот экран сохраняет и переносит текущую базу, а запись с разных телефонов включается после подключения backend.</div>
      </section>
    </section>
  `;
  document.querySelector("[data-export-db]").addEventListener("click", () => {
    downloadTextFile(`tsk-timesheet-${today()}.json`, JSON.stringify(stateExportPayload(), null, 2));
  });
  document.querySelector("[data-copy-db]").addEventListener("click", async () => {
    const text = JSON.stringify(stateExportPayload());
    await navigator.clipboard.writeText(text);
    uiMessage = "JSON базы скопирован.";
    render();
  });
  document.querySelector("[data-import-db]").addEventListener("click", () => {
    const file = document.querySelector("#importDbFile").files[0];
    if (!file) {
      alert("Выберите JSON-файл базы.");
      return;
    }
    if (!confirm("Заменить локальную базу на этом устройстве выбранным файлом?")) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const payload = JSON.parse(reader.result);
        const importedState = payload.state || payload;
        state = normalizeState(importedState);
        saveState();
        uiMessage = "База импортирована.";
        render();
      } catch {
        alert("Не удалось прочитать JSON базы.");
      }
    });
    reader.readAsText(file);
  });
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
  const current = openEntryForUser(user.id);
  const canNight = current && byId(state.projects, current.projectId)?.nightShift && new Date().getHours() >= 18 && !current.night;
  view().innerHTML = `
    <section class="page">
      ${pageHead("Отметиться на объекте", "Если работа идет на втором объекте, отметьтесь по приходе на него.")}
      <section class="card checkin-box">
        ${uiMessage ? `<div class="notice">${uiMessage}</div>` : ""}
        <p class="eyebrow">Сегодня</p>
        <h2>${formatDate(today())}</h2>
        ${current ? `<button id="finishWorkBtn" class="big-action">Завершить работу</button>` : `<button id="checkinBtn" class="big-action">${todaysEntries.length ? "Пришел на другой объект" : "Отметиться на объекте"}</button>`}
        ${
          current
            ? `<div class="current-project"><span>Вы сейчас на объекте</span><strong>${projectName(current.projectId)}${current.night ? " Н" : ""}</strong><div class="actions"><button id="changeProjectBtn" class="ghost">Изменить объект</button>${canNight ? `<button id="nightShiftBtn" class="secondary">Ночная смена</button>` : ""}</div></div>`
            : `<span class="chip">${todaysEntries.length ? "Сейчас отдыхаете" : "Сегодня отметок нет"}</span>`
        }
        <div class="entry-history">${todaysEntries.map(checkinHistoryRow).join("") || `<div class="empty">Истории за сегодня пока нет.</div>`}</div>
      </section>
    </section>
  `;
  uiMessage = "";
  document.querySelector("#checkinBtn")?.addEventListener("click", () => {
    if (todaysEntries.length >= 2) {
      uiMessage = "Сегодня уже закрыты два объекта. Третий объект отправьте запросом администратору.";
      render();
      return;
    }
    openProjectPicker(user, todaysEntries.length ? "second" : "first");
  });
  document.querySelector("#finishWorkBtn")?.addEventListener("click", () => {
    current.endedAt = new Date().toISOString();
    addLog({ userId: user.id, projectId: current.projectId, entryId: current.id, type: "finish", text: "Сотрудник завершил работу" });
    saveState();
    uiMessage = `Работа на объекте ${projectName(current.projectId)} завершена.`;
    render();
  });
  document.querySelector("#changeProjectBtn")?.addEventListener("click", () => openProjectPicker(user, "replace", current.id));
  document.querySelectorAll("[data-change-entry]").forEach((button) => {
    button.addEventListener("click", () => openProjectPicker(user, "replace", button.dataset.changeEntry));
  });
  document.querySelectorAll("[data-cancel-entry]").forEach((button) => {
    button.addEventListener("click", () => {
      state.entries = state.entries.filter((entry) => entry.id !== button.dataset.cancelEntry);
      addLog({ userId: user.id, projectId: "", entryId: button.dataset.cancelEntry, type: "cancel", text: "Сотрудник отменил работу на объекте" });
      saveState();
      uiMessage = "Работа на объекте отменена.";
      render();
    });
  });
  document.querySelector("#nightShiftBtn")?.addEventListener("click", () => {
    current.night = true;
    current.changedAt = new Date().toISOString();
    addLog({ userId: user.id, projectId: current.projectId, entryId: current.id, type: "night", text: "Сотрудник отметил ночную смену" });
    saveState();
    uiMessage = `Ночная смена по объекту ${projectName(current.projectId)} отмечена.`;
    render();
  });
}

function checkinHistoryRow(entry) {
  const open = isEntryOpen(entry);
  return `
    <div class="history-row ${open ? "is-open" : ""}">
      <div>
        <strong>${projectName(entry.projectId)}${entry.night ? " Н" : ""}</strong>
        <span>пришел ${formatTime(entry.checkedAt)} · ${endLabel(entry)}</span>
      </div>
      ${open ? `<div class="actions">
        <button class="ghost small-btn" data-change-entry="${entry.id}">Изменить</button>
        <button class="danger small-btn" data-cancel-entry="${entry.id}">Отменить работу</button>
      </div>` : ""}
    </div>
  `;
}

function openProjectPicker(user, mode = "first", entryId = "") {
  const availableProjects = activeProjectsForUser(user.id);
  if (!availableProjects.length) {
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
        ${availableProjects
          .map((project) => {
            const alreadyUsed = selected.some((entry) => entry.projectId === project.id && entry.id !== entryId);
            return `<button class="project-choice" ${(mode === "first" || mode === "second" || mode === "replace") && alreadyUsed ? "disabled" : ""} data-project-choice="${project.id}">${project.name}</button>`;
          })
          .join("")}
      </div>
    </div>
  `;
  openModal(mode === "replace" ? "Изменить объект" : mode === "second" ? "Второй объект" : "Выберите объект", body);
  document.querySelectorAll("[data-project-choice]").forEach((button) => {
    button.addEventListener("click", () => handleProjectChoice(user, button.dataset.projectChoice, mode, entryId));
  });
}

function handleProjectChoice(user, projectId, mode, entryId = "") {
  const entries = entriesForUserDate(user.id, today());
  if (mode === "replace") {
    const target = state.entries.find((entry) => entry.id === entryId) || entries.at(-1);
    const oldProjectId = target.projectId;
    target.projectId = projectId;
    target.changedAt = new Date().toISOString();
    addLog({ userId: user.id, projectId, entryId: target.id, type: "change", text: `Сотрудник изменил объект: ${projectName(oldProjectId)} -> ${projectName(projectId)}` });
  } else {
    upsertEntry(user.id, projectId, today(), mode === "second" ? "second-object" : "checkin");
    const entry = entriesForUserDate(user.id, today()).find((item) => item.projectId === projectId);
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
      ${uiMessage ? `<div class="notice">${uiMessage}</div>` : ""}
      <form id="manualForm" class="card form-grid">
        <label>Объект
          <select id="manualProject" required>${activeProjectsForUser(user.id).map((project) => `<option value="${project.id}">${project.name}</option>`).join("")}</select>
        </label>
        ${monthControl(month, { min: prevMonth, max: currentMonth })}
        <div class="month-days" id="monthDays">${monthButtons(month, user.id)}</div>
        <button class="primary" type="submit">Сохранить выбранные дни</button>
      </form>
    </section>
  `;
  uiMessage = "";
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
    uiMessage = "Выбранные дни сохранены.";
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
  const manualSource = source === "manual" || source === "admin-approved";
  const entry = {
    id: crypto.randomUUID(),
    userId,
    projectId,
    date,
    source,
    checkedAt: manualSource ? isoAt(date, "09:00") : new Date().toISOString(),
    endedAt: manualSource ? isoAt(date, "18:00") : "",
    changedAt: "",
    secondObject: existingDateEntries.length > 0,
    night: false,
  };
  state.entries.push(entry);
  addLog({
    userId,
    projectId,
    entryId: entry.id,
    type: source,
    text: manualSource ? "Рабочий день внесен вручную: 09:00-18:00" : source === "second-object" ? "Сотрудник пришел на другой объект" : "Сотрудник отметился на объекте",
  });
}

function renderMyDays(user) {
  const month = selectedMonth();
  const mode = localStorage.getItem(MY_DAYS_MODE_KEY) || "objects";
  const correctionMode = localStorage.getItem(MY_DAYS_CORRECTION_KEY) === "1";
  const entries = state.entries.filter((entry) => entry.userId === user.id && entry.date.startsWith(month));
  view().innerHTML = `
    <section class="page">
      ${pageHead("Мои рабочие дни", "Просмотр по объектам или табель за месяц.")}
      ${uiMessage ? `<div class="notice">${uiMessage}</div>` : ""}
      ${monthControl(month)}
      <div class="segmented">
        <button class="${mode === "objects" ? "active" : ""}" data-days-mode="objects">По объектам</button>
        <button class="${mode === "sheet" ? "active" : ""}" data-days-mode="sheet">Табель</button>
      </div>
      ${mode === "sheet" ? `<div class="actions"><button class="primary small-btn" data-start-sheet-correction>${correctionMode ? "Отправить выбранные корректировки" : "Отправить корректировки руководителю"}</button>${correctionMode ? `<button class="ghost small-btn" data-cancel-sheet-correction>Отмена</button>` : ""}</div>` : ""}
      <div class="card">${entries.length || correctionMode ? (mode === "objects" ? workerObjectList(entries) : workerMonthSheet(user, month, { editable: correctionMode })) : `<div class="empty">За этот месяц отметок нет.</div>`}</div>
    </section>
  `;
  uiMessage = "";
  bindMonthControl();
  document.querySelectorAll("[data-days-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.setItem(MY_DAYS_MODE_KEY, button.dataset.daysMode);
      render();
    });
  });
  document.querySelector("[data-start-sheet-correction]")?.addEventListener("click", () => {
    if (!correctionMode) {
      localStorage.setItem(MY_DAYS_CORRECTION_KEY, "1");
      render();
      return;
    }
    sendSheetCorrections(user, month);
  });
  document.querySelector("[data-cancel-sheet-correction]")?.addEventListener("click", () => {
    localStorage.removeItem(MY_DAYS_CORRECTION_KEY);
    render();
  });
  document.querySelectorAll("[data-correct-cell]").forEach((cell) => {
    cell.addEventListener("click", () => {
      if (!correctionMode) return;
      if (cell.dataset.hasEntry === "1") cell.classList.toggle("request-remove");
      else cell.classList.toggle("request-add");
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

function workerMonthSheet(user, month, options = {}) {
  const editable = Boolean(options.editable);
  const projects = editable ? activeProjectsForUser(user.id) : visibleProjects().filter((project) => state.entries.some((entry) => entry.userId === user.id && entry.projectId === project.id && entry.date.startsWith(month)));
  const rows = projects
    .map((project) => {
      const cells = Array.from({ length: daysInMonth(month) }, (_, index) => {
        const date = dateInMonth(month, index + 1);
        const entry = state.entries.find((item) => item.userId === user.id && item.projectId === project.id && item.date === date);
        const common = `${isWeekend(date) ? "weekend " : ""}${editable ? "correct-cell " : ""}`;
        if (!entry) return `<td class="${common}" ${editable ? `data-correct-cell data-has-entry="0" data-project="${project.id}" data-date="${date}"` : ""}></td>`;
        return `<td class="${common}${entry.secondObject ? "mark-extra" : "mark-full"}" ${editable ? `data-correct-cell data-has-entry="1" data-project="${project.id}" data-date="${date}"` : ""}>+${entry.night ? "Н" : ""}</td>`;
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

function sendSheetCorrections(user, month) {
  const adds = new Map();
  const removes = new Map();
  document.querySelectorAll(".request-add, .request-remove").forEach((cell) => {
    const target = cell.classList.contains("request-add") ? adds : removes;
    if (!target.has(cell.dataset.project)) target.set(cell.dataset.project, []);
    target.get(cell.dataset.project).push(cell.dataset.date);
  });
  const createRequests = (items, action) => {
    items.forEach((dates, projectId) => {
      state.requests.unshift({
        id: crypto.randomUUID(),
        userId: user.id,
        createdAt: new Date().toISOString(),
        type: "timesheet",
        projectId,
        month,
        action,
        dates: dates.sort(),
        text: action === "add" ? "Прошу добавить рабочие дни из табеля." : "Прошу убрать ошибочные отметки из табеля.",
      });
    });
  };
  createRequests(adds, "add");
  createRequests(removes, "remove");
  if (!adds.size && !removes.size) {
    uiMessage = "Выберите изменения в табеле.";
    render();
    return;
  }
  saveState();
  localStorage.removeItem(MY_DAYS_CORRECTION_KEY);
  uiMessage = "Корректировки отправлены руководителю.";
  render();
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
          <label>Объект<select id="requestProject" required>${activeProjectsForUser(user.id).map((project) => `<option value="${project.id}">${project.name}</option>`).join("")}</select></label>
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
