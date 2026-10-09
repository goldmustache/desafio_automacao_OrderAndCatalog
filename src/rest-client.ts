import type { APIRequestContext, APIResponse } from '@playwright/test';

export class RestClient {
  constructor(private readonly request: APIRequestContext) {}

  get(path: string): Promise<APIResponse> {
    return this.request.get(path);
  }

  post<TBody>(path: string, body: TBody, headers?: Record<string, string>): Promise<APIResponse> {
    return this.request.post(path, { data: body, headers });
  }

  postRaw(path: string, body: string, headers: Record<string, string> = {}): Promise<APIResponse> {
    return this.request.post(path, {
      data: body,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  put<TBody>(path: string, body: TBody): Promise<APIResponse> {
    return this.request.put(path, { data: body });
  }

  patch<TBody>(path: string, body: Partial<TBody>): Promise<APIResponse> {
    return this.request.patch(path, { data: body });
  }

  delete(path: string): Promise<APIResponse> {
    return this.request.delete(path);
  }
}
