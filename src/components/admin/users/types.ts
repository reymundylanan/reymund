export type StaffUser = {
  id: string;
  fullName: string;
  username: string | null;
  email: string;
  role: "admin" | "front_desk" | "specialist";
  branchName: string | null;
  createdAt: string;
};

export type ClientUser = {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
};
