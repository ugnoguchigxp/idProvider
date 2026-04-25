export type ApiClientOptions = {
  baseUrl?: string;
};

const isUnsafeMethod = (method: string): boolean =>
  method !== "GET" &&
  method !== "HEAD" &&
  method !== "OPTIONS" &&
  method !== "TRACE";

const getCookieValue = (name: string): string | undefined => {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`));
  if (!match) return undefined;
  return decodeURIComponent(match.slice(name.length + 1));
};

export class ApiClient {
  private readonly baseUrl: string;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = (init.method ?? "GET").toUpperCase();
    const csrfHeader = isUnsafeMethod(method)
      ? getCookieValue("idp_csrf_token")
      : undefined;

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrfHeader ? { "x-csrf-token": csrfHeader } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message =
        typeof body === "object" && body !== null && "message" in body
          ? String((body as { message: unknown }).message)
          : `Request failed: ${res.status}`;
      throw new Error(message);
    }

    return (await res.json()) as T;
  }
}

export const apiClient = new ApiClient();
