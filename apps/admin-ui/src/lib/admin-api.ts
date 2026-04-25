import { apiClient } from "./api-client";
import {
  type AdminConfigsResponse,
  adminConfigsResponseSchema,
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
