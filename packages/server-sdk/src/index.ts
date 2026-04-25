export type AuthorizationCheckRequest = {
  action: string;
  resource: string;
  organizationId?: string;
  groupId?: string;
};

export type AuthorizationCheckResponse = {
  allowed: boolean;
  permissionKey: string;
  source?: "role" | "none";
};

export type EntitlementCheckRequest = {
  key: string;
  organizationId?: string;
  groupId?: string;
  quantity?: number;
};

export type EntitlementCheckResponse = {
  granted: boolean;
  key: string;
  source: "user" | "group" | "organization" | "none";
  value?: Record<string, unknown> | boolean;
  reason: string;
};
