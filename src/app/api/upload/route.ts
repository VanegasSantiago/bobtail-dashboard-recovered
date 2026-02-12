import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startWorker } from "@/lib/worker-manager";
import { requireOperator } from "@/lib/auth-api";

interface CSVRow {
  "Email Only": string;
  "Debtor Name": string;
  "Debtor DOT": string;
  "Debtor MC": string;
  "Carrier Name": string;
  "Client DOT": string;
  "Client MC": string;
  "Load Number": string;
  "Amount": string;
  "Phone Number": string;
  "Debtor Email": string;
  "Timezone": string;
}

interface DebtorData {
  debtorName: string;
  debtorMc: string | null;
  debtorDot: string | null;
  phoneNumber: string;
  debtorEmail: string | null;
  timezone: string | null;
  invoices: InvoiceData[];
}

interface InvoiceData {
  loadNumber: string;
  carrierName: string | null;
  clientMc: string | null;
  clientDot: string | null;
  amount: number;
  emailOnly: boolean;
}

// Simple CSV parser that handles quoted fields with commas
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header.trim()] = values[idx]?.trim() ?? "";
      });
      rows.push(row);
    }
  }

  return rows;
}

// Parse a single CSV line, handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// Format phone number: clean up but preserve as-is (no automatic +1)
function formatPhone(phone: string): string {
  // Keep only digits and + sign, preserve the original format
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned || "";
}

// Generate campaign name from filename
function generateCampaignName(filename: string): string {
  // Remove extension and clean up
  const baseName = filename.replace(/\.[^/.]+$/, "");
  // Replace underscores/hyphens with spaces and clean up
  const cleaned = baseName
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Add date if name is generic
  if (cleaned.toLowerCase() === "collections" || cleaned.length < 3) {
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `Collections ${date}`;
  }
  return cleaned;
}

export async function POST(request: Request) {
  // Only operators and admins can upload
  const authResult = await requireOperator();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ message: "No file provided" }, { status: 400 });
    }

    // Check file extension
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".csv")) {
      return NextResponse.json(
        { message: "Please upload a CSV file" },
        { status: 400 }
      );
    }

    // Read and parse CSV
    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json(
        { message: "No data found in the CSV file" },
        { status: 400 }
      );
    }

    // Validate required columns
    const requiredColumns = ["Debtor Name", "Phone Number", "Load Number", "Amount"];
    const firstRow = rows[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    if (missingColumns.length > 0) {
      return NextResponse.json(
        { message: `Missing required columns: ${missingColumns.join(", ")}` },
        { status: 400 }
      );
    }

    // Deactivate any currently active campaign
    await prisma.campaign.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Create new campaign
    const campaign = await prisma.campaign.create({
      data: {
        name: generateCampaignName(file.name),
        sourceFile: file.name,
        status: "ACTIVE",
        isActive: true,
        isQueuePaused: false,
      },
    });

    // Group rows by Debtor Name
    const debtorMap = new Map<string, DebtorData>();
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as unknown as CSVRow;
      const rowNum = i + 2; // Account for header row

      const debtorName = row["Debtor Name"]?.trim();
      if (!debtorName) {
        errors.push(`Row ${rowNum}: Missing Debtor Name`);
        continue;
      }

      const phoneNumber = formatPhone(row["Phone Number"] || "");
      if (!phoneNumber) {
        errors.push(`Row ${rowNum}: Missing or invalid Phone Number`);
        continue;
      }

      const amount = parseFloat(row["Amount"]?.replace(/[,$]/g, "") || "0");
      if (isNaN(amount) || amount <= 0) {
        errors.push(`Row ${rowNum}: Invalid Amount`);
        continue;
      }

      const loadNumber = row["Load Number"]?.trim();
      if (!loadNumber) {
        errors.push(`Row ${rowNum}: Missing Load Number`);
        continue;
      }

      // Create key for grouping (debtor name + MC for uniqueness)
      const debtorKey = `${debtorName}|${row["Debtor MC"] || ""}`;

      if (!debtorMap.has(debtorKey)) {
        debtorMap.set(debtorKey, {
          debtorName,
          debtorMc: row["Debtor MC"]?.trim() || null,
          debtorDot: row["Debtor DOT"]?.trim() || null,
          phoneNumber,
          debtorEmail: row["Debtor Email"]?.trim() || null,
          timezone: row["Timezone"]?.trim() || null,
          invoices: [],
        });
      }

      // Add invoice to this debtor
      const emailOnly = row["Email Only"]?.toUpperCase() === "TRUE";
      debtorMap.get(debtorKey)!.invoices.push({
        loadNumber,
        carrierName: row["Carrier Name"]?.trim() || null,
        clientMc: row["Client MC"]?.trim() || null,
        clientDot: row["Client DOT"]?.trim() || null,
        amount,
        emailOnly,
      });
    }

    // Create Debtor and Invoice records
    let totalDebtors = 0;
    let totalInvoices = 0;
    let totalAmount = 0;
    let emailOnlyDebtors = 0;
    let callableDebtors = 0;
    let debtorNumber = 1; // Sequential ID starting at 1

    for (const [, data] of debtorMap) {
      const debtorAmount = data.invoices.reduce((sum, inv) => sum + inv.amount, 0);

      // Check if ALL invoices for this debtor are email-only
      const isEmailOnly = data.invoices.every(inv => inv.emailOnly);

      try {
        await prisma.debtor.create({
          data: {
            campaignId: campaign.id,
            debtorNumber: debtorNumber,
            debtorName: data.debtorName,
            debtorMc: data.debtorMc,
            debtorDot: data.debtorDot,
            phoneNumber: data.phoneNumber,
            debtorEmail: data.debtorEmail,
            timezone: data.timezone,
            totalAmount: debtorAmount,
            numInvoices: data.invoices.length,
            emailOnly: isEmailOnly,
            invoices: {
              create: data.invoices.map(inv => ({
                loadNumber: inv.loadNumber,
                carrierName: inv.carrierName,
                clientMc: inv.clientMc,
                clientDot: inv.clientDot,
                amount: inv.amount,
                emailOnly: inv.emailOnly,
              })),
            },
          },
        });

        debtorNumber++;
        totalDebtors++;
        totalInvoices += data.invoices.length;
        totalAmount += debtorAmount;

        if (isEmailOnly) {
          emailOnlyDebtors++;
        } else {
          callableDebtors++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Debtor "${data.debtorName}": ${message}`);
      }
    }

    // Update campaign with totals
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        totalDebtors,
        totalInvoices,
        totalAmount,
        emailOnlyDebtors,
        callableDebtors,
      },
    });

    // AUTO-QUEUE: Automatically add all callable debtors to the queue
    const callableDebtorRecords = await prisma.debtor.findMany({
      where: {
        campaignId: campaign.id,
        emailOnly: false,
      },
      select: { id: true },
    });

    if (callableDebtorRecords.length > 0) {
      await prisma.call.createMany({
        data: callableDebtorRecords.map((debtor) => ({
          debtorId: debtor.id,
          campaignId: campaign.id,
          attemptNumber: 1,
          status: "PENDING",
          callOutcome: "PENDING",
        })),
      });

      // AUTO-START WORKER: Start the in-process worker to handle the queue
      const workerResult = startWorker();
      console.log("[Upload] Worker start result:", workerResult);
    }

    return NextResponse.json({
      success: errors.length === 0,
      campaignId: campaign.id,
      campaignNumber: campaign.campaignNumber,
      campaignName: campaign.name,
      totalRows: rows.length,
      totalDebtors,
      callableDebtors,
      emailOnlyDebtors,
      totalInvoices,
      totalAmount: Math.round(totalAmount * 100) / 100,
      callsQueued: callableDebtorRecords.length,
      workerStarted: callableDebtorRecords.length > 0,
      errors: errors.slice(0, 100),
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 }
    );
  }
}
