import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const { rpcFailure } = await import("./server");

describe("rpcFailure", () => {
  it("explains a rejected move (e.g. the slot was just taken)", () => {
    expect(rpcFailure({ message: "MB_REJECTED:SLOT_TAKEN:This staff member already has a booking during that time" })).toEqual({
      code: "SLOT_TAKEN",
      message: "This staff member already has a booking during that time.",
      status: 409,
    });
  });

  it("blocks non-admins with 403", () => {
    expect(rpcFailure({ message: "MB_REJECTED:FORBIDDEN:Only Admins can manage branches" }).status).toBe(403);
  });

  it("points to the migration when the functions are missing", () => {
    expect(rpcFailure({ code: "PGRST202", message: "Could not find the function" }).code).toBe("NOT_MIGRATED");
  });
});
