import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, ownerEmail } from "@/lib/auth";
import { DEPARTMENTS } from "@/lib/permissions";

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  department: z.string().max(60).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          "Please fill in every field. The password must be at least 8 characters.",
      },
      { status: 400 }
    );
  }
  const email = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const department = DEPARTMENTS.includes(
    parsed.data.department as (typeof DEPARTMENTS)[number]
  )
    ? parsed.data.department!
    : "";

  // The owner account is the one named by OWNER_EMAIL; everyone else waits for
  // approval, because this app releases goods.
  const isOwner = email === ownerEmail();
  await prisma.user.create({
    data: {
      email,
      name: parsed.data.name.trim(),
      passwordHash: hashPassword(parsed.data.password),
      role: isOwner ? "owner" : "member",
      department: isOwner ? "Management" : department,
      status: isOwner ? "approved" : "pending",
    },
  });

  return Response.json(
    {
      ok: true,
      approved: isOwner,
      message: isOwner
        ? "Owner account created — you can sign in."
        : "Account created. It is waiting for approval by the owner.",
    },
    { status: 201 }
  );
}
