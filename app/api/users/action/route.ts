import { prisma } from "@/lib/db";
import { verifyApprovalToken } from "@/lib/auth";

/**
 * Approve/reject a pending account from the notification email — the link
 * carries a signed token, so the owner doesn't need to be logged in.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const action = url.searchParams.get("action") ?? "";
  const token = url.searchParams.get("token") ?? "";

  const page = (title: string, body: string, ok: boolean) =>
    new Response(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
      <body style="font-family: Georgia, serif; background:#0f192b; color:#f7f5f0; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0;">
        <div style="text-align:center; padding: 40px; border: 1px solid rgba(201,162,39,.4); border-radius: 12px; max-width: 420px;">
          <div style="letter-spacing:4px; color:#c9a227; font-size: 14px;">KAVIARI CELLAR</div>
          <h1 style="font-size: 22px; margin: 18px 0;">${ok ? "✓" : "✕"} ${title}</h1>
          <p style="color:#d6d2c6;">${body}</p>
        </div>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );

  if (
    (action !== "approve" && action !== "reject") ||
    !id ||
    !verifyApprovalToken(id, action, token)
  ) {
    return page(
      "Invalid link",
      "This approval link is invalid or has expired.",
      false
    );
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return page("User not found", "This account no longer exists.", false);
  }
  if (user.role === "owner") {
    return page("Not allowed", "The owner account cannot be modified.", false);
  }

  await prisma.user.update({
    where: { id },
    data: { status: action === "approve" ? "approved" : "rejected" },
  });

  return page(
    action === "approve" ? "Access approved" : "Access rejected",
    action === "approve"
      ? `${user.name} (${user.email}) can now sign in.`
      : `${user.name} (${user.email}) has been declined.`,
    action === "approve"
  );
}
