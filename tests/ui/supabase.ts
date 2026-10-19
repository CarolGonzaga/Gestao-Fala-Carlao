// Local visual QA only: no credentials, external auth, or production database requests.
let session: any = new URLSearchParams(location.search).has('login')
  ? null
  : {
      access_token: 'qa-local-only',
      user: { id: 'qa-admin', email: 'admin@example.test' },
    };
let onAuthChange: (_event: string, value: any) => void = () => {};
async function fixture(path: string, body: unknown) {
  const response = await fetch('/api/fixture/' + path + location.search, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}
export const supabase: any = {
  auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: (callback: typeof onAuthChange) => {
      onAuthChange = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    signInWithPassword: async () => ({ error: { message: 'Login desabilitado no QA isolado' } }),
    signOut: async () => {
      session = null;
      onAuthChange('SIGNED_OUT', null);
    },
  },
  rpc: (name: string) =>
    name === 'is_admin' ? Promise.resolve({ data: true, error: null }) : fixture('rpc', { name }),
  from: (table: string) => {
    const operations: unknown[] = [];
    const builder: any = {};
    for (const method of [
      'select',
      'order',
      'limit',
      'eq',
      'ilike',
      'gte',
      'lt',
      'or',
      'range',
      'maybeSingle',
    ])
      builder[method] = (...args: unknown[]) => {
        operations.push([method, ...args]);
        return builder;
      };
    builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      fixture('table', { table, operations }).then(resolve, reject);
    return builder;
  },
};
