import { z } from "zod";

const envScheme = z.object({
  GEMINI_API_KEY: z.string().nonempty(),
  GEMINI_MODEL: z.string().nonempty(),
  YNAB_API_KEY: z.string().nonempty(),
  YNAB_BUDGET_ID: z.string().nonempty(),
  YNAB_CATEGORY_GROUPS: z
    .string()
    .optional()
    .transform((str) => str?.split(",") || []),
  YNAB_INCLUDE_PAYEES_IN_PROMPT: z.preprocess(
    (val) => `${val}`.toLowerCase() !== "false",
    z.boolean()
  ),
  APP_PORT: z
    .string()
    .optional()
    .transform((str) => (str && parseInt(str)) || parseInt(process.env.PORT || "3000")),
  APP_API_KEY: z.string().nonempty(),
  APP_API_SECRET: z.string().nonempty(),
  APP_TRUSTED_IPS: z
    .string()
    .optional()
    .transform((str) => str?.split(",").map((s) => s.trim()).filter(Boolean) || []),
  APP_DISABLE_AUTH: z.preprocess(
    (val) => `${val}`.toLowerCase() === "true",
    z.boolean(),
  ),
  MAX_FILE_SIZE: z
    .string()
    .optional()
    // Default file size is 5MB
    .transform((str) => (str && parseInt(str)) || 5242880),
  FILE_STORAGE: z.enum(["local", "s3"]).optional(),
  DATE_SUBDIRECTORIES: z.preprocess(
    (val) => `${val}`.toLowerCase() !== "false",
    z.boolean()
  ),
  // Validate all of these separately when create the storage service
  LOCAL_DIRECTORY: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_PATH_PREFIX: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  NODE_ENV: z.string().optional().default("development"),
  USE_MOCK_AI: z.preprocess(
    (val) => `${val}`.toLowerCase() === "true" || `${val}` === "1",
    z.boolean()
  ).optional().default(false),
  MOCK_AI_RECEIPT_FILE: z.string().optional(),
});

const env = envScheme.parse(process.env);

export default env;
