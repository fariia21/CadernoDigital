import { supabase, requireUser, signOut, describeSupabaseError } from './supabase-client.js';

const taskForm = document.querySelector('#task-form');
const taskList = document.querySelector('#task-list');
const taskDate = document.querySelector('#task-date');
const message = document.querySelector('#task-message');
let activeFilter = 'pending';
const today = new Date();
taskDate.value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
updateTodayDate();

function updateTodayDate() {
    document.querySelector('#today-date').textContent = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
}

function daysUntil(dateValue) {
    const [year, month, day] = dateValue.split('-').map(Number);
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const dueUtc = Date.UTC(year, month - 1, day);
    return Math.round((dueUtc - todayUtc) / 86400000);
}

function getTaskBucket(task) {
    if (task.is_done) return 'done';
    const remainingDays = daysUntil(task.due_date);
    if (remainingDays < 0) return 'overdue';
    if (remainingDays === 0) return 'today';
    return 'pending';
}

function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const twoDigits = (value) => String(value).padStart(2, '0');
    if (days > 0) return `${days}d ${twoDigits(hours)}h ${twoDigits(minutes)}m ${twoDigits(seconds)}s`;
    if (hours > 0) return `${hours}h ${twoDigits(minutes)}m ${twoDigits(seconds)}s`;
    return `${minutes}m ${twoDigits(seconds)}s`;
}

function refreshCountdownDisplays() {
    document.querySelectorAll('.task-countdown').forEach((counter) => {
        const remaining = Number(counter.dataset.deadline) - Date.now();
        const bucket = counter.dataset.bucket;
        let label;
        if (bucket === 'done') label = 'Concluída';
        else if (remaining <= 0) label = bucket === 'today' ? 'Prazo atingido' : `Atrasada há ${formatDuration(-remaining)}`;
        else label = bucket === 'today' ? `Termina em ${formatDuration(remaining)}` : `Faltam ${formatDuration(remaining)}`;
        counter.querySelector('.task-countdown-text').textContent = label;
    });
}

function updateTaskFilters(tasks) {
    const counts = { pending: 0, today: 0, overdue: 0, done: 0 };
    tasks.forEach((task) => { counts[getTaskBucket(task)] += 1; });
    Object.entries(counts).forEach(([bucket, count]) => {
        document.querySelector(`#count-${bucket}`).textContent = String(count);
    });
    document.querySelector('#task-count').textContent = `${tasks.filter((task) => !task.is_done).length} por fazer`;
    document.querySelectorAll('.task-filter').forEach((button) => {
        const selected = button.dataset.filter === activeFilter;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
}

function showMessage(error) {
    message.textContent = error ? describeSupabaseError(error) : '';
    message.classList.toggle('error-message', Boolean(error));
}

async function loadTasks() {
    const { data, error } = await supabase.from('study_tasks').select('*').order('due_date', { ascending: true }).order('due_time', { ascending: true });
    if (error) { showMessage(error); return []; }
    showMessage(null);
    return data || [];
}

async function renderTasks() {
    const tasks = await loadTasks();
    const visibleTasks = tasks.filter((task) => getTaskBucket(task) === activeFilter);
    updateTaskFilters(tasks);
    taskList.replaceChildren();
    if (!visibleTasks.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-files';
        const emptyMessages = {
            pending: 'Não tens tarefas futuras por fazer.',
            today: 'Não tens tarefas marcadas para hoje.',
            overdue: 'Não tens tarefas atrasadas.',
            done: 'Ainda não concluíste tarefas.'
        };
        empty.textContent = emptyMessages[activeFilter];
        taskList.append(empty);
        return;
    }
    visibleTasks.forEach((task) => {
        const bucket = getTaskBucket(task);
        const row = document.createElement('article');
        row.className = `task-row${bucket === 'done' ? ' is-done' : ''}${bucket === 'today' ? ' is-today' : ''}${bucket === 'overdue' ? ' is-overdue' : ''}`;
        const actions = document.createElement('div');
        actions.className = 'task-actions';
        const complete = document.createElement('button');
        complete.className = `task-complete-button${task.is_done ? ' is-complete' : ''}`;
        complete.type = 'button';
        complete.title = task.is_done ? 'Reabrir tarefa' : 'Concluir tarefa';
        complete.setAttribute('aria-label', `${task.is_done ? 'Reabrir' : 'Concluir'} tarefa: ${task.title}`);
        complete.setAttribute('aria-pressed', String(task.is_done));
        complete.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
        complete.addEventListener('click', async () => {
            complete.disabled = true;
            const { error } = await supabase.from('study_tasks').update({ is_done: !task.is_done }).eq('id', task.id);
            if (error) showMessage(error);
            renderTasks();
        });
        const content = document.createElement('div');
        content.className = 'task-description';
        const title = document.createElement('strong');
        title.textContent = task.title;
        const subject = document.createElement('span');
        subject.textContent = task.subject;
        content.append(title, subject);
        const schedule = document.createElement('time');
        schedule.className = 'task-schedule';
        const time = String(task.due_time).slice(0, 5);
        schedule.dateTime = `${task.due_date}T${time}`;
        schedule.textContent = `${new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(new Date(`${task.due_date}T12:00:00`))} · ${time}`;
        const deadline = document.createElement('time');
        deadline.className = `task-countdown countdown-${bucket}`;
        deadline.dataset.deadline = String(new Date(`${task.due_date}T${time}`).getTime());
        deadline.dataset.bucket = bucket;
        deadline.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span class="task-countdown-text"></span>';
        const remove = document.createElement('button');
        remove.className = 'file-action delete-file';
        remove.type = 'button';
        remove.title = 'Apagar tarefa';
        remove.setAttribute('aria-label', `Apagar tarefa: ${task.title}`);
        remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg>';
        remove.addEventListener('click', async () => {
            const { error } = await supabase.from('study_tasks').delete().eq('id', task.id);
            if (error) showMessage(error);
            renderTasks();
        });
        actions.append(complete, remove);
        const timing = document.createElement('div');
        timing.className = 'task-timing';
        timing.append(schedule, deadline);
        row.append(content, timing, actions);
        taskList.append(row);
    });
    refreshCountdownDisplays();
}

taskForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(taskForm);
    const submitButton = taskForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    const { error } = await supabase.from('study_tasks').insert({
        title: String(data.get('title')).trim(),
        subject: data.get('subject'),
        due_date: data.get('date'),
        due_time: data.get('time')
    });
    submitButton.disabled = false;
    if (error) { showMessage(error); return; }
    taskForm.reset();
    taskDate.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    activeFilter = getTaskBucket({ due_date: data.get('date'), is_done: false });
    showMessage(null);
    await renderTasks();
    document.querySelector('#task-title').focus();
});

document.querySelectorAll('.task-filter').forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    renderTasks();
}));
document.querySelector('#logout-button').addEventListener('click', signOut);
const user = await requireUser();
if (user) {
    await renderTasks();
    window.setInterval(refreshCountdownDisplays, 1000);
    const refreshAtMidnight = () => {
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
        setTimeout(async () => {
            updateTodayDate();
            await renderTasks();
            refreshAtMidnight();
        }, midnight.getTime() - now.getTime());
    };
    refreshAtMidnight();
}
