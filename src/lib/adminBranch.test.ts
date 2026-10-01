import { describe, expect, it } from "vitest";
import { pickBranch, readAdminBranchCookie } from "./adminBranch";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("adminBranch", () => {
  it("reads only a valid branch id from the cookie", () => {
    expect(readAdminBranchCookie(`x=1; gs_admin_branch=${A}; y=2`)).toBe(A);
    expect(readAdminBranchCookie("gs_admin_branch=nope")).toBeNull();
    expect(readAdminBranchCookie("")).toBeNull();
  });

  it("picks the chosen, own, or first branch", () => {
    expect(pickBranch([A, B], B, A)).toBe(B);
    expect(pickBranch([A, B], "gone", B)).toBe(B);
    expect(pickBranch([A, B], null, null)).toBe(A);
    expect(pickBranch([], null, null)).toBeNull();
  });
});
