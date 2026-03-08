import type { ErrorCodeValue } from './errors';

export interface ApiResponse {
    code: ErrorCodeValue;
}

export interface CreateSecretRequest {
    ciphertext: string;
    iv: string;
    salt: string;
    expiresIn: string;
    burnAfterReading?: boolean;
    maxViews?: number;
    hasPassword?: boolean;
}

export interface CreateSecretResponse extends ApiResponse {
    id: string;
    expiresAt: number;
    burnAfterReading: boolean;
}
export interface GetSecretResponse extends ApiResponse {
    ciphertext: string;
    iv: string;
    salt: string;
    burnAfterReading: boolean;
    hasPassword: boolean;
    expiresAt: number;
    maxViews: number;
    viewCount: number;
}
export interface DeleteSecretResponse extends ApiResponse {
    deleted: boolean;
}
export interface ApiErrorResponse extends ApiResponse {
    error: string;
}
