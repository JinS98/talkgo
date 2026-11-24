export interface Membership { workspaceId: string; name: string; role: 'owner' | 'member' }
export interface Invite { inviteId: string; email: string; status: string; expiresAt: string }
