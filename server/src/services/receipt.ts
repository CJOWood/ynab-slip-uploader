import type { Receipt } from "shared";
import {
  createTransaction,
  getAllCategories,
  getAllPayees,
} from "./budget";
import { parseReceipt, buildPrompt } from "./gen-ai";
import { getStorageService } from "./storage";
import env from "../utils/env-vars";
import { logger } from "../utils/logger";

const storageService = getStorageService();

export type ReceiptProgressHandler = (
  event: string,
  data?: unknown,
) => void | Promise<void>;

export const processAndUploadReceipt = async (
  account: string,
  file: File,
  onProgress?: ReceiptProgressHandler,
): Promise<Receipt> => {
  logger.debug("processAndUploadReceipt called", { account, fileType: file.type, fileSize: file.size });
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  await onProgress?.("upload-start");

  // Get the list of available YNAB categories
  const ynabCategories = await getAllCategories();
  await onProgress?.("categories-loaded", ynabCategories);

  let receipt: Receipt | null = null;

  let ynabPayees = env.YNAB_INCLUDE_PAYEES_IN_PROMPT
    ? await getAllPayees()
    : null;
  logger.debug("YNAB categories and payees fetched", { ynabCategories, ynabPayees });
  try {
    await onProgress?.("request-gemini", buildPrompt(null));
    receipt = await parseReceipt(
      fileBuffer,
      file.type,
      ynabCategories,
      ynabPayees,
    );

    if (!receipt) {
      throw new Error("Receipt was supposedly parsed but null was returned.");
    }
    logger.info("Receipt parsed successfully");
  } catch (err) {
    logger.error(`Failed to parse the receipt:`, err);
    throw new ReceiptParseError();
  }

  try {
    await onProgress?.("request-ynab");
    await createTransaction(
      account,
      receipt.merchant,
      receipt.category,
      receipt.transactionDate,
      receipt.memo,
      receipt.totalAmount,
      receipt.lineItems?.map((li) => ({
        category: li.category,
        amount: li.lineItemTotalAmount,
      })),
      receipt.totalTaxes
    );
    logger.info("Receipt imported into YNAB");
  } catch (err) {
    logger.error(`Failed to import the receipt into YNAB:`, err);
    throw new ReceiptYnabImportError();
  }

  if (storageService) {
    try {
      await onProgress?.("upload-file");
      await storageService.uploadFile(
        receipt.merchant,
        new Date(receipt.transactionDate),
        file,
      );
      logger.info("Receipt uploaded to storage");
    } catch (err) {
      logger.error(`Failed to upload the receipt:`, err);
      throw new ReceiptFileUploadError();
    }
  }
  logger.debug("processAndUploadReceipt completed", { receipt });
  return receipt;
};

export const uploadReceiptFile = async (
  merchant: string,
  transactionDate: string,
  file: File
): Promise<{
  success: true;
  storageInfo: {
    configured: boolean;
    type?: 'local' | 's3';
    location?: string;
  };
}> => {
  logger.debug("uploadReceiptFile called", { merchant, transactionDate, fileType: file.type, fileSize: file.size });
  
  if (!storageService) {
    logger.warn("No storage service configured. (This is expected if not configured)");
    return {
      success: true,
      storageInfo: {
        configured: false,
      },
    };
  }

  await storageService.uploadFile(
    merchant,
    new Date(transactionDate),
    file
  );
  
  logger.debug("uploadReceiptFile completed");
  
  // Determine storage type and location info
  const storageType = env.FILE_STORAGE;
  let location = '';
  
  if (storageType === 'local') {
    location = env.LOCAL_DIRECTORY || './uploads';
  } else if (storageType === 's3') {
    const bucket = env.S3_BUCKET;
    const prefix = env.S3_PATH_PREFIX;
    location = prefix ? `s3://${bucket}/${prefix}` : `s3://${bucket}`;
  }
  
  return {
    success: true,
    storageInfo: {
      configured: true,
      type: storageType,
      location,
    },
  };
};

export class ReceiptParseError extends Error {
  constructor() {
    super("Failed to parse the receipt");
    this.name = "ReceiptParseError";
  }
}

export class ReceiptYnabImportError extends Error {
  constructor() {
    super("Failed to import the receipt into YNAB");
    this.name = "ReceiptYnabImportError";
  }
}

export class ReceiptFileUploadError extends Error {
  constructor() {
    super("Failed to upload the receipt file");
    this.name = "ReceiptFileUploadError";
  }
}
