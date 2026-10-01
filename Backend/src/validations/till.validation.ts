import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const tillDaySchema = z.object({
  query: z
    .object({
      date: dateString.optional(),
      from: dateString.optional(),
      to: dateString.optional(),
      branchId: z.string().uuid().optional(),
    })
    .superRefine((value, ctx) => {
      const from = value.from || value.date;
      const to = value.to || value.date || value.from;
      if (!from || !to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Provide date, or from and to',
          path: ['from'],
        });
        return;
      }
      if (to < from) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'To Date cannot be earlier than From Date',
          path: ['to'],
        });
      }
    }),
});

export const tillOpenSchema = z.object({
  body: z.object({
    opening: z.number().min(0),
    branchId: z.string().uuid().optional(),
  }),
});

export const tillPaidOutSchema = z.object({
  body: z.object({
    particular: z.string().min(1),
    amount: z.number().positive(),
    branchId: z.string().uuid().optional(),
  }),
});

export const tillCloseSchema = z.object({
  body: z.object({
    cashflow_id: z.string().uuid(),
    closing: z.number().min(0),
  }),
});

export const tillReopenSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});
