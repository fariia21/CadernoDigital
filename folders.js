import { supabase, requireUser, signOut, describeSupabaseError } from './supabase-client.js';

const fileInput = document.querySelector('#file-input');
const fileList = document.querySelector('#file-list');
const message = document.querySelector('#storage-message');
const folderForm = document.querySelector('#folder-form');
const folderList = document.querySelector('#folder-list');
const folderMessage = document.querySelector('#folder-message');
const deleteFolderButton = document.querySelector('#delete-folder');
const uploadDestination = document.querySelector('#upload-destination');
const summaryDestination = document.querySelector('#summary-destination');
const folderEmptyState = document.querySelector('#folder-empty-state');
const materialsSection = document.querySelector('.materials-section');
const summaryWorkspace = document.querySelector('.summary-workspace');
const summaryForm = document.querySelector('#summary-form');
const summaryList = document.querySelector('#summary-list');
const summaryMessage = document.querySelector('#summary-message');
const summarySaveButton = document.querySelector('#summary-save');
const summaryCancelButton = document.querySelector('#summary-cancel');
let currentKind = 'documents';
let currentView = 'documents';
let user;
let folders = [];
let selectedFolderId = '';

document.querySelector('#today-date').textContent = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('error-message', isError);
}

function setFolderMessage(error, text = '') {
    folderMessage.textContent = error ? describeSupabaseError(error) : text;
    folderMessage.classList.toggle('error-message', Boolean(error));
}

function updateFolderCardSelection() {
    folderList.querySelectorAll('.folder-choice').forEach((button) => {
        const selected = button.dataset.folderId === selectedFolderId;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
}

function updateFolderActions() {
    const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
    const hasFolders = folders.length > 0;
    folderEmptyState.hidden = hasFolders;
    materialsSection.hidden = !hasFolders;
    summaryWorkspace.hidden = !hasFolders || currentView !== 'summaries';
    deleteFolderButton.hidden = !selectedFolder;
    document.querySelector('#choose-files').disabled = !selectedFolder;
    uploadDestination.textContent = selectedFolder ? `Destino: ${selectedFolder.name}` : 'Seleciona uma pasta';
    summaryDestination.textContent = selectedFolder ? `Pasta: ${selectedFolder.name}` : '';
}

function clearSummaryEditor() {
    if (!summaryForm.elements.id.value) return;
    summaryForm.reset();
    summaryForm.elements.id.value = '';
    summarySaveButton.querySelector('span').textContent = 'Guardar resumo';
    summaryCancelButton.hidden = true;
    setSummaryMessage(null);
}

async function renderFolders() {
    const { data, error } = await supabase.from('study_folders').select('id, name').order('name', { ascending: true });
    if (error) {
        setFolderMessage(error);
        return;
    }
    folders = data || [];
    selectedFolderId = folders.some((folder) => folder.id === selectedFolderId)
        ? selectedFolderId
        : folders[0]?.id || '';

    const { data: fileRows, error: filesError } = await supabase.from('study_files').select('folder_id');
    if (filesError) setFolderMessage(filesError);
    const counts = new Map();
    (fileRows || []).forEach((file) => counts.set(file.folder_id, (counts.get(file.folder_id) || 0) + 1));

    folderList.replaceChildren();

    folders.forEach((folder) => {
        const button = document.createElement('button');
        button.className = 'folder-choice';
        button.type = 'button';
        button.dataset.folderId = folder.id;
        button.setAttribute('aria-pressed', String(selectedFolderId === folder.id));
        button.classList.toggle('active', selectedFolderId === folder.id);
        const icon = document.createElement('span');
        icon.className = 'folder-choice-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 9h18"/></svg>';
        const text = document.createElement('span');
        text.className = 'folder-choice-text';
        const name = document.createElement('strong');
        name.textContent = folder.name;
        const count = counts.get(folder.id) || 0;
        const total = document.createElement('small');
        total.textContent = `${count} ${count === 1 ? 'ficheiro' : 'ficheiros'}`;
        text.append(name, total);
        button.append(icon, text);
        button.addEventListener('click', () => {
            if (selectedFolderId !== folder.id) clearSummaryEditor();
            selectedFolderId = folder.id;
            updateFolderCardSelection();
            updateFolderActions();
            void Promise.all([renderFiles(), renderSummaries()]);
        });
        folderList.append(button);
    });
    updateFolderActions();
}

function refreshUploadMode(kind) {
    currentView = kind;
    const isSummaries = kind === 'summaries';
    const isPhotos = kind === 'photos';
    const uploadPanel = document.querySelector('#upload-panel');
    uploadPanel.hidden = isSummaries;
    summaryWorkspace.hidden = !isSummaries || folders.length === 0;
    document.querySelector('#summary-panel').setAttribute('aria-labelledby', 'tab-summaries');
    document.querySelector('#upload-panel').setAttribute('aria-labelledby', isPhotos ? 'tab-photos' : 'tab-documents');
    document.querySelectorAll('.material-tab').forEach((tab) => {
        const selected = tab.dataset.kind === kind;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
    });
    if (isSummaries) {
        renderSummaries();
        return;
    }

    currentKind = kind;
    fileInput.accept = isPhotos ? 'image/*' : '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    document.querySelector('#upload-title').textContent = isPhotos ? 'Adiciona fotos dos teus resumos' : 'Adiciona um resumo Word';
    document.querySelector('#upload-description').textContent = isPhotos ? 'Escolhe fotografias ou imagens dos teus apontamentos.' : 'Escolhe ficheiros .doc ou .docx para guardar na pasta de uma disciplina.';
    document.querySelector('#files-title').textContent = isPhotos ? 'As tuas fotos' : 'Os teus documentos';
    document.querySelector('#choose-files span').textContent = isPhotos ? 'Escolher fotos' : 'Escolher ficheiros';
    renderFiles();
}

function createActionIcon(path) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.7');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    icon.append(shape);
    return icon;
}

function setSummaryMessage(error, text = '') {
    summaryMessage.textContent = error ? describeSupabaseError(error) : text;
    summaryMessage.classList.toggle('error-message', Boolean(error));
}

async function renderSummaries() {
    summaryList.replaceChildren();
    if (!selectedFolderId) return;
    const { data: summaries, error } = await supabase.from('study_summaries')
        .select('*')
        .eq('folder_id', selectedFolderId)
        .order('updated_at', { ascending: false });
    if (error) {
        setSummaryMessage(error);
        const errorRow = document.createElement('p');
        errorRow.className = 'empty-files';
        errorRow.textContent = describeSupabaseError(error);
        summaryList.append(errorRow);
        return;
    }
    const savedSummaries = summaries || [];
    if (!savedSummaries.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-files';
        empty.textContent = 'Ainda não há resumos nesta pasta.';
        summaryList.append(empty);
        return;
    }

    savedSummaries.forEach((summary) => {
        const row = document.createElement('article');
        row.className = 'summary-row';
        const icon = document.createElement('span');
        icon.className = 'summary-icon';
        icon.textContent = 'Aa';
        const entry = document.createElement('div');
        entry.className = 'summary-entry';
        const title = document.createElement('strong');
        title.textContent = summary.title;
        const meta = document.createElement('span');
        meta.className = 'summary-meta';
        const summaryFolder = folders.find((folder) => folder.id === summary.folder_id);
        meta.textContent = `${summaryFolder?.name || summary.subject} · Atualizado em ${new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(summary.updated_at))}`;
        const excerpt = document.createElement('p');
        excerpt.className = 'summary-excerpt';
        excerpt.textContent = summary.content;
        entry.append(title, meta, excerpt);
        const actions = document.createElement('div');
        actions.className = 'summary-actions';
        const edit = document.createElement('button');
        edit.className = 'file-action';
        edit.type = 'button';
        edit.title = 'Editar resumo';
        edit.setAttribute('aria-label', `Editar resumo ${summary.title}`);
        edit.append(createActionIcon('M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z'));
        edit.addEventListener('click', () => {
            summaryForm.elements.id.value = summary.id;
            summaryForm.elements.title.value = summary.title;
            summaryForm.elements.content.value = summary.content;
            summarySaveButton.querySelector('span').textContent = 'Guardar alterações';
            summaryCancelButton.hidden = false;
            document.querySelector('#summary-title').focus();
            summaryForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        const remove = document.createElement('button');
        remove.className = 'file-action delete-file';
        remove.type = 'button';
        remove.title = 'Apagar resumo';
        remove.setAttribute('aria-label', `Apagar resumo ${summary.title}`);
        remove.append(createActionIcon('M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3'));
        remove.addEventListener('click', async () => {
            const { error: deleteError } = await supabase.from('study_summaries').delete().eq('id', summary.id);
            if (deleteError) { setSummaryMessage(deleteError); return; }
            setSummaryMessage(null, 'Resumo apagado.');
            await renderSummaries();
        });
        actions.append(edit, remove);
        row.append(icon, entry, actions);
        summaryList.append(row);
    });
}

async function renderFiles() {
    fileList.replaceChildren();
    if (!selectedFolderId) return;
    const { data: files, error } = await supabase.from('study_files')
        .select('*')
        .eq('file_kind', currentKind)
        .eq('folder_id', selectedFolderId)
        .order('created_at', { ascending: false });
    if (error) {
        document.querySelector('#file-count').textContent = 'Não foi possível carregar';
        setMessage(describeSupabaseError(error), true);
        return;
    }
    const savedFiles = files || [];
    document.querySelector('#file-count').textContent = `${savedFiles.length} ${currentKind === 'photos' ? (savedFiles.length === 1 ? 'foto' : 'fotos') : (savedFiles.length === 1 ? 'documento' : 'documentos')}`;
    if (!savedFiles.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-files';
        empty.textContent = currentKind === 'photos' ? 'Ainda não há fotos nesta pasta.' : 'Ainda não há documentos nesta pasta.';
        fileList.append(empty);
        return;
    }

    for (const file of savedFiles) {
        const signedOptions = currentKind === 'documents' ? { download: file.file_name } : {};
        const { data: signedFile, error: signedError } = await supabase.storage.from('study-files').createSignedUrl(file.storage_path, 3600, signedOptions);
        if (signedError) continue;
        const row = document.createElement('article');
        row.className = currentKind === 'photos' ? 'file-row photo-row' : 'file-row';
        if (currentKind === 'photos') {
            const preview = document.createElement('img');
            preview.className = 'file-preview';
            preview.alt = `Pré-visualização de ${file.file_name}`;
            preview.src = signedFile.signedUrl;
            const previewLink = document.createElement('a');
            previewLink.className = 'file-preview-link';
            previewLink.href = signedFile.signedUrl;
            previewLink.target = '_blank';
            previewLink.rel = 'noopener noreferrer';
            previewLink.setAttribute('aria-label', `Abrir imagem ${file.file_name}`);
            previewLink.append(preview);
            row.append(previewLink);
        } else {
            const icon = document.createElement('span');
            icon.className = 'document-icon';
            icon.textContent = 'W';
            row.append(icon);
        }
        const details = document.createElement('div');
        details.className = 'file-details';
        const name = document.createElement('strong');
        name.textContent = file.file_name;
        const meta = document.createElement('span');
        const savedFolder = folders.find((folder) => folder.id === file.folder_id);
        meta.textContent = `${savedFolder?.name || file.subject} · ${new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(file.created_at))}`;
        details.append(name, meta);
        const actions = document.createElement('div');
        actions.className = 'file-actions';
        const download = document.createElement('a');
        download.className = 'file-action';
        download.href = signedFile.signedUrl;
        download.rel = 'noopener noreferrer';
        if (currentKind === 'photos') {
            download.target = '_blank';
            download.setAttribute('aria-label', `Abrir imagem ${file.file_name}`);
            download.title = 'Abrir imagem';
        } else {
            download.download = file.file_name;
            download.setAttribute('aria-label', `Transferir ${file.file_name} para abrir no Word`);
            download.title = 'Transferir para abrir no Word';
        }
        download.append(createActionIcon('M14 4h6v6m0-6-9 9 M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5'));
        const remove = document.createElement('button');
        remove.className = 'file-action delete-file';
        remove.type = 'button';
        remove.title = 'Apagar';
        remove.setAttribute('aria-label', `Apagar ${file.file_name}`);
        remove.append(createActionIcon('M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3'));
        remove.addEventListener('click', async () => {
            const { error: deleteError } = await supabase.from('study_files').delete().eq('id', file.id);
            if (deleteError) { setMessage(describeSupabaseError(deleteError), true); return; }
            const { error: storageError } = await supabase.storage.from('study-files').remove([file.storage_path]);
            if (storageError) setMessage('O registo foi removido, mas não foi possível apagar o ficheiro do armazenamento.', true);
            await renderFolders();
            await renderFiles();
        });
        if (currentKind === 'documents') actions.append(download);
        actions.append(remove);
        row.append(details, actions);
        fileList.append(row);
    }
}

async function uploadFiles() {
    if (!fileInput.files.length || !user) return;
    const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
    if (!selectedFolder) {
        setMessage('Escolhe ou cria uma pasta antes de adicionar ficheiros.', true);
        fileInput.value = '';
        return;
    }
    const selectedFiles = Array.from(fileInput.files);
    const invalid = selectedFiles.find((file) => currentKind === 'photos' ? !file.type.startsWith('image/') : !/\.docx?$/i.test(file.name));
    if (invalid) {
        setMessage(currentKind === 'photos' ? 'Escolhe apenas ficheiros de imagem.' : 'Escolhe apenas ficheiros Word .doc ou .docx.', true);
        fileInput.value = '';
        return;
    }
    if (selectedFiles.some((file) => file.size > 50 * 1024 * 1024)) {
        setMessage('Cada ficheiro tem de ter menos de 50 MB.', true);
        fileInput.value = '';
        return;
    }

    const chooseButton = document.querySelector('#choose-files');
    chooseButton.disabled = true;
    setMessage('A carregar ficheiros...');
    for (const file of selectedFiles) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${user.id}/${selectedFolder.id}/${crypto.randomUUID()}-${safeName}`;
        const mimeType = file.type || (file.name.toLowerCase().endsWith('.doc') ? 'application/msword' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        const { error: uploadError } = await supabase.storage.from('study-files').upload(storagePath, file, { contentType: mimeType, upsert: false });
        if (uploadError) { setMessage(describeSupabaseError(uploadError), true); continue; }
        const { error: insertError } = await supabase.from('study_files').insert({
            subject: selectedFolder.name,
            folder_id: selectedFolder.id,
            file_kind: currentKind,
            file_name: file.name,
            storage_path: storagePath,
            mime_type: mimeType,
            file_size: file.size
        });
        if (insertError) {
            await supabase.storage.from('study-files').remove([storagePath]);
            setMessage(describeSupabaseError(insertError), true);
            continue;
        }
        setMessage(`${file.name} foi guardado.`);
    }
    fileInput.value = '';
    chooseButton.disabled = false;
    await renderFolders();
    await renderFiles();
}

for (const tab of document.querySelectorAll('.material-tab')) tab.addEventListener('click', () => refreshUploadMode(tab.dataset.kind));
document.querySelector('#choose-files').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', uploadFiles);
document.querySelector('#logout-button').addEventListener('click', signOut);
deleteFolderButton.addEventListener('click', async () => {
    const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
    if (!selectedFolder) return;
    const [fileResult, summaryResult] = await Promise.all([
        supabase.from('study_files').select('storage_path').eq('folder_id', selectedFolder.id),
        supabase.from('study_summaries').select('id').eq('folder_id', selectedFolder.id)
    ]);
    if (fileResult.error || summaryResult.error) {
        setFolderMessage(fileResult.error || summaryResult.error);
        return;
    }
    const savedFiles = fileResult.data || [];
    const savedSummaries = summaryResult.data || [];
    const fileLabel = savedFiles.length === 1 ? 'ficheiro' : 'ficheiros';
    const summaryLabel = savedSummaries.length === 1 ? 'resumo' : 'resumos';
    const warning = `Apagar a pasta "${selectedFolder.name}" e o seu conteúdo (${savedFiles.length} ${fileLabel} e ${savedSummaries.length} ${summaryLabel})? Esta ação é permanente.`;
    if (!window.confirm(warning)) return;

    deleteFolderButton.disabled = true;
    const paths = savedFiles.map((file) => file.storage_path);
    for (let index = 0; index < paths.length; index += 100) {
        const { error: storageError } = await supabase.storage.from('study-files').remove(paths.slice(index, index + 100));
        if (storageError) {
            deleteFolderButton.disabled = false;
            setFolderMessage(storageError);
            return;
        }
    }

    const { error: deleteError } = await supabase.from('study_folders').delete().eq('id', selectedFolder.id);
    deleteFolderButton.disabled = false;
    if (deleteError) {
        setFolderMessage(deleteError);
        return;
    }
    selectedFolderId = '';
    await renderFolders();
    updateFolderCardSelection();
    setFolderMessage(null, `A pasta "${selectedFolder.name}" foi apagada.`);
    await Promise.all([renderFiles(), renderSummaries()]);
});
folderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = folderForm.elements.name.value.trim();
    if (!name) return;
    const createButton = folderForm.querySelector('[type="submit"]');
    createButton.disabled = true;
    const { data, error } = await supabase.from('study_folders').insert({ name }).select('id').single();
    createButton.disabled = false;
    if (error) {
        setFolderMessage(error);
        return;
    }
    folderForm.reset();
    await renderFolders();
    selectedFolderId = data.id;
    updateFolderCardSelection();
    updateFolderActions();
    setFolderMessage(null, `A pasta "${name}" foi criada.`);
    await Promise.all([renderFiles(), renderSummaries()]);
});
summaryCancelButton.addEventListener('click', () => {
    summaryForm.reset();
    summaryForm.elements.id.value = '';
    summarySaveButton.querySelector('span').textContent = 'Guardar resumo';
    summaryCancelButton.hidden = true;
    setSummaryMessage(null);
});
summaryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
    if (!selectedFolder) {
        setSummaryMessage(null, 'Cria ou seleciona uma pasta antes de guardar o resumo.');
        return;
    }
    const summary = {
        title: summaryForm.elements.title.value.trim(),
        subject: selectedFolder.name,
        folder_id: selectedFolder.id,
        content: summaryForm.elements.content.value.trim()
    };
    const summaryId = summaryForm.elements.id.value;
    summarySaveButton.disabled = true;
    const result = summaryId
        ? await supabase.from('study_summaries').update({ ...summary, updated_at: new Date().toISOString() }).eq('id', summaryId).eq('folder_id', selectedFolder.id)
        : await supabase.from('study_summaries').insert(summary);
    summarySaveButton.disabled = false;
    if (result.error) { setSummaryMessage(result.error); return; }
    summaryForm.reset();
    summaryForm.elements.id.value = '';
    summarySaveButton.querySelector('span').textContent = 'Guardar resumo';
    summaryCancelButton.hidden = true;
    setSummaryMessage(null, summaryId ? 'Resumo atualizado.' : 'Resumo guardado.');
    await renderSummaries();
});
user = await requireUser();
if (user) {
    await renderFolders();
    await Promise.all([renderFiles(), renderSummaries()]);
}
