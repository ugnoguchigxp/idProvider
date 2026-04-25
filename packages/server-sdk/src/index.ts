export type AuthorizationCheckRequest = {
  action: string;
  resource: string;
};

export type AuthorizationCheckResponse = {
  allowed: boolean;
  permissionKey: string;
};
