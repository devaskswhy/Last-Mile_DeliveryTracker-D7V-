import { ok } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Customer search for the admin "create on behalf of" flow.
 *
 * Restricted to the CUSTOMER role: an admin creating an order for another admin
 * or for an agent is not a case this platform has, and allowing it would put
 * staff accounts in a customer-facing picker.
 */
export async function GET(request: Request) {
  return adminRoute(async () => {
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

    const customers = await prisma.user.findMany({
      where: {
        role: "CUSTOMER",
        isActive: true,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" as const } },
                { email: { contains: query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 20,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        _count: { select: { orders: true } },
      },
    });

    return ok({
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        orderCount: c._count.orders,
      })),
    });
  });
}
