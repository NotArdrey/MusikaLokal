export const normalizeUserRole = (role: unknown): string | null => {
    if (typeof role !== 'string') {
        return null;
    }

    const normalizedRole = role.trim().toLowerCase().replace(/[_\s]+/g, '-');
    return normalizedRole.length > 0 ? normalizedRole : null;
};

type ResolveRoleRouteOptions = {
    fallback?: string;
    adminRoute?: string;
};

export const resolveRoleManageRoute = (
    role: unknown,
    { fallback = '/manage', adminRoute }: ResolveRoleRouteOptions = {},
): string => {
    const normalizedRole = normalizeUserRole(role);

    if (normalizedRole === 'studio-owner' || normalizedRole === 'studio') {
        return '/my_studio';
    }

    if (normalizedRole === 'venue-owner' || normalizedRole === 'venue') {
        return '/my_venue';
    }

    if (
        normalizedRole === 'producer' ||
        normalizedRole === 'production' ||
        normalizedRole === 'production-user'
    ) {
        return '/my_production';
    }

    if (
        normalizedRole === 'musician' ||
        normalizedRole === 'manager' ||
        normalizedRole === 'musician-member'
    ) {
        return '/my_group';
    }

    if (normalizedRole === 'admin' && adminRoute) {
        return adminRoute;
    }

    return fallback;
};