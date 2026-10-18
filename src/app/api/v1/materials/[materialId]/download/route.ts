import { NextResponse } from "next/server";
import { requireApproved } from "@/modules/auth/guard";
import { getMaterialFile } from "@/modules/materials/materials.service";
import { errorResponse } from "@/lib/errors/api-error";

export async function GET(req: Request, props: { params: Promise<{ materialId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const file = await getMaterialFile(params.materialId, context);

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
