import { Agent, fetch as undiciFetch } from 'undici';

export interface FetchResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
  ok: boolean;
}

export interface FetchRequest {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  serializeBodyToJson?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
}

export class FetchErrorResponse<T = unknown> extends Error {
  public path?: string;
  public method?: string;
  public status?: number;
  public body?: T;
  public errorMessage: string;
  public errorType = 'FetchErrorResponse';

  constructor(props?: { path: string; method: string; status?: number; body?: T }) {
    const msg = `API [${props?.method ?? 'UNKNOWN'}] ${props?.path ?? 'UNKNOWN'} Failed with ${props?.status ?? 'UNKNOWN'}`;
    super(msg);
    this.errorMessage = `API [${props?.method ?? 'UNKNOWN'}] ${props?.path ?? 'UNKNOWN'} Failed with ${props?.status ?? 'UNKNOWN'}`;
    this.method = props?.method;
    this.status = props?.status;
    this.body = props?.body;
  }
}
export const isFetchResponseError = (item: unknown): item is FetchErrorResponse<undefined> => {
  return item !== null && typeof item === 'object' && 'errorType' in item && item['errorType'] == 'FetchErrorResponse';
};

export type FetchInputParameter = Parameters<typeof fetch>[0];
export type FetchOptionsParameter = Parameters<typeof fetch>[1] & { dispatcher?: Agent };

export class FetchService {
  constructor(
    protected props: {
      baseUrl: string;
      defaultHeaders?: Record<string, string>;
      defaultTimeout?: number;
      agent?: Agent;
    }
  ) {}

  async fetch(input: FetchInputParameter, init?: FetchOptionsParameter): Promise<Response> {
    // If dispatcher is present, use undici as it support mtls agent
    if (init?.dispatcher) {
      return await (undiciFetch as typeof fetch)(input, init);
    }
    // // otherwise use standard fetch
    return await fetch(input, init);
  }

  async request<T = unknown>(options: FetchRequest): Promise<FetchResponse<T>> {
    const { path, method = 'GET', body, headers = {}, timeout = 25000 } = options;

    const normalizedBase = this.props.baseUrl?.replace(/\/+$/, '') ?? '';
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${normalizedBase}${normalizedPath}`;

    const requestHeaders: Record<string, string> = {
      Accept: 'application/json',
      'Cache-Control': 'max-age=0',
      'Content-Type': 'application/json',
      ...(this.props.defaultHeaders ?? {}),
      ...headers,
    };

    let response: Response;
    try {
      response = await this.fetch(url, {
        method,
        headers: requestHeaders,
        body: body && requestHeaders['Content-Type'] == 'application/json' ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout),
        ...(this.props.agent ? { dispatcher: this.props.agent } : {}),
      } as FetchOptionsParameter);
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(`API request timmed out after ${timeout}ms`);
      }
      throw error;
    }

    let data: T;
    const raw = await response.text();

    // For cases outside of 200s
    if (!response.ok) {
      throw new FetchErrorResponse({
        status: response.status,
        method: method,
        path: path,
        body: raw,
      });
    }

    // If content type is json - deserialize it
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json') && raw) {
      try {
        data = JSON.parse(raw) as T;
      } catch {
        throw new Error('Received invalid JSON');
      }
    } else {
      data = raw as unknown as T;
    }

    return {
      status: response.status,
      headers: response.headers,
      body: data,
      ok: response.ok,
    };
  }

  get<T = unknown>(options: Omit<FetchRequest, 'method' | 'body'>): Promise<FetchResponse<T>> {
    return this.request<T>({ ...options, method: 'GET' });
  }

  delete<T = unknown>(options: Omit<FetchRequest, 'method' | 'body'>): Promise<FetchResponse<T>> {
    return this.request<T>({ ...options, method: 'DELETE' });
  }

  post<T = unknown>(options: Omit<FetchRequest, 'method'>): Promise<FetchResponse<T>> {
    return this.request<T>({ ...options, method: 'POST' });
  }

  patch<T = unknown>(options: Omit<FetchRequest, 'method'>): Promise<FetchResponse<T>> {
    return this.request<T>({ ...options, method: 'PATCH' });
  }
  put<T = unknown>(options: Omit<FetchRequest, 'method'>): Promise<FetchResponse<T>> {
    return this.request<T>({ ...options, method: 'PUT' });
  }
}
