import { apiClient } from "./api-client";
import {
  type AdminConfigsResponse,
  type AuthorizationCheckResponse,
  adminConfigsResponseSchema,
  authorizationCheckResponseSchema,
  type SocialLoginUpdateInput,
  socialLoginUpdateSchema,
} from "./schemas";

export const getAdminConfigs = async (): Promise<AdminConfigsResponse> => {
  const data = await apiClient.request<unknown>("/v1/admin/configs", {
    method: "GET",
  });
  return adminConfigsResponseSchema.parse(data);
};

export const updateGoogleSocialLogin = async (
  input: SocialLoginUpdateInput,
): Promise<{ status: string }> => {
  socialLoginUpdateSchema.parse(input);
  return apiClient.request<{ status: string }>(
    "/v1/admin/configs/social-login/google",
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
};

export const checkPermission = async (
  permissionKey: string,
): Promise<AuthorizationCheckResponse> => {
  const [resource, action] = permissionKey.split(":");
  if (!resource || !action) {
    throw new Error(`Invalid permission key: ${permissionKey}`);
  }
  const data = await apiClient.request<unknown>("/v1/authorization/check", {
    method: "POST",
    body: JSON.stringify({
      resource,
      action,
    }),
  });
  return authorizationCheckResponseSchema.parse(data);
};
