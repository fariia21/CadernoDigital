import { supabase, requireUser, signOut, describeSupabaseError } from './supabase-client.js';

const form = document.querySelector('#link-form');
const list = document.querySelector('#links-list');
const filter = document.querySelector('#link-filter');
const message = document.querySelector('#link-message');
document.querySelector('#today-date').textContent = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

function showMessage(error, text = '') {
    message.textContent = error ? describeSupabaseError(error) : text;
    message.classList.toggle('error-message', Boolean(error));
}

async function loadLinks() {
    let query = supabase.from('study_links').select('*').order('created_at', { ascending: false });
    if (filter.value !== 'all') query = query.eq('category', filter.value);
    const { data, error } = await query;
    if (error) { showMessage(error); return null; }
    showMessage(null);
    return data || [];
}

function makeIcon(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    svg.append(shape);
    return svg;
}

async function renderLinks() {
    const links = await loadLinks();
    if (!links) return;
    list.replaceChildren();
    if (!links.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-files';
        empty.textContent = filter.value === 'all' ? 'Ainda não guardaste links. Adiciona o primeiro acima.' : `Ainda não tens links de ${filter.value}.`;
        list.append(empty);
        return;
    }
    links.forEach((link) => {
        const row = document.createElement('article');
        row.className = 'saved-link-row';
        const icon = document.createElement('span');
        icon.className = 'saved-link-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.append(makeIcon('M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7 M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7'));
        const details = document.createElement('div');
        details.className = 'saved-link-details';
        const title = document.createElement('strong');
        title.textContent = link.title;
        const address = document.createElement('span');
        address.textContent = link.url;
        details.append(title, address);
        const category = document.createElement('span');
        category.className = 'link-category';
        category.textContent = link.category;
        const open = document.createElement('a');
        open.className = 'file-action';
        open.href = link.url;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        open.title = 'Abrir link numa nova aba';
        open.setAttribute('aria-label', `Abrir ${link.title} numa nova aba`);
        open.append(makeIcon('M14 4h6v6m0-6-9 9 M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5'));
        const remove = document.createElement('button');
        remove.className = 'file-action delete-file';
        remove.type = 'button';
        remove.title = 'Apagar link';
        remove.setAttribute('aria-label', `Apagar ${link.title}`);
        remove.append(makeIcon('M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3'));
        remove.addEventListener('click', async () => {
            const { error } = await supabase.from('study_links').delete().eq('id', link.id);
            if (error) showMessage(error);
            renderLinks();
        });
        row.append(icon, details, category, open, remove);
        list.append(row);
    });
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    let url;
    try { url = new URL(String(data.get('url')).trim()); }
    catch { showMessage(null, 'Introdu um endereço válido, começado por https://.'); return; }
    if (!['http:', 'https:'].includes(url.protocol)) {
        showMessage(null, 'O link deve começar por http:// ou https://.');
        return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const { error } = await supabase.from('study_links').insert({
        title: String(data.get('title')).trim(),
        url: url.href,
        category: data.get('category')
    });
    button.disabled = false;
    if (error) { showMessage(error); return; }
    form.reset();
    showMessage(null, 'Link guardado.');
    await renderLinks();
    document.querySelector('#link-title').focus();
});

filter.addEventListener('change', renderLinks);
document.querySelector('#logout-button').addEventListener('click', signOut);
const user = await requireUser();
if (user) await renderLinks();
