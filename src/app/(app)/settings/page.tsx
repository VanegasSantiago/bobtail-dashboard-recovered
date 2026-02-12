"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  invitedBy: string;
  createdAt: string;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("VIEWER");
  const [isInviting, setIsInviting] = useState(false);

  // Check if current user is admin
  const isAdmin = session?.user?.role === "ADMIN";

  // Fetch users and invites
  const fetchData = async () => {
    try {
      const [usersRes, invitesRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/users/invite"),
      ]);

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.users || []);
      }

      if (invitesRes.ok) {
        const invitesData = await invitesRes.json();
        setInvites(invitesData.invites || []);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  // Handle role change
  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });

      if (response.ok) {
        toast.success("Role updated successfully");
        fetchData();
      } else {
        const data = await response.json();
        toast.error(data.message || "Failed to update role");
      }
    } catch (error) {
      toast.error("Failed to update role");
    }
  };

  // Handle delete user
  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to delete ${userEmail}?`)) {
      return;
    }

    try {
      const response = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        toast.success("User deleted successfully");
        fetchData();
      } else {
        const data = await response.json();
        toast.error(data.message || "Failed to delete user");
      }
    } catch (error) {
      toast.error("Failed to delete user");
    }
  };

  // Handle invite
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    setIsInviting(true);
    try {
      const response = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.emailSent) {
          toast.success(`Invite email sent to ${inviteEmail}`);
        } else {
          toast.success(`Invite created for ${inviteEmail}. Tell them to sign in with this email to get ${inviteRole} access.`, {
            duration: 6000,
          });
        }
        setInviteEmail("");
        fetchData();
      } else {
        const data = await response.json();
        toast.error(data.message || "Failed to send invite");
      }
    } catch (error) {
      toast.error("Failed to send invite");
    } finally {
      setIsInviting(false);
    }
  };

  // Handle delete invite
  const handleDeleteInvite = async (email: string) => {
    try {
      const response = await fetch("/api/users/invite", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        toast.success("Invite removed");
        fetchData();
      } else {
        toast.error("Failed to remove invite");
      }
    } catch (error) {
      toast.error("Failed to remove invite");
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold" style={{ color: "var(--fg-primary)" }}>
            Access Denied
          </h1>
          <p className="mt-2" style={{ color: "var(--fg-secondary)" }}>
            You need admin permissions to access this page.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center" style={{ color: "var(--fg-secondary)" }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--fg-primary)" }}>
          Settings
        </h1>
        <p className="mt-1" style={{ color: "var(--fg-secondary)" }}>
          Manage users and system settings
        </p>
      </div>

      {/* Invite User Section */}
      <div className="rounded-lg border p-6" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-raised)" }}>
        <h2 className="text-lg font-medium mb-4" style={{ color: "var(--fg-primary)" }}>
          Invite User
        </h2>
        <form onSubmit={handleInvite} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--fg-secondary)" }}>
              Email Address
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
              style={{
                borderColor: "var(--border-subtle)",
                background: "var(--bg-primary)",
                color: "var(--fg-primary)",
              }}
              required
            />
          </div>
          <div className="w-full sm:w-40">
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--fg-secondary)" }}>
              Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
              style={{
                borderColor: "var(--border-subtle)",
                background: "var(--bg-primary)",
                color: "var(--fg-primary)",
              }}
            >
              <option value="VIEWER">Viewer</option>
              <option value="OPERATOR">Operator</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isInviting || !inviteEmail}
            className="rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: "var(--accent-primary)" }}
          >
            {isInviting ? "Inviting..." : "Send Invite"}
          </button>
        </form>
        <p className="mt-3 text-xs" style={{ color: "var(--fg-muted)" }}>
          When this user signs in with Google or email, they'll automatically get the selected role.
        </p>
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="rounded-lg border" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="border-b px-6 py-4" style={{ borderColor: "var(--border-subtle)" }}>
            <h2 className="text-lg font-medium" style={{ color: "var(--fg-primary)" }}>
              Pending Invites ({invites.length})
            </h2>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between px-6 py-4"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div>
                  <p className="font-medium" style={{ color: "var(--fg-primary)" }}>
                    {invite.email}
                  </p>
                  <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
                    Invited by {invite.invitedBy} as {invite.role}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteInvite(invite.email)}
                  className="rounded px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ color: "var(--fg-error)" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users List */}
      <div className="rounded-lg border" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-6 py-4" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-lg font-medium" style={{ color: "var(--fg-primary)" }}>
            Users ({users.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-raised)" }}>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "var(--fg-secondary)" }}>
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "var(--fg-secondary)" }}>
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "var(--fg-secondary)" }}>
                  Joined
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide" style={{ color: "var(--fg-secondary)" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {users.map((user) => {
                const isCurrentUser = session?.user?.id === user.id;
                return (
                  <tr key={user.id} style={{ borderColor: "var(--border-subtle)" }}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span style={{ color: "var(--fg-primary)" }}>{user.email}</span>
                        {isCurrentUser && (
                          <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--accent-primary)", color: "white" }}>
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={isCurrentUser}
                        className="rounded border px-2 py-1 text-sm outline-none transition-colors focus:border-[var(--accent-primary)] disabled:opacity-50"
                        style={{
                          borderColor: "var(--border-subtle)",
                          background: "var(--bg-primary)",
                          color: "var(--fg-primary)",
                        }}
                      >
                        <option value="VIEWER">Viewer</option>
                        <option value="OPERATOR">Operator</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: "var(--fg-secondary)" }}>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {!isCurrentUser && (
                        <button
                          onClick={() => handleDeleteUser(user.id, user.email)}
                          className="rounded px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
                          style={{ color: "var(--fg-error)" }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
