import { NextResponse } from "next/server";
import { requireApproved } from "@/modules/auth/guard";
import { getSubmissionFile } from "@/modules/assignments/assignments.service";
import { errorResponse } from "@/lib/errors/api-error";

export async function GET(req: Request, props: { params: Promise<{ submissionId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const file = await getSubmissionFile(params.submissionId, context);

    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.fileName)}"`,
        "Content-Length": file.buffer.length.toString(),
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
