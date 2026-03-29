import { z } from "zod";

export const envSchema = z.object({
  ADMIN_API_KEY: z
    .string()
    .min(1, "ADMIN_API_KEY is required for admin endpoints"),
});

export const env = {
  get ADMIN_API_KEY() {
    return envSchema.shape.ADMIN_API_KEY.parse(process.env.ADMIN_API_KEY);
  },
};
