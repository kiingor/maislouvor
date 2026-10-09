import { offers } from './home-billing';
const blocked = async () => ({ data: null, error: new Error('Prévia local somente leitura') });
const user = { id: 'fixture-user', email: 'lider@example.test' };
const profile = { id: 'fixture-profile', user_id: user.id, full_name: 'Líder Demonstração',
  terms_version: '2026-10-07', privacy_version: '2026-10-08', terms_accepted_at: '2026-10-08T12:00:00Z',
  avatar_url: null, phone: null, notification_prefs: {} };
const member = { id: 'fixture-member', team_id: 'fixture-team', profile_id: profile.id, role: 'admin',
  instruments: ['Violão', 'Voz'], instrument_levels: {}, permissions: {}, profiles: profile };
export const context = { team_id: 'fixture-team', can_manage: true, app_user_id: 'fixture-customer', member_count: 1,
  products: offers.map(offer => offer.product), subscription: { plan: 'free', status: 'free', provider: 'manual',
    is_active: false, will_renew: false, entitlement_ids: [], is_unlimited: false } };
const channel: any = { on: () => channel, subscribe: () => channel };
export const supabase: any = {
  from(table: string) {
    let single = false;
    const q: any = new Proxy({}, { get(_target, name) {
      if (name === 'then') return (resolve: any) => {
        const rows = table === 'profiles' ? [profile] : table === 'team_members' ? [member] : [];
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null, count: rows.length }).then(resolve);
      };
      return () => {
        if (['insert', 'update', 'delete', 'upsert'].includes(String(name))) throw new Error('Prévia local somente leitura');
        if (name === 'single' || name === 'maybeSingle') single = true;
        return q;
      };
    } });
    return q;
  },
  rpc: async (name: string) => ({ data: name === 'get_team_billing_context' ? context
    : name === 'assistant_consent_prompts' ? { teams: [], member_notice: false }
    : name === 'assistant_my_status' ? { enabled: false, assistant_name: 'Asafe', ai_consent: { allowed: false } }
    : name === 'get_team_member_capacity' ? { member_count: 1, member_limit: 5, can_add_member: true, can_manage: true, is_unlimited: false, effective_plan: 'essencial' }
    : [], error: null }),
  auth: { getUser: async () => ({ data: { user }, error: null }), getSession: async () => ({ data: { session: { user } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: blocked, signInWithPassword: blocked, signInWithOAuth: blocked, signUp: blocked, setSession: blocked },
  functions: { invoke: blocked }, channel: () => channel, removeChannel: () => {},
  storage: { from: () => ({ createSignedUrl: blocked, upload: blocked, remove: blocked }) },
};
