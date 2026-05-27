import * as Joi from "joi";

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "production", "test").default("development"),
  PORT: Joi.number().port().default(3010),
  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().required(),
  ADMIN_JWT_SECRET: Joi.string().min(32).required(),
  INTEGRATION_SERVICE_SECRET: Joi.string().min(32).required(),
  FIREBASE_PROJECT_ID: Joi.string().allow(""),
  FIREBASE_CLIENT_EMAIL: Joi.string().allow(""),
  FIREBASE_PRIVATE_KEY: Joi.string().allow(""),
  CORS_ORIGIN: Joi.string().allow(""),
  /** WebApp Nest API — member registry search (name / member ID). Local: http://localhost:3000 */
  WEBAPP_API_URL: Joi.string().uri().allow(""),
});
