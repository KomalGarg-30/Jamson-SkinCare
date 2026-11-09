import { z } from "zod";

export const passwordSchema = z.string()
  .min(10, "Password must be at least 10 characters.")
  .max(128, "Password must be 128 characters or fewer.")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
  .regex(/[a-z]/, "Password must include at least one lowercase letter.")
  .regex(/\d/, "Password must include at least one number.")
  .regex(/[^A-Za-z0-9]/, "Password must include at least one special character.");

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  phone: z.string().trim().min(7).max(30),
  password: passwordSchema,
});

export const loginSchema = z.object({ email: z.email(), password: z.string().min(1).max(128) });

export const addressSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  line1: z.string().trim().min(3).max(255),
  line2: z.string().trim().max(255).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().min(3).max(20),
  country: z.string().trim().min(2).max(100).default("India"),
  isDefault: z.boolean().default(false),
});

export const addCartSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(20).default(1),
});
