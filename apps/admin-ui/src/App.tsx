import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  checkPermission,
  getAdminConfigs,
  updateGoogleSocialLogin,
} from "./lib/admin-api";
import {
  type SocialLoginUpdateInput,
  socialLoginUpdateSchema,
} from "./lib/schemas";

export const App = () => {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ["admin-configs"],
    queryFn: getAdminConfigs,
  });
  const writePermissionQuery = useQuery({
    queryKey: ["permission", "admin.config:write"],
    queryFn: () => checkPermission("admin.config:write"),
    retry: false,
  });

  const form = useForm<SocialLoginUpdateInput>({
    resolver: zodResolver(socialLoginUpdateSchema),
    defaultValues: {
      providerEnabled: false,
      clientId: "",
      clientSecret: "",
    },
  });

  useEffect(() => {
    if (configQuery.data?.socialLogin.google) {
      form.reset(configQuery.data.socialLogin.google);
    }
  }, [configQuery.data, form]);

  const updateMutation = useMutation({
    mutationFn: updateGoogleSocialLogin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-configs"] });
    },
  });
  const canWriteConfig = writePermissionQuery.data?.allowed === true;
  const formDisabled = !canWriteConfig || updateMutation.isPending;

  return (
    <main className="container">
      <header className="pageHeader">
        <h1>Admin Settings</h1>
        <p>Cookie 認証を前提に設定を更新します。</p>
      </header>

      <section className="card">
        <h2>Google Social Login</h2>

        {configQuery.isLoading ? <p>Loading...</p> : null}
        {configQuery.isError ? (
          <p className="error">{String(configQuery.error)}</p>
        ) : null}
        {writePermissionQuery.isError ? (
          <p className="error">{String(writePermissionQuery.error)}</p>
        ) : null}
        {!writePermissionQuery.isLoading && !canWriteConfig ? (
          <p className="error">
            You do not have permission to update this setting.
          </p>
        ) : null}

        <form
          onSubmit={form.handleSubmit((values) =>
            updateMutation.mutate(values),
          )}
          className="form"
        >
          <label className="checkboxRow">
            <input
              type="checkbox"
              disabled={formDisabled}
              {...form.register("providerEnabled")}
            />
            Provider enabled
          </label>

          <label className="field">
            <span>Client ID</span>
            <input
              type="text"
              disabled={formDisabled}
              {...form.register("clientId")}
            />
            {form.formState.errors.clientId ? (
              <small className="error">
                {form.formState.errors.clientId.message}
              </small>
            ) : null}
          </label>

          <label className="field">
            <span>Client Secret</span>
            <input
              type="password"
              disabled={formDisabled}
              {...form.register("clientSecret")}
            />
            {form.formState.errors.clientSecret ? (
              <small className="error">
                {form.formState.errors.clientSecret.message}
              </small>
            ) : null}
          </label>

          <button type="submit" disabled={formDisabled}>
            {updateMutation.isPending ? "Saving..." : "Save"}
          </button>

          {updateMutation.isSuccess ? <p className="success">Saved</p> : null}
          {updateMutation.isError ? (
            <p className="error">{String(updateMutation.error)}</p>
          ) : null}
        </form>
      </section>
    </main>
  );
};
