import { eq } from "drizzle-orm";
import { db, projects } from "@vrt/db";
import { getOptionalUser } from "@/lib/auth/user";
import { isAdmin } from "@/lib/authz";
import { getLiveBroker } from "@/lib/live/broker";
import { ensureLiveBridge } from "@/lib/live/bridge";
import { createEventScope } from "@/lib/live/event-scope";
import { loadSnapshotEvent } from "@/lib/live/source";
import { createEventStreamResponse } from "./handler";

// This route holds a Redis subscription for as long as the client is
// connected: it must never be statically optimized, and it needs the Node
// runtime for ioredis.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getOptionalUser();
  if (!user) {
    return new Response(null, { status: 401 });
  }
  ensureLiveBridge();
  const scope = createEventScope({
    isAdmin: isAdmin(user),
    loadOwnedProjectIds: async () =>
      (
        await db.query.projects.findMany({
          where: eq(projects.ownerId, user.id),
          columns: { id: true },
        })
      ).map((project) => project.id),
  });
  await scope.prime();
  return createEventStreamResponse(
    { broker: getLiveBroker(), loadSnapshot: loadSnapshotEvent, filter: scope.filter },
    request.signal,
  );
}
