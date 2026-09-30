import { requireUser, signOut } from './supabase-client.js';

document.querySelector('#today-date').textContent = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
}).format(new Date());

document.querySelector('#logout-button').addEventListener('click', signOut);
await requireUser();
