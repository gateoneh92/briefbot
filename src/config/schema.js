// src/config/schema.js
import { z } from 'zod';

const FeedSchema = z.object({
  url: z.string().url({ message: 'Feed URL must be a valid URL' }),
  category: z.string().min(1, { message: 'Feed category must not be empty' }),
});

const ScheduleSchema = z.object({
  hour: z.number().int().min(0).max(23, { message: 'schedule.hour must be 0–23' }),
});

const EmailSchema = z.object({
  to: z.string().email({ message: 'email.to must be a valid email address' }),
});

export const ConfigSchema = z.object({
  feeds: z
    .array(FeedSchema)
    .min(1, { message: 'config.json must contain at least one feed' }),
  schedule: ScheduleSchema,
  email: EmailSchema,
});
