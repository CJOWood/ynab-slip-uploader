import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerationConfig,
} from "@google/generative-ai";
import env from "../utils/env-vars";
import type { Receipt } from "shared";
import { logger } from "../utils/logger";
import fs from "fs/promises";
import path from "path";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: env.GEMINI_MODEL,
  systemInstruction: `Please process this receipt slip. Categorize each line item individually based on the line item description. You should also provide a category for the entire slip based on the highest spent category in the line items. If there are no line items, use the name of the merchant to try and determine the category. Provide a very short memo which summarises what products were purchased. Output the transaction date in the format: 'YYYY-MM-DD'. If the slip doesn't have the full date, use the current date, which is ${new Date().toDateString()}, to try determine the full date. Try to include total taxes paid.`,
});

const USE_MOCK_AI = Boolean(env.USE_MOCK_AI);
const MOCK_AI_RECEIPT_FILE = process.env.FILE || "parseReceipt-ikea-single-category.json";
const MOCKS_DIR = path.resolve(__dirname, "../../dev/ai-mocks");

const getGeneratingConfig = (
  availableEnvelopes: string[]
): GenerationConfig => ({
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 16384,
  responseMimeType: "application/json",
  responseSchema: {
    type: SchemaType.OBJECT,
    properties: {
      merchant: {
        type: SchemaType.STRING,
      },
      transactionDate: {
        type: SchemaType.STRING,
      },
      memo: {
        type: SchemaType.STRING,
      },
      totalTaxes: {
        type: SchemaType.NUMBER,
      },
      totalAmount: {
        type: SchemaType.NUMBER,
      },
      lineItems: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            productName: {
              type: SchemaType.STRING,
            },
            quantity: {
              type: SchemaType.NUMBER,
            },
            lineItemTotalAmount: {
              type: SchemaType.NUMBER,
            },
            category: {
              type: SchemaType.STRING,
              enum: availableEnvelopes,
            },
          },
          required: ["productName", "category", "lineItemTotalAmount"],
        },
      },
      category: {
        type: SchemaType.STRING,
        enum: availableEnvelopes,
      },
    },
    required: [
      "merchant",
      "totalAmount",
      "transactionDate",
      "category",
      "memo",
    ],
  },
});

export const buildPrompt = (existingPayees: string[] | null) =>
  `Process this slip. Make sure you ONLY use a category in the list of available enum values. ${
        existingPayees
          ? `\n\nConsider the following existing merchants and pick the most appropriate one. If none are appropriate, use the merchant name from the receipt:\n${existingPayees
              .map((p) => `- ${p}`)
              .join("\n")}`
          : ""
  }`;

export const parseReceipt = async (
  image: Buffer,
  mimeType: string,
  availableEnvelopes: string[],
  existingPayees: string[] | null = null
): Promise<Receipt | null> => {
  logger.debug("parseReceipt called");
  if (USE_MOCK_AI) {
    try {
      const mockPath = path.join(MOCKS_DIR, MOCK_AI_RECEIPT_FILE);
      logger.debug("Using mock AI response from", { mockPath });
      const file = await fs.readFile(mockPath, "utf-8");
      return JSON.parse(file);
    } catch (err) {
      logger.error("Failed to load mock AI file", err);
      return null;
    }
  }
  const chatSession = model.startChat({
    generationConfig: getGeneratingConfig(availableEnvelopes),
    history: [],
  });
  const result = await chatSession.sendMessage([
    {
      text: `Process this slip. Make sure you ONLY use a category in the list of available category enum values. ${
        existingPayees
          ? `\n\nConsider the following existing merchants and pick the most appropriate one. If none are appropriate, use the merchant name from the receipt:\n${existingPayees
              .map((p) => `- ${p}`)
              .join("\n")}`
          : ""
      }`,
    },
    {
      inlineData: {
        data: image.toString("base64"),
        mimeType,
      },
    },
  ]);
  logger.debug("parseReceipt got response", { response: result.response.text() });
  try {
    return JSON.parse(result.response.text());
  } catch (err) {
    logger.error(`Failed to parse receipt:`, err);
    return null;
  }
};
