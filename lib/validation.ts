import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email(),
  password: z.string().min(10).max(128),
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
