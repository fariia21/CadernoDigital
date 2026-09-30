import { supabase, describeSupabaseError } from './supabase-client.js';

const passwordInput = document.querySelector('#password');
const togglePassword = document.querySelector('#toggle-password');
const form = document.querySelector('#login-form');
const message = document.querySelector('#form-message');
const emailInput = document.querySelector('#email');
const submitButton = form.querySelector('[type="submit"]');

supabase.auth.getSession().then(({ data, error }) => {
    if (!error && data.session) window.location.replace('dashboard.html');
});

togglePassword.addEventListener('click', () => {
    const isVisible = passwordInput.type === 'text';
    passwordInput.type = isVisible ? 'password' : 'text';
    togglePassword.setAttribute('aria-pressed', String(!isVisible));
    togglePassword.setAttribute('aria-label', isVisible ? 'Mostrar palavra-passe' : 'Ocultar palavra-passe');
    togglePassword.title = isVisible ? 'Mostrar palavra-passe' : 'Ocultar palavra-passe';
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !emailInput.validity.valid) {
        message.textContent = 'Introduz um e-mail válido.';
        emailInput.focus();
        return;
    }
    if (!password) {
        message.textContent = 'Introduz a tua palavra-passe.';
        passwordInput.focus();
        return;
    }

    submitButton.disabled = true;
    message.textContent = 'A iniciar sessão...';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    submitButton.disabled = false;
    if (error) {
        message.textContent = describeSupabaseError(error);
        passwordInput.focus();
        return;
    }
    window.location.assign('dashboard.html');
});
