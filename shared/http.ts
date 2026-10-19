// Never display an arbitrary HTML/plain-text error page (or its request identifiers).
export function apiErrorMessage(status: number, body: string) {
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof parsed.error === 'string'
    ) {
      return parsed.error;
    }
  } catch {
    /* Vercel platform errors are not JSON. */
  }
  if (body.includes('FUNCTION_INVOCATION_FAILED')) {
    return `O backend não iniciou na Vercel (HTTP ${status}). Verifique os logs da função e a versão implantada.`;
  }
  if (status === 404)
    return 'A rota da API não foi encontrada (HTTP 404). Verifique a implantação do backend.';
  return `Não foi possível acessar o backend (HTTP ${status}). Tente novamente ou confira os logs na Vercel.`;
}

export async function readApiJson<T>(response: Response): Promise<T> {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(
      'A API retornou uma página em vez de JSON. Verifique as rotas do backend na Vercel.',
    );
  }
  return response.json() as Promise<T>;
}
