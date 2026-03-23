import { z } from "zod";
import { publicProcedure } from "../../trpc.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { paynowGenerator } = require("paynow-generator");

export const inputSchema = z.object({
  /** 8-digit SG mobile number without country code, e.g. "91234567" */
  mobileNumber: z
    .string()
    .regex(
      /^[89]\d{7}$/,
      "Must be a valid 8-digit SG mobile number starting with 8 or 9"
    ),
  /** Amount in SGD */
  amount: z.number().min(0),
  /** Merchant / payee name */
  merchantName: z.string().max(25).default(""),
  /** Whether the payer can edit the amount */
  editable: z.boolean().default(true),
});

export const outputSchema = z.object({
  qrString: z.string(),
});

export const generatePayNowQRHandler = (input: z.infer<typeof inputSchema>) => {
  const qrString: string = paynowGenerator(
    "mobile",
    input.mobileNumber,
    input.editable ? "yes" : "no",
    input.amount,
    input.merchantName,
    "" // additionalComments — empty string avoids the null bug
  );

  return { qrString };
};

export default publicProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(({ input }) => {
    return generatePayNowQRHandler(input);
  });
