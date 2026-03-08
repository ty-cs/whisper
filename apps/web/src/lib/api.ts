import type {
  ApiErrorResponse,
  CreateSecretRequest,
  CreateSecretResponse,
  DeleteSecretResponse,
  GetSecretResponse,
} from '@whisper/core';
import ky, { HTTPError } from 'ky';

const api = ky.create({ prefixUrl: '/api' });

async function extractError(err: unknown): Promise<never> {
  if (err instanceof HTTPError) {
    const body = await err.response.json<ApiErrorResponse>().catch(() => null);
    throw new Error(body?.error ?? `Server error [${err.response.status}]`);
  }
  throw err;
}

export async function createSecret(
  body: CreateSecretRequest,
): Promise<CreateSecretResponse> {
  return api
    .post('secrets', { json: body })
    .json<CreateSecretResponse>()
    .catch(extractError);
}

export async function getSecret(id: string): Promise<GetSecretResponse> {
  return api.get(`secrets/${id}`).json<GetSecretResponse>().catch(extractError);
}

export async function deleteSecret(id: string): Promise<DeleteSecretResponse> {
  return api
    .delete(`secrets/${id}`)
    .json<DeleteSecretResponse>()
    .catch(extractError);
}

export async function checkHealth(): Promise<void> {
  await api.get('health').catch(extractError);
}
