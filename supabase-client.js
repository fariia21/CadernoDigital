import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://oqgwsbbzeyjloogyfmbc.supabase.co';
const supabasePublishableKey = 'sb_publishable_MrilrJ_DlfNtOhJLDgvbTw_stkPJyem';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
    }
});

export async function requireUser() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
        window.location.replace('index.html');
        return null;
    }
    return data.session.user;
}

export async function signOut() {
    await supabase.auth.signOut();
    window.location.replace('index.html');
}

export function describeSupabaseError(error) {
    if (error?.message?.includes('Failed to fetch')) {
        return 'Não foi possível ligar ao Supabase. Confirma a ligação à internet e a configuração do projeto.';
    }
    if (error?.message?.toLowerCase().includes('invalid login credentials')) {
        return 'E-mail ou palavra-passe incorretos.';
    }
    return error?.message || 'Ocorreu um erro. Tenta novamente.';
}
