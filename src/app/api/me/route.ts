import { NextResponse } from "next/server";

import { accessEmail, accessRequired } from "@/lib/access";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { envOwner, roleOf, TAB_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Who the browser is and which tabs it may open. The UI asks for this before
 * rendering anything, so a client never even sees the ads tabs exist.
 */
export async function GET(request: Request) {
  if (!accessRequired()) {
    return NextResponse.json({
      email: envOwner() || "dev@localhost",
      role: "owner",
      tabs: Object.keys(TAB_ROLES),
    });
  }

  const email = await accessEmail(request);
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { env } = getCloudflareContext();
  const role = await roleOf(env.DB, email);
  if (!role) {
    return NextResponse.json(
      { error: "no_access", message: "This account isn't on the dashboard's list yet." },
      { status: 403 },
    );
  }

  return NextResponse.json({
    email,
    role,
    tabs: Object.entries(TAB_ROLES)
      .filter(([, roles]) => roles.includes(role))
      .map(([tab]) => tab),
  });
}
