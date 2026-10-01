export type StaffUser = {
  id: string;
  fullName: string;
  username: string | null;
  email: string;
  role: "admin" | "front_desk" | "specialist";
  branchName: string | null;
  avatarUrl?: string | null;
  createdAt: string;
};

export type ClientUser = {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
  isRestricted?: boolean;
  phone?: string | null;
  gender?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
};
