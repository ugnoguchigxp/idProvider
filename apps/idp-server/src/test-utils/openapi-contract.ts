import fs from "node:fs";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";

type AjvLike = {
  compile: (schema: unknown) => {
    (data: unknown): boolean;
    errors?: ErrorObject[] | null;
  };
};

const AjvCtor = Ajv2020 as unknown as new (options: {
  allErrors: boolean;
  strict: boolean;
  validateFormats: boolean;
  allowUnionTypes: boolean;
}) => AjvLike;

const ajv = new AjvCtor({
  allErrors: true,
  strict: false,
  validateFormats: false,
  allowUnionTypes: true,
});

type HttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head";

type OpenApiDocument = {
  paths?: Record<string, Record<string, any>>;
};

type ValidateResponseInput = {
  method: HttpMethod;
  path: string;
  status: number;
  body: unknown;
};

let specPromise: Promise<OpenApiDocument> | null = null;
const validatorCache = new Map<string, ReturnType<typeof ajv.compile>>();

const resolveSpecPath = () => {
  const candidates = [
    path.resolve(process.cwd(), "docs/openapi.yaml"),
    path.resolve(process.cwd(), "../../docs/openapi.yaml"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`openapi.yaml not found. tried: ${candidates.join(", ")}`);
  }
  return found;
};

const loadSpec = async () => {
  if (!specPromise) {
    specPromise = SwaggerParser.dereference(
      resolveSpecPath(),
    ) as Promise<OpenApiDocument>;
  }
  return specPromise;
};

const getResponseSchema = (
  spec: OpenApiDocument,
  method: HttpMethod,
  endpointPath: string,
  status: number,
) => {
  const pathItem = spec.paths?.[endpointPath];
  if (!pathItem) {
    throw new Error(`OpenAPI path not found: ${endpointPath}`);
  }

  const operation = pathItem[method];
  if (!operation) {
    throw new Error(
      `OpenAPI operation not found: ${method.toUpperCase()} ${endpointPath}`,
    );
  }

  const responses = operation.responses ?? {};
  const response = responses[String(status)] ?? responses.default;
  if (!response) {
    throw new Error(
      `OpenAPI response not found: ${method.toUpperCase()} ${endpointPath} ${status}`,
    );
  }

  const jsonSchema = response.content?.["application/json"]?.schema;
  if (!jsonSchema) {
    throw new Error(
      `OpenAPI JSON schema not found: ${method.toUpperCase()} ${endpointPath} ${status}`,
    );
  }

  return jsonSchema;
};

export const validateResponseAgainstOpenApi = async (
  input: ValidateResponseInput,
) => {
  const spec = await loadSpec();
  const schema = getResponseSchema(
    spec,
    input.method,
    input.path,
    input.status,
  );
  const cacheKey = `${input.method}:${input.path}:${input.status}`;
  const validator = validatorCache.get(cacheKey) ?? ajv.compile(schema);

  if (!validatorCache.has(cacheKey)) {
    validatorCache.set(cacheKey, validator);
  }

  const valid = validator(input.body);
  if (valid) {
    return;
  }

  const details = (validator.errors ?? [])
    .map(
      (error: ErrorObject) =>
        `${error.instancePath || "/"} ${error.message ?? "schema violation"}`,
    )
    .join("; ");

  throw new Error(
    [
      "OpenAPI contract mismatch",
      `${input.method.toUpperCase()} ${input.path} ${input.status}`,
      `details: ${details || "unknown"}`,
      `body: ${JSON.stringify(input.body)}`,
    ].join(" | "),
  );
};

export const assertJsonResponseMatchesOpenApi = async (
  res: Response,
  input: Omit<ValidateResponseInput, "status" | "body">,
) => {
  const body = await res.json();
  await validateResponseAgainstOpenApi({
    ...input,
    status: res.status,
    body,
  });
  return body;
};
